import { relayDeveloperPublicJson } from '@/lib/developer-relay'

export async function POST(request: Request) {
  const body = await request.text()

  const { status, body: responseBody } = await relayDeveloperPublicJson(
    '/developer/request-password-reset',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    },
  )

  return Response.json(responseBody, { status })
}
