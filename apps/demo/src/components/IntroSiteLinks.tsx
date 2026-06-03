import type { UiMessages } from '../i18n.ts'
import {
  SENKRONLA_DOCS_URL,
  SENKRONLA_DONATE_URL,
  SENKRONLA_GITHUB_URL,
  SENKRONLA_WEBSITE_URL,
} from '../site-links.ts'
import { BookIcon, GitHubIcon, GlobeIcon, HeartIcon } from './icons.tsx'

interface IntroSiteLinksProps {
  ui: UiMessages
  className?: string
}

export function IntroSiteLinks({ ui, className }: IntroSiteLinksProps) {
  return (
    <nav
      className={className ? `intro-links ${className}` : 'intro-links'}
      aria-label={ui.intro.linksNav}
    >
      <a
        href={SENKRONLA_WEBSITE_URL}
        className="btn btn-secondary btn-sm intro-link"
        target="_blank"
        rel="noreferrer"
      >
        <GlobeIcon className="intro-link-icon" />
        {ui.intro.links.website}
      </a>
      <a
        href={SENKRONLA_DOCS_URL}
        className="btn btn-secondary btn-sm intro-link"
        target="_blank"
        rel="noreferrer"
      >
        <BookIcon className="intro-link-icon" />
        {ui.intro.links.docs}
      </a>
      <a
        href={SENKRONLA_GITHUB_URL}
        className="btn btn-secondary btn-sm intro-link"
        target="_blank"
        rel="noreferrer"
      >
        <GitHubIcon className="intro-link-icon intro-link-icon--github" />
        {ui.intro.links.github}
      </a>
      <a
        href={SENKRONLA_DONATE_URL}
        className="btn btn-secondary btn-sm intro-link"
        target="_blank"
        rel="noreferrer"
      >
        <HeartIcon className="intro-link-icon" />
        {ui.intro.links.donate}
      </a>
    </nav>
  )
}
