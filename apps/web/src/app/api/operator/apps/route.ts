import { handleOperatorRelay } from '@/lib/operator-api-response'
import { isValidAppId, normalizeAppId } from '@/lib/app-id'
import { relayAdminJson } from '@/lib/operator-relay'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/apps${query ? `?${query}` : ''}`),
  )
}

interface CreateAppBody {
  appId?: string
  name?: string
  type?: 'web' | 'native'
  status?: string
  origins?: string[]
  bundleIds?: { ios?: string; android?: string }
  clientSecret?: string
}

export async function POST(request: Request) {
  let body: CreateAppBody

  try {
    body = (await request.json()) as CreateAppBody
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const appId = body.appId ? normalizeAppId(body.appId) : undefined
  const name = body.name?.trim()
  const type = body.type

  if (!appId || !name || !type) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'appId, name, and type are required' } },
      { status: 400 },
    )
  }

  if (!isValidAppId(appId)) {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid appId format',
          details: {
            fields: [
              {
                path: 'appId',
                message: 'Must start with esr_app_ and use lowercase letters, digits, and underscores',
              },
            ],
          },
        },
      },
      { status: 400 },
    )
  }

  return handleOperatorRelay(() =>
    relayAdminJson('/admin/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appId,
        name,
        type,
        ...(body.status ? { status: body.status } : {}),
        ...(body.origins?.length ? { origins: body.origins } : {}),
        ...(body.bundleIds ? { bundleIds: body.bundleIds } : {}),
        ...(body.clientSecret ? { clientSecret: body.clientSecret } : {}),
      }),
    }),
  )
}
