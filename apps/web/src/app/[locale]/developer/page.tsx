import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { DeveloperPortal } from '@/components/developer-portal'
import { hasDeveloperSessionCookie } from '@/lib/developer-auth'
import { fetchRelayHealth } from '@/lib/developer-portal-status'
import { createDeveloperPageMetadata } from '@/lib/page-metadata'

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params
  const authenticated = await hasDeveloperSessionCookie()

  return createDeveloperPageMetadata(locale, { authenticated, authMode: 'login' })
}

export default async function DeveloperPage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const relayHealth = await fetchRelayHealth()

  if (!relayHealth.developerPortalEnabled) {
    notFound()
  }

  const hasSessionCookie = await hasDeveloperSessionCookie()

  return (
    <DeveloperPortal
      initialAuthMode="login"
      hasSessionCookie={hasSessionCookie}
      nativeRequireClientSecret={relayHealth.nativeRequireClientSecret}
    />
  )
}
