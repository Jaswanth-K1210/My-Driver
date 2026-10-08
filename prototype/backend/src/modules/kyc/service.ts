import { createHash } from 'node:crypto'
import { env } from '../../config/env.js'
import { pool } from '../../db/client.js'
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js'
import { getKycProvider } from '../../providers/kyc/index.js'
import { getStorageProvider } from '../../providers/storage/index.js'

// 5 letters, 4 digits, 1 letter. The 4th letter is the holder type (P = person).
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
// 12 digits; UIDAI never issues numbers starting with 0 or 1.
export const AADHAAR_RE = /^[2-9][0-9]{11}$/

export type KycKind = 'PAN' | 'AADHAAR'

export type KycStatus = {
  pan: { status: 'VERIFIED' | 'FAILED' | 'NOT_STARTED' | 'PENDING'; last4: string | null; name: string | null }
  aadhaar: { status: 'VERIFIED' | 'FAILED' | 'NOT_STARTED' | 'PENDING'; last4: string | null; name: string | null }
  verified: boolean
}

async function alreadyVerified(userId: string, kind: KycKind): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM kyc_verifications WHERE user_id = $1 AND kind = $2 AND status = 'VERIFIED'`,
    [userId, kind],
  )
  return (rowCount ?? 0) > 0
}

export async function verifyPan(userId: string, rawPan: string, name: string): Promise<KycStatus> {
  const pan = rawPan.trim().toUpperCase()
  if (!PAN_RE.test(pan)) throw badRequest('INVALID_PAN', 'Enter a valid 10-character PAN, e.g. ABCPE1234F')
  if (await alreadyVerified(userId, 'PAN')) throw conflict('ALREADY_VERIFIED', 'PAN is already verified')

  const provider = getKycProvider()
  const result = await provider.verifyPan(pan, name.trim())
  const nameOk = result.nameMatchScore == null || result.nameMatchScore >= env.KYC_MIN_NAME_MATCH
  const ok = result.valid && nameOk
  const reason = !result.valid
    ? (result.reason ?? 'PAN could not be verified')
    : nameOk ? null : 'Name does not match the PAN record'

  await pool.query(
    `INSERT INTO kyc_verifications
       (user_id, kind, status, provider, number_last4, name_on_record, name_match_score,
        failure_reason, verified_at)
     VALUES ($1, 'PAN', $2::kyc_status, $3, $4, $5, $6, $7, CASE WHEN $2::kyc_status = 'VERIFIED' THEN now() END)`,
    [userId, ok ? 'VERIFIED' : 'FAILED', provider.name, pan.slice(-4),
     result.registeredName, result.nameMatchScore, reason],
  )
  if (!ok) throw unprocessable('PAN_NOT_VERIFIED', reason!)
  return getKycStatus(userId)
}

export async function requestAadhaarOtp(userId: string, rawAadhaar: string): Promise<{ ref_id: string }> {
  const aadhaar = rawAadhaar.replace(/\s+/g, '')
  if (!AADHAAR_RE.test(aadhaar)) throw badRequest('INVALID_AADHAAR', 'Enter your 12-digit Aadhaar number')
  if (await alreadyVerified(userId, 'AADHAAR')) throw conflict('ALREADY_VERIFIED', 'Aadhaar is already verified')

  const provider = getKycProvider()
  let refId: string
  try {
    ;({ refId } = await provider.requestAadhaarOtp(aadhaar))
  } catch (err) {
    throw unprocessable('AADHAAR_OTP_FAILED', (err as Error).message)
  }

  // The provider ref is stored with the PENDING row so verify can prove the
  // ref belongs to this user, not to someone else's OTP session.
  await pool.query(
    `INSERT INTO kyc_verifications (user_id, kind, status, provider, provider_ref, number_last4)
     VALUES ($1, 'AADHAAR', 'PENDING', $2, $3, $4)`,
    [userId, provider.name, refId, aadhaar.slice(-4)],
  )
  return { ref_id: refId }
}

export async function verifyAadhaarOtp(userId: string, refId: string, otp: string): Promise<KycStatus> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM kyc_verifications
      WHERE user_id = $1 AND kind = 'AADHAAR' AND status = 'PENDING' AND provider_ref = $2
        AND created_at > now() - INTERVAL '10 minutes'`,
    [userId, refId],
  )
  const pending = rows[0]
  if (!pending) throw notFound('OTP_SESSION_NOT_FOUND', 'That OTP has expired. Request a new one.')

  const result = await getKycProvider().verifyAadhaarOtp(refId, otp)
  if (!result.valid) {
    // A wrong OTP leaves the session PENDING so the user can retype it; the
    // provider enforces its own attempt limit.
    throw unprocessable('AADHAAR_NOT_VERIFIED', result.reason ?? 'Aadhaar could not be verified')
  }
  await pool.query(
    `UPDATE kyc_verifications
        SET status = 'VERIFIED', name_on_record = $2, verified_at = now()
      WHERE id = $1`,
    [pending.id, result.name],
  )
  return getKycStatus(userId)
}

