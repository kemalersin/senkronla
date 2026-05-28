interface DocTagProps {
  children: React.ReactNode
}

export function DocTag({ children }: DocTagProps) {
  return <span className="doc-tag">{children}</span>
}
