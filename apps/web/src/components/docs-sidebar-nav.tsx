'use client'

import { useEffect, useRef, useState } from 'react'
import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import type { DocsNavItem } from '@/components/docs-layout'
import { DEMO_URL } from '@/lib/site-links'

interface DocsSidebarNavProps {
  title: string
  nav: DocsNavItem[]
}

export function DocsSidebarNav({ title, nav }: DocsSidebarNavProps) {
  const tNav = useTranslations('nav')
  const pathname = usePathname()
  const isGuidesIndex = pathname === '/guides'
  const isEsrGuide = pathname === '/guides/esr'
  const isAgentsGuide = pathname === '/guides/agents'
  const showTutorialLink = isGuidesIndex
  const showGuidesBackLink = !isGuidesIndex
  const showEsrLink = isGuidesIndex
  const showAgentsLink = isGuidesIndex
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
        {(showTutorialLink || showEsrLink || showAgentsLink || showGuidesBackLink) && (
          <div className="docs-sidebar-footer">
            {showTutorialLink && (
              <a
                href={DEMO_URL}
                className="docs-nav-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tNav('tutorial')} →
              </a>
            )}
            {showEsrLink && (
              <Link href="/guides/esr" className="docs-nav-link" data-active={isEsrGuide ? 'true' : 'false'}>
                {tNav('esr')} →
              </Link>
            )}
            {showAgentsLink && (
              <Link
                href="/guides/agents"
                className="docs-nav-link"
                data-active={isAgentsGuide ? 'true' : 'false'}
              >
                {tNav('agents')} →
              </Link>
            )}
            {showGuidesBackLink && (
              <Link href="/guides" className="docs-nav-link" data-active="false">
                ← {tNav('guides')}
              </Link>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
