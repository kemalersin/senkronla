import { operatorUnauthorized } from '@/lib/operator-api-response'
import { OperatorAuthError, relayAdminJson } from '@/lib/operator-relay'

export async function GET() {
  try {
    const { status, body } = await relayAdminJson('/admin/overview')
    return Response.json(body, { status })
  } catch (error) {
    if (error instanceof OperatorAuthError) {
      return operatorUnauthorized(error.message)
    }

    return operatorUnauthorized()
  }
}
