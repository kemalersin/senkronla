import { DocTag } from '@/components/doc-tag'

interface DocsTableProps {
  headers: string[]
  rows: (string | React.ReactNode)[][]
  tagFirstColumn?: boolean
  /** Widen the HTTP status column in code | HTTP | action tables */
  variant?: 'code-http-action'
}

export function DocsTable({ headers, rows, tagFirstColumn = true, variant }: DocsTableProps) {
  const wrapClass = ['docs-table-wrap', variant === 'code-http-action' && 'docs-table-wrap--code-http-action']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={wrapClass}>
      <table className="docs-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>
                  {tagFirstColumn && cellIndex === 0 && typeof cell === 'string' ? (
                    <DocTag>{cell}</DocTag>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
