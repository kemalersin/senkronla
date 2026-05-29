import { DeveloperAuthError } from '@/lib/developer-relay'

export function developerUnauthorized(message = 'Unauthorized') {
  return Response.json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 })
}

export async function handleDeveloperRelay<T>(
  handler: () => Promise<{ status: number; body: T }>,
): Promise<Response> {
  try {
    const result = await handler()
    return Response.json(result.body, { status: result.status })
  } catch (error) {
    if (error instanceof DeveloperAuthError) {
      return developerUnauthorized(error.message)
    }

    return Response.json(
      {
        error: {
          code: 'RELAY_UNREACHABLE',
          message: error instanceof Error ? error.message : 'Cannot reach relay API',
        },
      },
      { status: 502 },
    )
  }
}
