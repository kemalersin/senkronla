import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

interface RouteContext {
  params: Promise<{ developerId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { developerId } = await context.params

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/developers/${encodeURIComponent(developerId)}`),
  )
}

interface PatchDeveloperBody {
  disabled?: boolean
  emailVerified?: boolean
}

export async function PATCH(request: Request, context: RouteContext) {
  const { developerId } = await context.params

  let body: PatchDeveloperBody

  try {
    body = (await request.json()) as PatchDeveloperBody
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  if (body.disabled === undefined && body.emailVerified === undefined) {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one of disabled or emailVerified is required',
        },
      },
      { status: 400 },
    )
  }

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/developers/${encodeURIComponent(developerId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}
