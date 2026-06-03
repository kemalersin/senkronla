import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()

  return handleOperatorRelay(() =>
    relayAdminJson(`/admin/rate-limit-usage/details${query ? `?${query}` : ''}`),
  )
}
