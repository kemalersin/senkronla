import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

interface RouteContext {
  params: Promise<{ appId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { appId } = await context.params

  return handleOperatorRelay(() => relayAdminJson(`/admin/apps/${encodeURIComponent(appId)}`))
}

export async function PATCH(request: Request, context: RouteContext) {
  const { appId } = await context.params

  let body: { name?: string; status?: string }

  try {
    body = (await request.json()) as { name?: string; status?: string }
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  if (body.name === undefined && body.status === undefined) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'At least one of name or status is required' } },
      { status: 400 },
    )
  }

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/apps/${encodeURIComponent(appId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { appId } = await context.params

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/apps/${encodeURIComponent(appId)}`, { method: 'DELETE' }),
  )
}
