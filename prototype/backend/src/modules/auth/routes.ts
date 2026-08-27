import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { signInWithGoogle } from './google.js'
import { requestOtp, ROLES } from './otp.js'
import { verifyOtp } from './service.js'
import { revokeRefreshToken, rotateRefreshToken } from './tokens.js'

// E.164: a leading +, a non-zero country digit, then up to 14 more digits.
export const PhoneNumber = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'must be E.164, e.g. +919876543210')

export const RoleSchema = z.enum(ROLES)

const PublicUserSchema = z.object({
  id: z.string().uuid(),
  role: RoleSchema,
  phone_number: z.string().nullable(),
  email: z.string().nullable(),
  full_name: z.string().nullable(),
})

const TokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int(),
  user: PublicUserSchema,
})

export function registerAuthRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post(
    '/v1/auth/otp/request',
    {
      schema: {
        body: z.object({ phone_number: PhoneNumber, role: RoleSchema }).strict(),
        response: {
          200: z.object({ status: z.literal('OTP_SENT'), expires_in: z.number().int() }),
        },
      },
    },
    async (request) => {
      const { expiresIn } = await requestOtp({
        phoneNumber: request.body.phone_number,
        role: request.body.role,
        ip: request.ip,
      })
      return { status: 'OTP_SENT' as const, expires_in: expiresIn }
    },
  )

  r.post(
    '/v1/auth/otp/verify',
    {
      schema: {
        body: z
          .object({
            phone_number: PhoneNumber,
            otp: z.string().regex(/^\d{6}$/, 'must be 6 digits'),
            role: RoleSchema,
            device_id: z.string().max(128).optional(),
          })
          .strict(),
        response: { 200: TokenResponse },
      },
    },
    async (request) => {
      const { tokens, user } = await verifyOtp(app, {
        phoneNumber: request.body.phone_number,
        otp: request.body.otp,
        role: request.body.role,
        deviceId: request.body.device_id,
      })
      return { ...tokens, user }
    },
  )

  r.post(
    '/v1/auth/google',
    {
      schema: {
        body: z
          .object({
            id_token: z.string().min(4),
            role: RoleSchema,
            device_id: z.string().max(128).optional(),
          })
          .strict(),
        response: { 200: TokenResponse },
      },
    },
    async (request) => {
      const { tokens, user } = await signInWithGoogle(app, {
        idToken: request.body.id_token,
        role: request.body.role,
        deviceId: request.body.device_id,
      })
      return { ...tokens, user }
    },
  )

  r.post(
    '/v1/auth/refresh',
    {
      schema: {
        body: z.object({ refresh_token: z.string().min(10) }).strict(),
        response: {
          200: z.object({
            access_token: z.string(),
            refresh_token: z.string(),
            expires_in: z.number().int(),
          }),
        },
      },
    },
    async (request) => rotateRefreshToken(app, request.body.refresh_token),
  )

  r.post(
    '/v1/auth/logout',
    {
      schema: {
        body: z.object({ refresh_token: z.string().min(1) }).strict(),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await revokeRefreshToken(request.body.refresh_token)
      return reply.status(204).send(null)
    },
  )
}
