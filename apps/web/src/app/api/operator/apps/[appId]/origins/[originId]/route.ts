import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

interface RouteContext {
  params: Promise<{ appId: string; originId: string }>
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { appId, originId } = await context.params

  return handleOperatorRelay(() =>
    relayAdminJson(
      `/admin/apps/${encodeURIComponent(appId)}/origins/${encodeURIComponent(originId)}`,
      { method: 'DELETE' },
    ),
  )
}
