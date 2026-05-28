interface DocCalloutProps {
  variant?: 'info' | 'warn' | 'tip'
  title?: string
  children: React.ReactNode
}

export function DocCallout({ variant = 'info', title, children }: DocCalloutProps) {
  return (
    <aside className={`doc-callout doc-callout-${variant}`}>
      {title ? <p className="doc-callout-title">{title}</p> : null}
      <div className="doc-callout-body">{children}</div>
    </aside>
  )
}
