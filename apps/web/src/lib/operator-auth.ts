import { cookies } from 'next/headers'

export const OPERATOR_COOKIE_NAME = 'senkronla-operator-token'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export async function getOperatorToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(OPERATOR_COOKIE_NAME)?.value
}

export async function setOperatorToken(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(OPERATOR_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
}

export async function clearOperatorToken(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(OPERATOR_COOKIE_NAME)
}
