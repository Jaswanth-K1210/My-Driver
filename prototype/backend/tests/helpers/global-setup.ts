import pg from 'pg'

/** Creates the test database on first run; the migrations fill it. */
export default async function setup(): Promise<void> {
  const url = new URL(process.env.DATABASE_MIGRATION_URL!)
  const name = url.pathname.slice(1)
  url.pathname = '/postgres'
  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (!rowCount) await client.query(`CREATE DATABASE "${name}"`)
  } finally {
    await client.end()
  }
}
