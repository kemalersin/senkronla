import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { applyRateLimitHeaders } from '../lib/rate-limit-headers.js'
import type { RateLimitQuota } from '../services/rate-limit-service.js'
import { AppError, isAppError } from './app-error.js'

export function registerErrorHandler(app: {
  setErrorHandler: (
    handler: (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => void | Promise<void>,
  ) => void
}) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      void reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: {
            fields: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
      })
      return
    }

    if (isAppError(error)) {
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        const retryAfterSeconds = error.details.retryAfterSeconds
        if (typeof retryAfterSeconds === 'number') {
          reply.header('Retry-After', String(retryAfterSeconds))
        }

        const rateLimit = error.details.rateLimit
        if (rateLimit && typeof rateLimit === 'object') {
          applyRateLimitHeaders(reply, rateLimit as RateLimitQuota)
        }
      }

      void reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      })
      return
    }

    reply.log.error(error)

    void reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: {},
      },
    })
  })
}
