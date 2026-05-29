import { handleDeveloperRelay } from '@/lib/developer-api-response'
import { relayDeveloperJson } from '@/lib/developer-relay'

interface RouteContext {
  params: Promise<{ appId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { appId } = await context.params

  let body: { origin?: string }

  try {
    body = (await request.json()) as { origin?: string }
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const origin = body.origin?.trim()

  if (!origin) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'origin is required' } },
      { status: 400 },
    )
  }

  return handleDeveloperRelay(() =>
    relayDeveloperJson(`/developer/apps/${encodeURIComponent(appId)}/origins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin }),
    }),
  )
}
