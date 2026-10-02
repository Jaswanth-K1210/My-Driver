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

/**
 * Roles a person may obtain simply by signing in.
 *
 * Everything NOT in this list — every desk, ops, finance and admin role — must
 * already have been granted by an operator through `npm run grant-role`.
 * Sign-in can authenticate into such a role, but must never create it: a login
 * endpoint that grants whatever role it is asked for is a privilege-escalation
 * surface, which is precisely what grant-role.ts exists to avoid.
 */
export const SELF_SERVICE_ROLES: readonly Role[] = ['CUSTOMER', 'DRIVER']

/** Roles that may sit at the 24x7 Safety Desk. */
export const DESK_ROLES = ['SAFETY_DESK_AGENT', 'OPS_MANAGER', 'SUPER_ADMIN'] as const
