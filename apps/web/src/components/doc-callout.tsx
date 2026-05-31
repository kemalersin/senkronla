interface DocCalloutProps {
  variant?: 'info' | 'warn' | 'tip'
  title?: string
  children: React.ReactNode
  onDismiss?: () => void
  dismissLabel?: string
}

export function DocCallout({
  variant = 'info',
  title,
  children,
  onDismiss,
  dismissLabel = 'Dismiss',
}: DocCalloutProps) {
  const hasHeader = Boolean(title || onDismiss)

  return (
    <aside className={`doc-callout doc-callout-${variant}${onDismiss ? ' doc-callout-dismissible' : ''}`}>
      {hasHeader ? (
        <div className="doc-callout-header">
          {title ? <p className="doc-callout-title">{title}</p> : null}
          {onDismiss ? (
            <button
              type="button"
              className="doc-callout-dismiss"
              aria-label={dismissLabel}
              onClick={onDismiss}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="doc-callout-body">{children}</div>
    </aside>
  )
}
