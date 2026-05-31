import { setRequestLocale } from 'next-intl/server'
import { OperatorPortal } from '@/components/operator-portal'
import { createPageMetadata } from '@/lib/page-metadata'

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params
  return createPageMetadata(locale, 'operator')
}

export default async function OperatorPage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  return <OperatorPortal />
}
