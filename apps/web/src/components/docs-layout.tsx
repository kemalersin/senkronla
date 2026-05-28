'use client'

import { useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

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
  const tNav = useTranslations('nav')
  const [activeId, setActiveId] = useState(nav[0]?.id ?? '')
  const pendingNavIdRef = useRef<string | null>(null)

  function handleNavClick(id: string) {
    setActiveId(id)
    pendingNavIdRef.current = id

    window.setTimeout(() => {
      if (pendingNavIdRef.current === id) {
        pendingNavIdRef.current = null
      }
    }, 1200)
  }

  useEffect(() => {
    const sections = nav
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null)

    if (sections.length === 0) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const pendingId = pendingNavIdRef.current

        if (pendingId) {
          const reachedTarget = entries.some(
            (entry) => entry.target.id === pendingId && entry.isIntersecting,
          )

          if (reachedTarget) {
            pendingNavIdRef.current = null
          }

          return
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5] },
    )

    for (const section of sections) {
      observer.observe(section)
    }

    return () => observer.disconnect()
  }, [nav])

  return (
    <div className="docs-shell">
      <aside className="docs-sidebar-slot" aria-label={title}>
        <div className="docs-sidebar">
          <p className="docs-sidebar-title">{title}</p>
          <nav className="docs-nav" aria-label={title}>
            {nav.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="docs-nav-link"
                data-active={activeId === item.id ? 'true' : 'false'}
                onClick={() => handleNavClick(item.id)}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="docs-sidebar-footer">
            <Link href="/guides" className="docs-nav-link">
              ← {tNav('guides')}
            </Link>
          </div>
        </div>
      </aside>

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
