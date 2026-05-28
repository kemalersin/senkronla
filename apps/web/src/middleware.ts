import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  matcher: [
    '/',
    '/(tr)/:path*',
    '/((?!api/|_next|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
}
