import { handleDeveloperRelay } from '@/lib/developer-api-response'
import { relayDeveloperJson } from '@/lib/developer-relay'

interface RouteContext {
  params: Promise<{ appId: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  const { appId } = await context.params

  return handleDeveloperRelay(() =>
    relayDeveloperJson(`/developer/apps/${encodeURIComponent(appId)}/rotate-secret`, {
      method: 'POST',
    }),
  )
}
