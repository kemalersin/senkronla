import { setRequestLocale } from 'next-intl/server'
import { OperatorPortal } from '@/components/operator-portal'

interface PageProps {
  params: Promise<{ locale: string }>
}

export default async function OperatorPage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  return <OperatorPortal />
}
