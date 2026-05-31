import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { ConditionalFooter } from '@/components/conditional-footer'
import { SiteHeader } from '@/components/site-header'
import { hasDeveloperSessionCookie } from '@/lib/developer-auth'
import { isDeveloperPortalEnabled } from '@/lib/developer-portal-status'
import { routing } from '@/i18n/routing'
import { createRootLayoutMetadata } from '@/lib/page-metadata'
import type { Locale } from '@/i18n/config'
import '../globals.css'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return createRootLayoutMetadata(locale)
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params

  if (!routing.locales.includes(locale as Locale)) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()
  const initialDeveloperAuthenticated = await hasDeveloperSessionCookie()
  const developerPortalEnabled = await isDeveloperPortalEnabled()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='senkronla-theme',t=localStorage.getItem(k),m=t==='dark'?'dark':'light';document.documentElement.dataset.theme=m;document.cookie=k+'='+m+';path=/;max-age=31536000;SameSite=Lax';}catch(e){document.documentElement.dataset.theme='light';}})();`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SiteHeader
            locale={locale as Locale}
            initialDeveloperAuthenticated={initialDeveloperAuthenticated}
            developerPortalEnabled={developerPortalEnabled}
          />
          <main key={locale} className="site-main">
            {children}
          </main>
          <ConditionalFooter
            initialDeveloperAuthenticated={initialDeveloperAuthenticated}
            developerPortalEnabled={developerPortalEnabled}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
