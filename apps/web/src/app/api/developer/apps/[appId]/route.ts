import { handleDeveloperRelay } from '@/lib/developer-api-response'
import { relayDeveloperJson } from '@/lib/developer-relay'

interface RouteContext {
  params: Promise<{ appId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { appId } = await context.params

  return handleDeveloperRelay(() =>
    relayDeveloperJson(`/developer/apps/${encodeURIComponent(appId)}`),
  )
}

export async function PATCH(request: Request, context: RouteContext) {
  const { appId } = await context.params

  let body: { name?: string }

  try {
    body = (await request.json()) as { name?: string }
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const name = body.name?.trim()

  if (!name) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'name is required' } },
      { status: 400 },
    )
  }

  return handleDeveloperRelay(() =>
    relayDeveloperJson(`/developer/apps/${encodeURIComponent(appId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  )
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { appId } = await context.params

  return handleDeveloperRelay(() =>
    relayDeveloperJson(`/developer/apps/${encodeURIComponent(appId)}`, { method: 'DELETE' }),
  )
}
