import type { ReactNode } from 'react'

export interface DocAgentFileItem {
  href: string
  path: string
  langLabel: string
  description: string
}

export interface DocAgentFileGroup {
  id: string
  title: string
  items: DocAgentFileItem[]
}

interface DocAgentFilesProps {
  intro: ReactNode
  originNote: ReactNode
  groups: DocAgentFileGroup[]
  recommendedTitle: string
  recommendedSteps: ReactNode[]
}

export function DocAgentFiles({
  intro,
  originNote,
  groups,
  recommendedTitle,
  recommendedSteps,
}: DocAgentFilesProps) {
  return (
    <div className="doc-agent-files">
      <p>{intro}</p>
      <p className="doc-agent-files-origin-note">{originNote}</p>

      <div className="doc-agent-files-groups">
        {groups.map((group) => (
          <section key={group.id} className="doc-agent-files-group" aria-labelledby={`${group.id}-title`}>
            <h3 id={`${group.id}-title`} className="doc-agent-files-group-title">
              {group.title}
            </h3>
            <ul className="doc-agent-files-list">
              {group.items.map((item) => (
                <li key={item.href} className="doc-agent-file-row">
                  <div className="doc-agent-file-main">
                    <a href={item.href} className="doc-agent-file-path">
                      <code>{item.path}</code>
                    </a>
                    <span className="doc-agent-file-lang">{item.langLabel}</span>
                  </div>
                  <p className="doc-agent-file-desc">{item.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside className="doc-agent-files-recommended" aria-label={recommendedTitle}>
        <p className="doc-agent-files-recommended-title">{recommendedTitle}</p>
        <ol className="doc-list ordered doc-agent-files-recommended-steps">
          {recommendedSteps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </aside>
    </div>
  )
}
