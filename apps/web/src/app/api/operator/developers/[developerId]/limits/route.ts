import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

interface RouteContext {
  params: Promise<{ developerId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { developerId } = await context.params

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/developers/${encodeURIComponent(developerId)}/limits`),
  )
}

export async function PATCH(request: Request, context: RouteContext) {
  const { developerId } = await context.params

  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/developers/${encodeURIComponent(developerId)}/limits`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}
