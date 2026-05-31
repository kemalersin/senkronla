import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

export type PageMetaKey =
  | 'home'
  | 'guides'
  | 'guidesEsr'
  | 'guidesAgents'
  | 'sdk'
  | 'api'
  | 'quickStart'
  | 'howTo'
  | 'operator'
  | 'developer'
  | 'developerPanel'
  | 'developerRegister'
  | 'developerForgotPassword'
  | 'developerResetPassword'
  | 'developerVerify'

async function readPageMeta(locale: string, pageKey: PageMetaKey) {
  const t = await getTranslations({ locale, namespace: 'meta' })
  const pageTitle = t(`pages.${pageKey}.title`)
  const description = t(`pages.${pageKey}.description`)
  const siteName = t('siteName')
  const fullTitle = pageKey === 'home' ? pageTitle : `${pageTitle} | ${siteName}`

  return { pageTitle, fullTitle, description, siteName }
}

export function formatBrowserPageTitle(pageTitle: string, siteName: string): string {
  return `${pageTitle} | ${siteName}`
}

export type DeveloperAuthMetaMode = 'login' | 'register'

export function developerPageMetaKey(
  authenticated: boolean,
  authMode: DeveloperAuthMetaMode,
): PageMetaKey {
  if (authenticated) {
    return 'developerPanel'
  }

  return authMode === 'register' ? 'developerRegister' : 'developer'
}

export async function createDeveloperPageMetadata(
  locale: string,
  options: { authenticated: boolean; authMode: DeveloperAuthMetaMode },
): Promise<Metadata> {
  return createPageMetadata(
    locale,
    developerPageMetaKey(options.authenticated, options.authMode),
  )
}

export async function createRootLayoutMetadata(locale: string): Promise<Metadata> {
  const { fullTitle, description, siteName } = await readPageMeta(locale, 'home')

  return {
    title: {
      default: fullTitle,
      template: `%s | ${siteName}`,
    },
    description,
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    openGraph: {
      title: fullTitle,
      description,
      siteName,
      locale,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: fullTitle,
      description,
    },
  }
}

export async function createPageMetadata(
  locale: string,
  pageKey: PageMetaKey,
): Promise<Metadata> {
  const { pageTitle, fullTitle, description, siteName } = await readPageMeta(locale, pageKey)

  return {
    title: pageTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      siteName,
      locale,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: fullTitle,
      description,
    },
  }
}
