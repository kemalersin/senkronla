interface DocSectionProps {
  id: string
  title: string
  children: React.ReactNode
}

export function DocSection({ id, title, children }: DocSectionProps) {
  return (
    <section className="doc-section">
      <h2 id={id}>{title}</h2>
      <div className="doc-section-body">{children}</div>
    </section>
  )
}
