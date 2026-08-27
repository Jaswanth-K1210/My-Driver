/**
 * Role constants, deliberately free of imports.
 *
 * This lives apart from otp.ts because that module reaches Redis and Postgres
 * at import time. A CLI that only needs the list of valid roles must not open
 * network connections — and a process that opens them never exits.
 */

/** Mirrors the user_role enum in the database. */
export const ROLES = [
  'CUSTOMER',
  'DRIVER',
  'AGENT',
  'ADMIN',
  // Phase 2, from admin_crm_spec.md's RBAC requirements.
  'SAFETY_DESK_AGENT',
  'OPS_MANAGER',
  'FINANCE',
  'SUPER_ADMIN',
] as const

export type Role = (typeof ROLES)[number]

/** Roles that may sit at the 24x7 Safety Desk. */
export const DESK_ROLES = ['SAFETY_DESK_AGENT', 'OPS_MANAGER', 'SUPER_ADMIN'] as const
