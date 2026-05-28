import { DocTag } from '@/components/doc-tag'

interface DocsTableProps {
  headers: string[]
  rows: (string | React.ReactNode)[][]
  tagFirstColumn?: boolean
}

export function DocsTable({ headers, rows, tagFirstColumn = true }: DocsTableProps) {
  return (
    <div className="docs-table-wrap">
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
