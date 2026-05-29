import { cookies } from 'next/headers'

export const DEVELOPER_COOKIE_NAME = 'senkronla-developer-token'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export async function getDeveloperToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(DEVELOPER_COOKIE_NAME)?.value
}

export async function setDeveloperToken(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(DEVELOPER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
}

export async function hasDeveloperSessionCookie(): Promise<boolean> {
  return Boolean(await getDeveloperToken())
}

export async function clearDeveloperToken(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(DEVELOPER_COOKIE_NAME)
}
