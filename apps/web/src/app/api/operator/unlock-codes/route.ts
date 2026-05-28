import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/unlock-codes${query ? `?${query}` : ''}`),
  )
}

interface UnlockRequestBody {
  namespaceId?: string
  slots?: number
  note?: string | null
  expiresAt?: string | null
}

export async function POST(request: Request) {
  let body: UnlockRequestBody

  try {
    body = (await request.json()) as UnlockRequestBody
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const namespaceId = body.namespaceId?.trim()
  const slots = body.slots

  if (!namespaceId) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Namespace ID is required' } },
      { status: 400 },
    )
  }

  if (!slots || !Number.isInteger(slots) || slots < 1 || slots > 999) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Slots must be an integer between 1 and 999' } },
      { status: 400 },
    )
  }

  return handleOperatorRelay(() =>
    relayAdminJson('/admin/unlock-codes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        namespaceId,
        slots,
        ...(body.note ? { note: body.note } : {}),
        ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      }),
    }),
  )
}
