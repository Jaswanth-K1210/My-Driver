import type { PoolClient } from 'pg'
import { pool } from '../../db/client.js'
import { conflict, notFound } from '../../lib/errors.js'

export const MAX_VEHICLES = 10
export const ENGINE_TYPES = ['Petrol', 'Diesel', 'Electric (EV)', 'Hybrid', 'CNG'] as const
export const TRANSMISSIONS = ['Manual', 'Automatic'] as const

export type Vehicle = {
  id: string
  nickname: string | null
  company: string
  model: string
  engine_type: (typeof ENGINE_TYPES)[number]
  transmission: (typeof TRANSMISSIONS)[number]
  plate: string | null
  is_default: boolean
  created_at: string
}

export type VehicleInput = {
  nickname?: string | null | undefined
  company?: string | undefined
  model?: string | undefined
  engine_type?: Vehicle['engine_type'] | undefined
  transmission?: Vehicle['transmission'] | undefined
  plate?: string | null | undefined
  is_default?: boolean | undefined
}

const COLUMNS = 'id, nickname, company, model, engine_type, transmission, plate, is_default, created_at'

export const normalisePlate = (plate: string | null | undefined): string | null =>
  plate ? plate.toUpperCase().replace(/[^A-Z0-9]/g, '') || null : null

export async function listVehicles(userId: string): Promise<Vehicle[]> {
  const { rows } = await pool.query<Vehicle>(
    `SELECT ${COLUMNS} FROM saved_vehicles WHERE user_id = $1
      ORDER BY is_default DESC, created_at`,
    [userId],
  )
  return rows
}

/** Unique-index violations come back as a 409 the app can show, not a 500. */
function mapUniqueViolation(err: unknown): never {
  if ((err as { code?: string }).code === '23505') {
    throw conflict('VEHICLE_DUPLICATE_PLATE', 'A car with this registration is already in your garage')
  }
  throw err
}

async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function addVehicle(userId: string, input: Required<Pick<VehicleInput, 'company' | 'model' | 'engine_type' | 'transmission'>> & VehicleInput): Promise<Vehicle> {
  return withTx(async (c) => {
    // Lock the garage so two concurrent adds cannot both pass the limit.
    const { rows: existing } = await c.query(`SELECT id FROM saved_vehicles WHERE user_id = $1 FOR UPDATE`, [userId])
    if (existing.length >= MAX_VEHICLES) {
      throw conflict('VEHICLE_LIMIT_REACHED', `Up to ${MAX_VEHICLES} cars can be saved`)
    }
    // The first car saved is the default; asking for default moves it.
    const makeDefault = input.is_default === true || existing.length === 0
    if (makeDefault) await c.query(`UPDATE saved_vehicles SET is_default = false WHERE user_id = $1 AND is_default`, [userId])
    const { rows } = await c
      .query<Vehicle>(
        `INSERT INTO saved_vehicles (user_id, nickname, company, model, engine_type, transmission, plate, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
        [userId, input.nickname ?? null, input.company, input.model, input.engine_type, input.transmission, normalisePlate(input.plate), makeDefault],
      )
      .catch(mapUniqueViolation)
    return rows[0]!
  })
}

export async function updateVehicle(userId: string, id: string, patch: VehicleInput): Promise<Vehicle> {
  return withTx(async (c) => {
    if (patch.is_default === true) {
      await c.query(`UPDATE saved_vehicles SET is_default = false WHERE user_id = $1 AND is_default AND id <> $2`, [userId, id])
    }
    // `plate` and `nickname` may be cleared explicitly with null, so they use
    // a "was it sent" flag rather than COALESCE.
    const { rows } = await c
      .query<Vehicle>(
        `UPDATE saved_vehicles
            SET nickname     = CASE WHEN $3 THEN $4 ELSE nickname END,
                company      = COALESCE($5, company),
                model        = COALESCE($6, model),
                engine_type  = COALESCE($7, engine_type),
                transmission = COALESCE($8, transmission),
                plate        = CASE WHEN $9 THEN $10 ELSE plate END,
                is_default   = COALESCE($11, is_default),
                updated_at   = now()
          WHERE id = $1 AND user_id = $2
          RETURNING ${COLUMNS}`,
        [
          id, userId,
          patch.nickname !== undefined, patch.nickname ?? null,
          patch.company ?? null, patch.model ?? null, patch.engine_type ?? null, patch.transmission ?? null,
          patch.plate !== undefined, normalisePlate(patch.plate),
          patch.is_default ?? null,
        ],
      )
      .catch(mapUniqueViolation)
    if (!rows[0]) throw notFound('VEHICLE_NOT_FOUND', 'No such car in your garage')
    return rows[0]
  })
}

export async function deleteVehicle(userId: string, id: string): Promise<void> {
  await withTx(async (c) => {
    const { rows } = await c.query<{ is_default: boolean }>(
      `DELETE FROM saved_vehicles WHERE id = $1 AND user_id = $2 RETURNING is_default`,
      [id, userId],
    )
    if (!rows[0]) throw notFound('VEHICLE_NOT_FOUND', 'No such car in your garage')
    // Removing the default promotes the oldest remaining car, so a garage
    // with cars in it always has a default.
    if (rows[0].is_default) {
      await c.query(
        `UPDATE saved_vehicles SET is_default = true
          WHERE id = (SELECT id FROM saved_vehicles WHERE user_id = $1 ORDER BY created_at LIMIT 1)`,
        [userId],
      )
    }
  })
}
