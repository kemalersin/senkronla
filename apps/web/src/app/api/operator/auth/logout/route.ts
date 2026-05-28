import { clearOperatorToken } from '@/lib/operator-auth'

export async function POST() {
  await clearOperatorToken()
  return Response.json({ ok: true })
}
