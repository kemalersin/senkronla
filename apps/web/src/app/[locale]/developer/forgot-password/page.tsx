import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { DeveloperForgotPasswordPage } from '@/components/developer-forgot-password-page'
import { fetchRelayHealth } from '@/lib/developer-portal-status'
import { createPageMetadata } from '@/lib/page-metadata'

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params
  return createPageMetadata(locale, 'developerForgotPassword')
}

export default async function DeveloperForgotPasswordRoute({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const relayHealth = await fetchRelayHealth()

  if (!relayHealth.developerPortalEnabled) {
    notFound()
  }

  return <DeveloperForgotPasswordPage />
}
