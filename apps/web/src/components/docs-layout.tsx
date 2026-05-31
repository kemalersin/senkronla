import { DocsSidebarNav } from '@/components/docs-sidebar-nav'

export interface DocsNavItem {
  id: string
  label: string
}

interface DocsLayoutProps {
  title: string
  intro: React.ReactNode
  nav: DocsNavItem[]
  children: React.ReactNode
}

export function DocsLayout({ title, intro, nav, children }: DocsLayoutProps) {
  return (
    <div className="docs-shell">
      <DocsSidebarNav title={title} nav={nav} />

      <div className="docs-main">
        <header className="docs-header">
          <h1>{title}</h1>
          <p className="docs-intro">{intro}</p>
        </header>
        <div className="docs-content">{children}</div>
      </div>
    </div>
  )
}
