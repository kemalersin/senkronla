import { setDeveloperToken } from '@/lib/developer-auth'
import { relayDeveloperPublicJson } from '@/lib/developer-relay'

interface AuthBody {
  email?: string
  password?: string
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
    error?: { message?: string; code?: string }
  }>('/developer/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (status !== 200 || !responseBody.token) {
    const error = responseBody.error ?? { code: 'DEVELOPER_INVALID_CREDENTIALS', message: 'Invalid email or password' }

    return Response.json(
      {
        error: {
          code: error.code ?? 'DEVELOPER_INVALID_CREDENTIALS',
          message: error.message ?? 'Invalid email or password',
        },
      },
      { status: status === 200 ? 401 : status },
    )
  }

  await setDeveloperToken(responseBody.token)
  return Response.json({ ok: true })
}
