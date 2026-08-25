import { pool } from '../../src/db/client.js'
import { runMigrations } from '../../src/db/migrate.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'

let migrated = false

export async function ensureMigrated(): Promise<void> {
  if (migrated) return
  await runMigrations()
  migrated = true
}

/**
 * Truncate every application table between tests. `_migrations` is preserved so
 * the schema is not rebuilt for each test file.
 */
export async function resetDb(): Promise<void> {
  await ensureMigrated()
  // Booking dispatches out of band. Truncating while a dispatch is mid
  // transaction deadlocks, so let any in-flight dispatch finish first.
  await awaitDispatchIdle()
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_migrations'
        AND tablename NOT LIKE '_hyper%'`,
  )
  if (rows.length === 0) return
  const list = rows.map((r) => `"${r.tablename}"`).join(', ')

  // Retry once on a deadlock: a stray background task can still be holding a
  // row lock at the moment we truncate.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
      return
    } catch (err) {
      if ((err as { code?: string }).code !== '40P01' || attempt === 2) throw err
      await new Promise((r) => setTimeout(r, 100))
    }
  }
}
