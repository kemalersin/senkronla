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
        aria-label={ui.intro.links.website}
      >
        <GlobeIcon className="intro-link-icon" />
        <span className="intro-link-label">{ui.intro.links.website}</span>
      </a>
      <a
        href={SENKRONLA_DOCS_URL}
        className="btn btn-secondary btn-sm intro-link"
        target="_blank"
        rel="noreferrer"
        aria-label={ui.intro.links.docs}
      >
        <BookIcon className="intro-link-icon" />
        <span className="intro-link-label">{ui.intro.links.docs}</span>
      </a>
      <a
        href={SENKRONLA_GITHUB_URL}
        className="btn btn-secondary btn-sm intro-link"
        target="_blank"
        rel="noreferrer"
        aria-label={ui.intro.links.github}
      >
        <GitHubIcon className="intro-link-icon intro-link-icon--github" />
        <span className="intro-link-label">{ui.intro.links.github}</span>
      </a>
      <a
        href={SENKRONLA_DONATE_URL}
        className="btn btn-secondary btn-sm intro-link"
        target="_blank"
        rel="noreferrer"
        aria-label={ui.intro.links.donate}
      >
        <HeartIcon className="intro-link-icon" />
        <span className="intro-link-label">{ui.intro.links.donate}</span>
      </a>
    </nav>
  )
}
