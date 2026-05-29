import { handleDeveloperRelay } from '@/lib/developer-api-response'
import { relayDeveloperJson } from '@/lib/developer-relay'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()

  return handleDeveloperRelay(() =>
    relayDeveloperJson(`/developer/apps${query ? `?${query}` : ''}`),
  )
}

interface CreateAppBody {
  name?: string
  type?: 'web' | 'native'
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

  const name = body.name?.trim()
  const type = body.type

  if (!name || !type) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'name and type are required' } },
      { status: 400 },
    )
  }

  return handleDeveloperRelay(() =>
    relayDeveloperJson('/developer/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, type }),
    }),
  )
}
