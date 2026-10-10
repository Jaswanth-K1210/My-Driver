/**
 * Provisions the admin portal's operator accounts. There is no signup:
 *
 *   npm run seed:staff
 *
 * Creates (or updates) one account per staff role, sets a fresh random
 * password on each, and writes them to credentials.md at the repo root. That
 * file is gitignored; hand each operator their own line. Re-running rotates
 * every password, which is also how a forgotten password is reset.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../lib/password.js'
import type { Role } from '../modules/auth/roles.js'
import { env } from '../config/env.js'
import { closeDb, pool } from './client.js'

// These are shared demo logins on a fake domain. Real staff get their own
// account from create-staff.ts.
if (env.NODE_ENV === 'production') {
  console.error('seed-staff creates demo accounts and is disabled in production. Use create-staff instead.')
  process.exit(1)
}

const STAFF: Array<{ email: string; name: string; role: Role; can: string }> = [
  { email: 'superadmin@mydriver.test', name: 'Super Admin', role: 'SUPER_ADMIN', can: 'Everything, including the audit ledger' },
  { email: 'ops@mydriver.test', name: 'Ops Manager', role: 'OPS_MANAGER', can: 'Live map, desk, driver onboarding, grading, Night Shield' },
  { email: 'desk@mydriver.test', name: 'Safety Desk Agent', role: 'SAFETY_DESK_AGENT', can: 'Live map, live board, incidents, check-in calls, driver read-only' },
  { email: 'finance@mydriver.test', name: 'Finance', role: 'FINANCE', can: 'Payouts only' },
]

const out = fileURLToPath(new URL('../../../../credentials.md', import.meta.url))
const lines: string[] = []

for (const s of STAFF) {
  const password = randomBytes(12).toString('base64url')
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()
     RETURNING id`,
    [s.email, s.name, await hashPassword(password)],
  )
  const id = rows[0]!.id
  await pool.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, $2::user_role)
     ON CONFLICT (user_id, role) DO UPDATE SET status = 'ACTIVE'`,
    [id, s.role],
  )
  // Same rule as grant-role.ts: provisioning a privileged role is audited.
  await pool.query(
    `INSERT INTO audit_log (actor_id, action, subject, payload)
     VALUES (NULL, 'STAFF_PROVISIONED', $1, $2::jsonb)`,
    [id, JSON.stringify({ role: s.role, email: s.email, via: 'seed-staff' })],
  )
  lines.push(`| ${s.role} | \`${s.email}\` | \`${password}\` | ${s.can} |`)
}

writeFileSync(
  out,
  `# MyDriver admin portal: staff credentials

**Do not commit this file (it is gitignored).** Generated ${new Date().toISOString()} by
\`npm run seed:staff\`. Re-running that command rotates every password below.

Sign in at **http://localhost:5174/login**. There is no signup.

| Role | Email | Password | Can access |
|---|---|---|---|
${lines.join('\n')}
`,
)

console.log(`provisioned ${STAFF.length} staff accounts -> ${out}`)
await closeDb()
