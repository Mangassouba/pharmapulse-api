/**
 * Create the platform Super Admin — without any demo data (unlike db:seed).
 * If the email already exists, its password is replaced and the account reactivated.
 *
 *   npm run db:create-super-admin
 *
 * Runs against DATABASE_URL from .env: point it at the production database (and set
 * DATABASE_SSL=true for Supabase) only for the time of this command.
 */
import 'dotenv/config'
import readline from 'node:readline'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

// The SQL logger (on in development) would print the password hash: turn it off before connecting
if (process.env.NODE_ENV === 'development') process.env.NODE_ENV = 'script'
const { default: db, pool } = await import('../config/database.js')
const { superAdmins } = await import('./schema.js')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 10

// One interface for every question (a new one per question can drop already-typed lines)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
let masking = false
const write = rl._writeToOutput.bind(rl)
// While a password is typed, echo '*' instead of the characters (the prompt itself stays readable)
rl._writeToOutput = (s) => write(masking && !s.includes(':') ? s.replace(/[^\r\n]/g, '*') : s)

// Lines are queued so none is lost when they arrive before the question (pasted or piped input)
const lines = []
let waiting = null
rl.on('line', (line) => { if (waiting) { const w = waiting; waiting = null; w(line) } else lines.push(line) })
rl.on('close', () => { if (waiting) waiting(null) })

function ask(question, { hidden = false } = {}) {
  rl.output.write(question)
  masking = hidden
  return new Promise((resolve, reject) => {
    const done = (line) => {
      masking = false
      if (line === null) return reject(new Error('Saisie interrompue.'))
      resolve(line.trim())
    }
    if (lines.length) done(lines.shift())
    else waiting = done
  })
}

async function main() {
  const host = (process.env.DATABASE_URL || '').replace(/^.*@/, '').replace(/\/.*$/, '')
  console.log(`\n🔐 Création du Super Admin\n   Base de données : ${host || '(DATABASE_URL absent)'}\n`)

  const email = await ask('Email : ')
  if (!EMAIL_RE.test(email)) throw new Error('Email invalide.')

  const nameInput = await ask('Nom affiché (vide = inchangé, ou « Platform Admin » si nouveau) : ')

  const password = await ask(`Mot de passe (${MIN_PASSWORD} caractères minimum) : `, { hidden: true })
  if (password.length < MIN_PASSWORD) throw new Error(`Mot de passe trop court (${MIN_PASSWORD} caractères minimum).`)
  const confirm = await ask('Confirmer le mot de passe : ', { hidden: true })
  if (confirm !== password) throw new Error('Les mots de passe ne correspondent pas.')

  const hashed = await bcrypt.hash(password, 12)
  const existing = await db.query.superAdmins.findFirst({ where: eq(superAdmins.email, email), columns: { id: true } })

  if (existing) {
    await db.update(superAdmins).set({ ...(nameInput && { name: nameInput }), password: hashed, is_active: true }).where(eq(superAdmins.id, existing.id))
    console.log(`\n✅ Super Admin existant mis à jour : ${email} (nouveau mot de passe, compte actif)`)
  } else {
    await db.insert(superAdmins).values({ name: nameInput || 'Platform Admin', email, password: hashed, is_active: true })
    console.log(`\n✅ Super Admin créé : ${email}`)
  }
  console.log('   Connexion : <adresse du site>/super/login\n')
}

main()
  .catch(err => { console.error(`\n❌ ${err.message}\n`); process.exitCode = 1 })
  .finally(() => { rl.close(); pool.end() })
