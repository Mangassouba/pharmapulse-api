import { eq, and, gt, lte, isNull } from 'drizzle-orm'
import db from '../config/database.js'
import { subscriptions, users, auditLogs, notifications } from '../db/schema.js'
import { sendMail, trialExpiringEmail } from '../config/mailer.js'
import { createAuditLog } from '../utils/audit.js'
import { notifySuperAdmins } from '../services/superNotification.service.js'
import { TRIAL_REMINDER_DAYS } from '../utils/subscription.js'
import logger from '../config/logger.js'
import { notif } from '../utils/notification.js'

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
const INTERVAL_MS  = 60 * 60 * 1000 // hourly
const DAY_MS       = 86400000
const STAGES       = [...TRIAL_REMINDER_DAYS].sort((a, b) => a - b)

/**
 * Email the pharmacy admins of every trial ending within the largest reminder window.
 * Each stage (J-7, J-1…) is sent once per subscription; sent stages are recorded in the
 * audit log (not user-deletable), so restarts and hourly runs never resend.
 */
export async function runTrialReminders() {
  const now = new Date()
  const trials = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, 'TRIAL'),
      gt(subscriptions.end_date, now),
      lte(subscriptions.end_date, new Date(now.getTime() + STAGES.at(-1) * DAY_MS)),
    ),
    with: { pharmacy: { columns: { id: true, name: true, email: true, deletedAt: true } } },
  })

  let sent = 0
  for (const sub of trials) {
    if (!sub.pharmacy || sub.pharmacy.deletedAt) continue

    const daysLeft = Math.ceil((sub.end_date - now) / DAY_MS)
    const stage    = STAGES.find(s => daysLeft <= s)
    const action   = `TRIAL_REMINDER_J${stage}`

    const already = await db.query.auditLogs.findFirst({
      where: and(eq(auditLogs.action, action), eq(auditLogs.entity, 'subscriptions'), eq(auditLogs.entity_id, sub.id)),
      columns: { id: true },
    })
    if (already) continue

    const admins = await db.query.users.findMany({
      where: and(eq(users.pharmacyId, sub.pharmacyId), eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE'), isNull(users.deletedAt)),
      columns: { name: true, email: true },
    })
    if (!admins.length) continue

    const adminEmails = admins.map(a => a.email.toLowerCase())
    const cc = sub.pharmacy.email && !adminEmails.includes(sub.pharmacy.email.toLowerCase()) ? sub.pharmacy.email : undefined

    try {
      await sendMail({
        to: admins.map(a => a.email),
        cc,
        ...await trialExpiringEmail({ pharmacy: sub.pharmacy, daysLeft, endDate: sub.end_date, link: `${FRONTEND_URL}/login` }),
      })
    } catch {
      continue // already logged by sendMail; retried on the next run
    }

    await db.insert(notifications).values({
      pharmacyId: sub.pharmacyId,
      ...notif(daysLeft <= 1 ? 'trial_ending_tomorrow' : 'trial_ending', { days: daysLeft }),
      type:    'INFO',
    })

    // Heads-up for the SuperAdmin, to follow up with the pharmacy before the trial ends
    await notifySuperAdmins({
      ...notif(daysLeft <= 1 ? 'super_trial_ending_tomorrow' : 'super_trial_ending',
        { days: daysLeft, pharmacy: sub.pharmacy.name, end_date: sub.end_date }),
      type:    'WARNING',
      link:    '/super/pharmacies',
      pharmacyId: sub.pharmacyId,
    })

    await createAuditLog({
      action,
      entity: 'subscriptions',
      entity_id: sub.id,
      new_values: { daysLeft, end_date: sub.end_date },
      pharmacyId: sub.pharmacyId,
    })
    sent++
  }

  if (sent) logger.info(`Rappels de fin d'essai envoyés : ${sent}`)
  return sent
}

let running = false

async function tick() {
  if (running) return
  running = true
  try { await runTrialReminders() }
  catch (err) { logger.error(`Rappels de fin d'essai: ${err.message}`) }
  finally { running = false }
}

export function startTrialReminderJob() {
  tick()
  setInterval(tick, INTERVAL_MS).unref()
}
