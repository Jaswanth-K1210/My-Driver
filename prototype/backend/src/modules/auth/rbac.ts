import type { FastifyReply, FastifyRequest } from 'fastify'
import { forbidden, unauthorized } from '../../lib/errors.js'
import type { Role } from './otp.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; role: Role }
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    const claims = await request.jwtVerify<{ sub: string; role: Role }>()
    request.auth = { userId: claims.sub, role: claims.role }
  } catch {
    throw unauthorized('UNAUTHENTICATED', 'A valid access token is required')
  }
}

/** Use as a preHandler array: `[requireAuth, requireRole('DRIVER')]`. */
export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.auth) {
      throw unauthorized('UNAUTHENTICATED', 'A valid access token is required')
    }
    if (!roles.includes(request.auth.role)) {
      throw forbidden('FORBIDDEN_ROLE', `This endpoint requires one of: ${roles.join(', ')}`)
    }
  }
}
