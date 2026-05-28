import { redirect } from '@/i18n/navigation'

interface PageProps {
  params: Promise<{ locale: string }>
}

export default async function QuickStartRedirect({ params }: PageProps) {
  const { locale } = await params
  redirect({ href: '/guides#checklist', locale })
}
