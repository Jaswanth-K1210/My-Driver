import { pool } from '../../db/client.js'

export type ConsentPurpose =
  | 'LOCATION_TRACKING'
  | 'TELEMATICS_COLLECTION'
  | 'GUARDIAN_SHARING'
  | 'BIOMETRIC_LIVENESS'

export type Consent = {
  id: string
  purpose: ConsentPurpose
  version: string
  granted_at: string
  revoked_at: string | null
}

export async function listConsents(userId: string): Promise<Consent[]> {
  const { rows } = await pool.query<Consent>(
    `SELECT id, purpose, version, granted_at, revoked_at
       FROM consents WHERE user_id = $1 ORDER BY granted_at DESC`,
    [userId],
  )
  return rows
}

/**
 * Consent history is an audit trail under the DPDP Act. A revocation is a new
 * row, never an update or a delete of the original grant.
 */
export async function recordConsent(
  userId: string,
  purpose: ConsentPurpose,
  version: string,
  granted: boolean,
): Promise<Consent> {
  const { rows } = await pool.query<Consent>(
    `INSERT INTO consents (user_id, purpose, version, revoked_at)
     VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN NULL ELSE now() END)
     RETURNING id, purpose, version, granted_at, revoked_at`,
    [userId, purpose, version, granted],
  )
  return rows[0]!
}
