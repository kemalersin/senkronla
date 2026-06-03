import type { Locale, UiMessages } from '../i18n.ts'
import {
  AGENT_SDK_URLS,
  SENKRONLA_DOCS_URL,
  SENKRONLA_DONATE_URL,
  SENKRONLA_GITHUB_URL,
  SENKRONLA_WEBSITE_URL,
} from '../site-links.ts'
import { BookIcon, CheckIcon, GitHubIcon, GlobeIcon, HeartIcon, RobotIcon } from './icons.tsx'

interface FinishScreenProps {
  ui: UiMessages
  locale: Locale
  onRestart: () => void
}

export function FinishScreen({ ui, locale, onRestart }: FinishScreenProps) {
  const { completion } = ui

  return (
    <div className="finish-screen">
      <div className="finish-screen-scroll">
        <div className="finish-screen-inner">
          <div className="finish-badge" aria-hidden="true">
            <CheckIcon />
          </div>
          <p className="finish-eyebrow">{completion.eyebrow}</p>
          <h1 className="finish-title">{completion.title}</h1>
          <p className="finish-subtitle">{completion.subtitle}</p>
          <ul className="finish-list">
            {completion.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="finish-actions-primary">
            <button type="button" className="btn btn-primary" onClick={onRestart}>
              {completion.restart}
            </button>
            <a
              href={AGENT_SDK_URLS[locale]}
              className="btn btn-secondary intro-link"
              target="_blank"
              rel="noreferrer"
            >
              <RobotIcon className="intro-link-icon" />
              {completion.showAgent}
            </a>
          </div>
        </div>
      </div>
      <footer className="finish-footer">
        <nav className="finish-links" aria-label={completion.linksNav}>
          <a
            href={SENKRONLA_WEBSITE_URL}
            className="btn btn-secondary btn-sm intro-link"
            target="_blank"
            rel="noreferrer"
            aria-label={completion.links.website}
          >
            <GlobeIcon className="intro-link-icon" />
            <span className="intro-link-label">{completion.links.website}</span>
          </a>
          <a
            href={SENKRONLA_DOCS_URL}
            className="btn btn-secondary btn-sm intro-link"
            target="_blank"
            rel="noreferrer"
            aria-label={completion.links.docs}
          >
            <BookIcon className="intro-link-icon" />
            <span className="intro-link-label">{completion.links.docs}</span>
          </a>
          <a
            href={SENKRONLA_GITHUB_URL}
            className="btn btn-secondary btn-sm intro-link"
            target="_blank"
            rel="noreferrer"
            aria-label={completion.links.github}
          >
            <GitHubIcon className="intro-link-icon intro-link-icon--github" />
            <span className="intro-link-label">{completion.links.github}</span>
          </a>
          <a
            href={SENKRONLA_DONATE_URL}
            className="btn btn-secondary btn-sm intro-link"
            target="_blank"
            rel="noreferrer"
            aria-label={completion.links.donate}
          >
            <HeartIcon className="intro-link-icon" />
            <span className="intro-link-label">{completion.links.donate}</span>
          </a>
        </nav>
      </footer>
    </div>
  )
}
