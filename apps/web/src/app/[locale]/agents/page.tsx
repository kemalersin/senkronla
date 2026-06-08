import { redirect } from '@/i18n/navigation'
import { createPageMetadata } from '@/lib/page-metadata'

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params
  return createPageMetadata(locale, 'guidesAgents')
}

export default async function AgentsRedirect({ params }: PageProps) {
  const { locale } = await params
  redirect({ href: '/guides/agents', locale })
}
