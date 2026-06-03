import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

export async function POST(request: Request) {
  const body = await request.text()

  return handleOperatorRelay(() =>
    relayAdminJson('/admin/danger/purge-app', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
}
