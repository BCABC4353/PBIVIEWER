import { cn } from '../../lib/utils'
import { Card } from '../ui/Card'
import { EmptyState } from '../feedback/EmptyState'
import { Database } from 'lucide-react'

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
  return value ?? '-'
}

function getRowKey(row, index) {
  return row.id ?? row.key ?? index
}

export function DataTable({
  columns,
  data,
  emptyMessage = 'No data available',
  emptyDescription,
  className,
  'aria-label': ariaLabel = 'Data table',
}) {
  if (!data || data.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          icon={Database}
          title={emptyMessage}
          description={emptyDescription}
        />
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto scrollbar-thin">
        <table className="w-full" aria-label={ariaLabel}>
          <thead>
            <tr className="border-b border-[var(--border)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider',
                    getAlignmentClasses(col.align, true)
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-light)]">
            {data.map((row, rowIndex) => (
              <tr
                key={getRowKey(row, rowIndex)}
                className="hover:bg-[var(--bg-hover)] transition-colors duration-150"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-4 text-sm text-[var(--text-primary)]',
                      getAlignmentClasses(col.align),
                      col.mono && 'font-mono text-[var(--text-secondary)]'
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
          <Card key={getRowKey(row, rowIndex)} padding="compact">
            {columns.map((col, colIndex) => (
              <div
                key={col.key}
                className={cn(
                  'flex justify-between gap-4 py-2',
                  colIndex !== columns.length - 1 && 'border-b border-[var(--border-light)]'
                )}
              >
                <span className="text-sm text-[var(--text-muted)] flex-shrink-0">
                  {col.label}
                </span>
                <span
                  className={cn(
                    'text-sm font-medium text-[var(--text-primary)] text-right',
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
