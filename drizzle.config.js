import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// Same TLS behaviour as src/config/database.js when DATABASE_SSL=true (Supabase…)
function databaseUrl() {
  const url = process.env.DATABASE_URL
  if (process.env.DATABASE_SSL !== 'true' || !url || /[?&]sslmode=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}sslmode=no-verify`
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.js',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl(),
  },
})
