import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

interface RouteContext {
  params: Promise<{ appId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { appId } = await context.params

  let body: { origin?: string; verified?: boolean }

  try {
    body = (await request.json()) as { origin?: string; verified?: boolean }
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

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/apps/${encodeURIComponent(appId)}/origins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origin,
        ...(body.verified !== undefined ? { verified: body.verified } : {}),
      }),
    }),
  )
}
