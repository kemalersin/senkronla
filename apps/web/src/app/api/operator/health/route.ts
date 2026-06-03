import { getOperatorToken } from '@/lib/operator-auth'
import { handleOperatorRelay, operatorUnauthorized } from '@/lib/operator-api-response'
import { fetchRelayJson } from '@/lib/relay-proxy'

export async function GET() {
  const token = await getOperatorToken()

  if (!token) {
    return operatorUnauthorized()
  }

  return handleOperatorRelay(async () => {
    const { status, body } = await fetchRelayJson('/health', {
      headers: { authorization: `Bearer ${token}` },
    })
    return { status, body }
  })
}
