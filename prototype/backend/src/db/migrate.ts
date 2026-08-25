import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { env } from '../config/env.js'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

/**
 * Migrations bypass PgBouncer: DDL, CREATE TYPE and Timescale helper functions
 * need a session-mode connection.
 */
export async function runMigrations(): Promise<void> {
  const pool = new pg.Pool({ connectionString: env.DATABASE_MIGRATION_URL, max: 2 })
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()
    const { rows } = await pool.query<{ name: string }>('SELECT name FROM _migrations')
    const applied = new Set(rows.map((r) => r.name))

    for (const file of files) {
      if (applied.has(file)) continue

      const sql = await readFile(join(migrationsDir, file), 'utf8')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        if (env.NODE_ENV !== 'test') console.log(`applied migration ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err })
      } finally {
        client.release()
      }
    }
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runMigrations()
}
