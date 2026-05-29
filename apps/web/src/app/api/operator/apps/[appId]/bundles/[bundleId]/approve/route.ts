import { handleOperatorRelay } from '@/lib/operator-api-response'
import { relayAdminJson } from '@/lib/operator-relay'

interface RouteContext {
  params: Promise<{ appId: string; bundleId: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  const { appId, bundleId } = await context.params

  return handleOperatorRelay(() =>
    relayAdminJson(
      `/admin/apps/${encodeURIComponent(appId)}/bundles/${encodeURIComponent(bundleId)}/approve`,
      { method: 'POST' },
    ),
  )
}
