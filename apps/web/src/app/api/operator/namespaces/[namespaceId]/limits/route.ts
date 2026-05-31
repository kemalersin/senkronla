import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

interface RouteContext {
  params: Promise<{ namespaceId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { namespaceId } = await context.params

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/namespaces/${encodeURIComponent(namespaceId)}/limits`),
  )
}

export async function PATCH(request: Request, context: RouteContext) {
  const { namespaceId } = await context.params

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
    relayAdminJson(`/admin/namespaces/${encodeURIComponent(namespaceId)}/limits`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}
