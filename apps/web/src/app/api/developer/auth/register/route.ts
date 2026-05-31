import { clearDeveloperToken, setDeveloperToken } from '@/lib/developer-auth'
import { relayDeveloperPublicJson } from '@/lib/developer-relay'

interface AuthBody {
  email?: string
  password?: string
  locale?: 'en' | 'tr'
}

export async function POST(request: Request) {
  let body: AuthBody

  try {
    body = (await request.json()) as AuthBody
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const email = body.email?.trim()
  const password = body.password

  if (!email || !password) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' } },
      { status: 400 },
    )
  }

  const { status, body: responseBody } = await relayDeveloperPublicJson<{
    token?: string
    developer?: unknown
    error?: { message?: string }
  }>('/developer/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, locale: body.locale }),
  })

  if (!responseBody.token) {
    return Response.json(responseBody, { status })
  }

  await setDeveloperToken(responseBody.token)
  return Response.json(responseBody, { status })
}