export async function getKycStatus(userId: string): Promise<KycStatus> {
  // Latest row per kind, preferring a VERIFIED one over later failures.
  const { rows } = await pool.query<{ kind: KycKind; status: string; number_last4: string; name_on_record: string | null }>(
    `SELECT DISTINCT ON (kind) kind, status, number_last4, name_on_record
       FROM kyc_verifications WHERE user_id = $1
      ORDER BY kind, (status = 'VERIFIED') DESC, created_at DESC`,
    [userId],
  )
  const pick = (kind: KycKind) => {
    const r = rows.find((x) => x.kind === kind)
    return r
      ? { status: r.status as KycStatus['pan']['status'], last4: r.number_last4, name: r.name_on_record }
      : { status: 'NOT_STARTED' as const, last4: null, name: null }
  }
  const pan = pick('PAN')
  const aadhaar = pick('AADHAAR')
  return { pan, aadhaar, verified: pan.status === 'VERIFIED' && aadhaar.status === 'VERIFIED' }
}

/* ── Driver documents ─────────────────────────────────────────────────── */

export type DocumentKind = 'DRIVING_LICENCE' | 'AADHAAR' | 'PAN' | 'POLICE_VERIFICATION' | 'PHOTO' | 'ADDRESS_PROOF'

const MIME: Record<string, string> = { '/9j/': 'image/jpeg', iVBO: 'image/png', JVBE: 'application/pdf' }

export async function uploadDocument(input: {
  driverId: string
  kind: DocumentKind
  base64: string
  numberLast4?: string | undefined
  expiresOn?: string | undefined
}) {
  const contentType = MIME[input.base64.slice(0, 4)]
  if (!contentType) throw badRequest('UNSUPPORTED_FILE', 'Upload a JPEG, PNG or PDF')
  const body = Buffer.from(input.base64, 'base64')

  // Content-addressed key: re-uploading the same file is harmless, and the
  // key alone proves which bytes the reviewer saw.
  const sha = createHash('sha256').update(body).digest('hex')
  const key = `documents/${input.driverId}/${input.kind}/${sha}`
  await getStorageProvider().put(key, body, contentType)

  const { rows } = await pool.query(
    `INSERT INTO driver_documents (driver_id, kind, storage_key, number_last4, expires_on)
     VALUES ($1, $2::document_kind, $3, $4, $5)
     RETURNING id, kind, status, number_last4, expires_on, created_at`,
    [input.driverId, input.kind, key, input.numberLast4 ?? null, input.expiresOn ?? null],
  )
  return rows[0]
}

export async function getOnboarding(driverId: string) {
  const { rows: profile } = await pool.query<{ onboarding_status: string; review_note: string | null }>(
    `SELECT onboarding_status, review_note FROM driver_profiles WHERE user_id = $1`,
    [driverId],
  )
  if (!profile[0]) throw notFound('DRIVER_NOT_FOUND', 'No driver profile')

  const { rows: documents } = await pool.query(
    `SELECT DISTINCT ON (kind) id, kind, status, number_last4, expires_on, reject_reason, created_at
       FROM driver_documents WHERE driver_id = $1
      ORDER BY kind, created_at DESC`,
    [driverId],
  )
  const kyc = await getKycStatus(driverId)
  const gate = await approvalBlockers(driverId)
  return {
    onboarding_status: profile[0].onboarding_status,
    review_note: profile[0].review_note,
    kyc,
    documents,
    ready_for_review: gate.length === 0 || gate.every((g) => g === 'LICENCE_NOT_VERIFIED'),
    blockers: gate,
  }
}

/**
 * What still stands between this driver and approval. Empty means approvable.
 * The admin approve action and the driver's checklist both read this, so they
 * can never disagree about what is missing.
 */
export async function approvalBlockers(driverId: string): Promise<string[]> {
  const { rows } = await pool.query<{ pan: boolean; aadhaar: boolean; licence: boolean; licence_submitted: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM kyc_verifications WHERE user_id = $1 AND kind = 'PAN' AND status = 'VERIFIED') AS pan,
       EXISTS (SELECT 1 FROM kyc_verifications WHERE user_id = $1 AND kind = 'AADHAAR' AND status = 'VERIFIED') AS aadhaar,
       EXISTS (SELECT 1 FROM driver_documents WHERE driver_id = $1 AND kind = 'DRIVING_LICENCE' AND status = 'VERIFIED'
                 AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)) AS licence,
       EXISTS (SELECT 1 FROM driver_documents WHERE driver_id = $1 AND kind = 'DRIVING_LICENCE'
                 AND status IN ('SUBMITTED', 'VERIFIED')) AS licence_submitted`,
    [driverId],
  )
  const r = rows[0]!
  const out: string[] = []
  if (!r.pan) out.push('PAN_NOT_VERIFIED')
  if (!r.aadhaar) out.push('AADHAAR_NOT_VERIFIED')
  if (!r.licence_submitted) out.push('LICENCE_MISSING')
  else if (!r.licence) out.push('LICENCE_NOT_VERIFIED')
  return out
}

/**
 * A driver who has finished their side (PAN, Aadhaar, licence uploaded) moves
 * from PENDING into the ops review queue on their own; nobody has to notice
 * them. Only PENDING moves: a REJECTED or SUSPENDED driver stays put.
 */
export async function advanceIfReady(driverId: string): Promise<void> {
  const blockers = await approvalBlockers(driverId)
  if (blockers.some((b) => b !== 'LICENCE_NOT_VERIFIED')) return
  await pool.query(
    `UPDATE driver_profiles SET onboarding_status = 'UNDER_REVIEW', updated_at = now()
      WHERE user_id = $1 AND onboarding_status = 'PENDING'`,
    [driverId],
  )
}
