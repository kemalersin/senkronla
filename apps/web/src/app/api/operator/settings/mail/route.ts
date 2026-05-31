import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

export async function GET() {
  return handleOperatorRelay(() => relayAdminJson('/admin/settings/mail'))
}

export async function PATCH(request: Request) {
  const body = await request.text()

  return handleOperatorRelay(() =>
    relayAdminJson('/admin/settings/mail', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
}
