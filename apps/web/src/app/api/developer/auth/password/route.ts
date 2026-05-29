import { handleDeveloperRelay } from '@/lib/developer-api-response'
import { relayDeveloperJson } from '@/lib/developer-relay'

interface PasswordBody {
  currentPassword?: string
  newPassword?: string
}

export async function PATCH(request: Request) {
  let body: PasswordBody

  try {
    body = (await request.json()) as PasswordBody
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const currentPassword = body.currentPassword
  const newPassword = body.newPassword

  if (!currentPassword || !newPassword) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Current and new password are required' } },
      { status: 400 },
    )
  }

  return handleDeveloperRelay(() =>
    relayDeveloperJson('/developer/password', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  )
}
