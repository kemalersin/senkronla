import { redirect } from '@/i18n/navigation'
import { createPageMetadata } from '@/lib/page-metadata'

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params
  return createPageMetadata(locale, 'howTo')
}

export default async function HowToRedirect({ params }: PageProps) {
  const { locale } = await params
  redirect({ href: '/guides', locale })
}
