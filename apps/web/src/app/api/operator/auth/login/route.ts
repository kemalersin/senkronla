import { clearOperatorToken, setOperatorToken } from '@/lib/operator-auth'
import { operatorUnauthorized } from '@/lib/operator-api-response'
import { verifyOperatorToken } from '@/lib/operator-relay'

interface LoginBody {
  adminToken?: string
}

export async function POST(request: Request) {
  let body: LoginBody

  try {
    body = (await request.json()) as LoginBody
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const adminToken = body.adminToken?.trim()

  if (!adminToken) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Admin token is required' } },
      { status: 400 },
    )
  }

  const valid = await verifyOperatorToken(adminToken)

  if (!valid) {
    return operatorUnauthorized('Invalid admin token')
  }

  await setOperatorToken(adminToken)

  return Response.json({ ok: true })
}
