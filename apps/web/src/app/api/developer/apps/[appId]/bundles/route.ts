import { handleDeveloperRelay } from '@/lib/developer-api-response'
import { relayDeveloperJson } from '@/lib/developer-relay'
import { isNativePlatform, type NativePlatform } from '@/lib/native-platform'

interface RouteContext {
  params: Promise<{ appId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { appId } = await context.params

  let body: { platform?: NativePlatform; bundleId?: string }

  try {
    body = (await request.json()) as { platform?: NativePlatform; bundleId?: string }
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const platform = body.platform
  const bundleId = body.bundleId?.trim()

  if (!platform || !bundleId) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'platform and bundleId are required' } },
      { status: 400 },
    )
  }

  if (!isNativePlatform(platform)) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'platform must be ios, android, or desktop' } },
      { status: 400 },
    )
  }

  return handleDeveloperRelay(() =>
    relayDeveloperJson(`/developer/apps/${encodeURIComponent(appId)}/bundles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform, bundleId }),
    }),
  )
}
