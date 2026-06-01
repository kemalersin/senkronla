import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

export async function GET() {
  return handleOperatorRelay(() => relayAdminJson('/admin/settings/sync'))
}
