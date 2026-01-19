import { cn } from '../../lib/utils'
import { Card } from '../ui/Card'

function getAlignmentClasses(align, isHeader = false) {
  if (align === 'right') {
    return isHeader ? 'text-right' : 'text-right tabular-nums'
  }
  if (align === 'center') {
    return 'text-center'
  }
  return 'text-left'
}

function getCellContent(column, row) {
  const value = row[column.key]
  if (column.render) {
    return column.render(value, row)
  }
  return value
}

export function DataTable({
  columns,
  data,
  sortable = true,
  pageSize = 10,
  className,
}) {
  return (
    <div className={className}>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider',
                    getAlignmentClasses(col.align, true)
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-zinc-50 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-4 text-sm',
                      getAlignmentClasses(col.align),
                      col.mono && 'font-mono'
                    )}
                  >
                    {getCellContent(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {data.map((row, rowIndex) => (
          <Card key={rowIndex} padding="compact">
            {columns.map((col, colIndex) => (
              <div
                key={col.key}
                className={cn(
                  'flex justify-between py-2 border-b border-zinc-100',
                  colIndex === columns.length - 1 && 'border-0'
                )}
              >
                <span className="text-sm text-zinc-500">{col.label}</span>
                <span
                  className={cn(
                    'text-sm font-medium',
                    col.mono && 'font-mono'
                  )}
                >
                  {getCellContent(col, row)}
                </span>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  )
}
