import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

/** Public site origin used for absolute metadata URLs (OG/Twitter images). */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://senkron.la'

const OG_IMAGE = { url: '/og-image.png', width: 1200, height: 630 } as const
const TWITTER_IMAGE = '/twitter-card.png'

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
    metadataBase: new URL(SITE_URL),
    title: {
      default: fullTitle,
      template: `%s | ${siteName}`,
    },
    description,
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
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
      images: [{ ...OG_IMAGE, alt: fullTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [TWITTER_IMAGE],
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
      images: [{ ...OG_IMAGE, alt: fullTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [TWITTER_IMAGE],
    },
  }
}
