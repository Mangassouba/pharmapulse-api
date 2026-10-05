import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'

const globalForDb = globalThis

export const pool =
  globalForDb.pgPool ??
  new pg.Pool({ connectionString: process.env.DATABASE_URL })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pgPool = pool
}

const db = drizzle({
  client: pool,
  schema,
  logger: process.env.NODE_ENV === 'development',
})

export default db
