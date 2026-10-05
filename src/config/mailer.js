import nodemailer from 'nodemailer'
import logger from './logger.js'

const SMTP_HOST   = process.env.SMTP_HOST
const SMTP_PORT   = Number(process.env.SMTP_PORT) || 587
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' // true pour le port 465
const SMTP_USER   = process.env.SMTP_USER
const SMTP_PASS   = process.env.SMTP_PASS
const MAIL_FROM   = process.env.MAIL_FROM || SMTP_USER

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
})

export async function sendMail({ to, subject, text, html, attachments }) {
  try {
    const info = await transporter.sendMail({ from: MAIL_FROM, to, subject, text, html, attachments })
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

export function passwordResetEmail({ name, account, link, color = '#16a34a' }) {
  return {
    subject: 'PharmaPulse — Réinitialisation du mot de passe',
    text: `Bonjour ${name},\n\nPour réinitialiser le mot de passe de votre compte (${account}), ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    html: `<p>Bonjour ${escapeHtml(name)},</p>
<p>Pour réinitialiser le mot de passe de votre compte <strong>${escapeHtml(account)}</strong>, cliquez sur le lien ci-dessous (valable 1 heure) :</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:${color};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Réinitialiser mon mot de passe</a></p>
<p style="color:#6b7280;font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
  }
}
