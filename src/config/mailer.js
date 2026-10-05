import nodemailer from 'nodemailer'
import logger from './logger.js'
import { getSiteName } from '../services/site.service.js'

const SMTP_HOST   = process.env.SMTP_HOST
const SMTP_PORT   = Number(process.env.SMTP_PORT) || 587
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' // true pour le port 465
const SMTP_USER   = process.env.SMTP_USER
const SMTP_PASS   = process.env.SMTP_PASS
const MAIL_FROM   = process.env.MAIL_FROM || SMTP_USER
// Only the address of MAIL_FROM is kept ("Name <addr>" or "addr"): the display name is the site name
const MAIL_FROM_ADDRESS = (/<([^>]+)>/.exec(MAIL_FROM || '')?.[1] || MAIL_FROM || '').trim()

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
})

export async function sendMail({ to, cc, subject, text, html, attachments }) {
  try {
    const from = { name: await getSiteName(), address: MAIL_FROM_ADDRESS }
    const info = await transporter.sendMail({ from, to, cc, subject, text, html, attachments })
    logger.info(`Mail envoyé à ${to} (${info.messageId})`)
    return info
  } catch (err) {
    logger.error(`Échec de l'envoi du mail à ${to}: ${err.message}`)
    throw err
  }
}

export async function verifyMailer() {
  return transporter.verify()
}

export default transporter

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export async function passwordResetEmail({ name, account, link, color = '#16a34a' }) {
  const site = await getSiteName()
  return {
    subject: `${site} — Réinitialisation du mot de passe`,
    text: `Bonjour ${name},\n\nPour réinitialiser le mot de passe de votre compte (${account}), ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    html: `<p>Bonjour ${escapeHtml(name)},</p>
<p>Pour réinitialiser le mot de passe de votre compte <strong>${escapeHtml(account)}</strong>, cliquez sur le lien ci-dessous (valable 1 heure) :</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:${color};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Réinitialiser mon mot de passe</a></p>
<p style="color:#6b7280;font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
  }
}

export async function newRegistrationEmail({ pharmacy, admin, link }) {
  const site = await getSiteName()
  const siteHtml = escapeHtml(site)
  const rows = [
    ['Pharmacie', pharmacy.name],
    ['Ville', [pharmacy.city, pharmacy.country].filter(Boolean).join(', ')],
    ['Licence', pharmacy.license_number],
    ['Téléphone', pharmacy.phone],
    ['Administrateur', `${admin.name} <${admin.email}>`],
  ].filter(([, v]) => v)

  return {
    subject: `${site} — Nouvelle inscription : ${pharmacy.name}`,
    text: `Une nouvelle pharmacie vient de s'inscrire sur ${site}.\n\n${rows.map(([k, v]) => `${k} : ${v}`).join('\n')}\n\nVoir les pharmacies : ${link}`,
    html: `<p>Une nouvelle pharmacie vient de s'inscrire sur ${siteHtml}.</p>
<table style="border-collapse:collapse;font-size:14px;">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${k}</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(v)}</td></tr>`).join('')}</table>
<p><a href="${link}" style="display:inline-block;margin-top:8px;padding:10px 18px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Voir dans le panel Super Admin</a></p>`,
  }
}

export async function welcomeEmail({ pharmacy, admin, trialEnd, link }) {
  const site = await getSiteName()
  const siteHtml = escapeHtml(site)
  const trialEndLabel = trialEnd ? new Date(trialEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const trialLine = trialEndLabel ? `Votre période d'essai gratuite est active jusqu'au ${trialEndLabel}.` : ''

  return {
    subject: `Bienvenue sur ${site}, ${pharmacy.name} !`,
    text: `Bonjour ${admin.name},\n\nBienvenue sur ${site} ! Le compte de votre pharmacie « ${pharmacy.name} » est prêt.\n${trialLine}\n\nVous pouvez dès maintenant :\n- ajouter vos produits et lots\n- enregistrer vos ventes et réceptions\n- inviter votre équipe\n\nConnexion : ${link}\nIdentifiant : ${admin.email}\n\nL'équipe ${site}`,
    html: `<p>Bonjour ${escapeHtml(admin.name)},</p>
<p>Bienvenue sur <strong>${siteHtml}</strong> ! Le compte de votre pharmacie <strong>${escapeHtml(pharmacy.name)}</strong> est prêt.</p>
${trialLine ? `<p style="padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#166534;">${escapeHtml(trialLine)}</p>` : ''}
<p>Vous pouvez dès maintenant :</p>
<ul><li>ajouter vos produits et lots</li><li>enregistrer vos ventes et réceptions</li><li>inviter votre équipe</li></ul>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Accéder à mon espace</a></p>
<p style="color:#6b7280;font-size:13px;">Identifiant : ${escapeHtml(admin.email)}</p>
<p>L'équipe ${siteHtml}</p>`,
  }
}

export async function trialExpiringEmail({ pharmacy, daysLeft, endDate, link }) {
  const site = await getSiteName()
  const siteHtml = escapeHtml(site)
  const endLabel = new Date(endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const when     = daysLeft <= 1 ? 'demain' : `dans ${daysLeft} jours`

  return {
    subject: `${site} — Votre période d'essai se termine ${when}`,
    text: `Bonjour,\n\nLa période d'essai gratuite de « ${pharmacy.name} » se termine ${when} (le ${endLabel}).\n\nPour continuer à utiliser ${site} sans interruption, répondez à cet email pour activer votre abonnement.\n\nAccéder à votre espace : ${link}\n\nL'équipe ${site}`,
    html: `<p>Bonjour,</p>
<p style="padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;color:#92400e;">La période d'essai gratuite de <strong>${escapeHtml(pharmacy.name)}</strong> se termine <strong>${when}</strong> (le ${endLabel}).</p>
<p>Pour continuer à utiliser ${siteHtml} sans interruption, répondez à cet email pour activer votre abonnement.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Accéder à mon espace</a></p>
<p>L'équipe ${siteHtml}</p>`,
  }
}
