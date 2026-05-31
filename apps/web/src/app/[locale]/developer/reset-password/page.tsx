import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { DeveloperResetPasswordPage } from '@/components/developer-reset-password-page'
import { OperatorSpinner } from '@/components/operator-spinner'
import { fetchRelayHealth } from '@/lib/developer-portal-status'
import { createPageMetadata } from '@/lib/page-metadata'

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params
  return createPageMetadata(locale, 'developerResetPassword')
}

export default async function DeveloperResetPasswordRoute({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const relayHealth = await fetchRelayHealth()

  if (!relayHealth.developerPortalEnabled) {
    notFound()
  }

  return (
    <Suspense fallback={<OperatorSpinner label="…" />}>
      <DeveloperResetPasswordPage />
    </Suspense>
  )
}
