import { handleDeveloperRelay } from '@/lib/developer-api-response'
import { relayDeveloperJson } from '@/lib/developer-relay'

interface RouteContext {
  params: Promise<{ appId: string; originId: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  const { appId, originId } = await context.params

  return handleDeveloperRelay(() =>
    relayDeveloperJson(
      `/developer/apps/${encodeURIComponent(appId)}/origins/${encodeURIComponent(originId)}/verify`,
      { method: 'POST' },
    ),
  )
}
