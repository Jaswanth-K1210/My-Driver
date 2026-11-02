import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { STAFF_FILE } from './helpers.js'

const ROLES = ['SUPER_ADMIN', 'OPS_MANAGER', 'SAFETY_DESK_AGENT', 'FINANCE']

/** One console account per staff role, with a fresh password each run. */
export default function globalSetup() {
  const backend = fileURLToPath(new URL('../../backend', import.meta.url))
  const staff = {}
  for (const role of ROLES) {
    const email = `e2e.${role.toLowerCase()}@mydriver.test`
    const out = execFileSync('npx', ['tsx', 'src/db/create-staff.ts', email, role, `E2E ${role}`], {
      cwd: backend,
      encoding: 'utf8',
    })
    staff[role] = { email, password: out.match(/one-time password: (\S+)/)[1] }
  }
  writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 2))
}
