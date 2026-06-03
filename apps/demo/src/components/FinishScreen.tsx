import type { UiMessages } from '../i18n.ts'
import {
  SENKRONLA_DOCS_URL,
  SENKRONLA_DONATE_URL,
  SENKRONLA_GITHUB_URL,
  SENKRONLA_WEBSITE_URL,
} from '../site-links.ts'
import { BookIcon, CheckIcon, GitHubIcon, GlobeIcon, HeartIcon } from './icons.tsx'

interface FinishScreenProps {
  ui: UiMessages
  onRestart: () => void
}

export function FinishScreen({ ui, onRestart }: FinishScreenProps) {
  const { completion } = ui

  return (
    <div className="finish-screen">
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
        <div className="finish-actions">
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            {completion.restart}
          </button>
          <nav className="finish-links" aria-label={completion.linksNav}>
            <a
              href={SENKRONLA_WEBSITE_URL}
              className="btn btn-secondary btn-sm intro-link"
              target="_blank"
              rel="noreferrer"
            >
              <GlobeIcon className="intro-link-icon" />
              {completion.links.website}
            </a>
            <a
              href={SENKRONLA_DOCS_URL}
              className="btn btn-secondary btn-sm intro-link"
              target="_blank"
              rel="noreferrer"
            >
              <BookIcon className="intro-link-icon" />
              {completion.links.docs}
            </a>
            <a
              href={SENKRONLA_GITHUB_URL}
              className="btn btn-secondary btn-sm intro-link"
              target="_blank"
              rel="noreferrer"
            >
              <GitHubIcon className="intro-link-icon intro-link-icon--github" />
              {completion.links.github}
            </a>
            <a
              href={SENKRONLA_DONATE_URL}
              className="btn btn-secondary btn-sm intro-link"
              target="_blank"
              rel="noreferrer"
            >
              <HeartIcon className="intro-link-icon" />
              {completion.links.donate}
            </a>
          </nav>
        </div>
      </div>
    </div>
  )
}
