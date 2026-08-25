import type { FastifyInstance } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

const make = (status: number) =>
  (code: string, message: string, details?: unknown): AppError =>
    new AppError(status, code, message, details)

export const badRequest = make(400)
export const unauthorized = make(401)
export const forbidden = make(403)
export const notFound = make(404)
export const conflict = make(409)
export const unprocessable = make(422)
export const tooManyRequests = make(429)

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.info({ code: error.code, statusCode: error.statusCode }, 'handled error')
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      })
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request failed validation',
          details: error.validation.map((v) => ({
            path: v.instancePath,
            message: v.message,
          })),
        },
      })
    }

    const maybeHttp = error as { statusCode?: number; message?: string }
    if (maybeHttp.statusCode === 429) {
      return reply
        .status(429)
        .send({ error: { code: 'RATE_LIMITED', message: maybeHttp.message ?? 'Rate limited' } })
    }

    // Anything unrecognised is a bug. Log it in full, tell the client nothing.
    request.log.error({ err: error }, 'unhandled error')
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    })
  })

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'ROUTE_NOT_FOUND', message: 'No such route' } }),
  )
}
