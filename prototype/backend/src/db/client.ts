import pg from 'pg'
import { env } from '../config/env.js'

/**
 * Postgres returns DECIMAL as a string by default, which is correct for money.
 * Do not add a parser that turns it into a JS number.
 *
 * This pool points at PgBouncer in transaction mode, so `max` is deliberately
 * small: 24 app instances x 10 = 240 client connections that PgBouncer
 * multiplexes onto ~25 real Postgres backends.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === 'test' ? 5 : env.DATABASE_POOL_MAX,
  // A stalled dependency must surface as an error, never as an infinite wait.
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  // query_timeout is enforced client-side. Do NOT set statement_timeout here:
  // node-postgres sends it as a startup parameter, which PgBouncer rejects.
  query_timeout: 15_000,
})

export async function closeDb(): Promise<void> {
  await pool.end()
}
