import { cn } from '../../lib/utils'

function getRowKey(row, index) {
  return row.id ?? row.key ?? index
}

export function CompactTable({
  columns,
  data,
  className,
  'aria-label': ariaLabel = 'Data table',
}) {
  if (!data || data.length === 0) {
    return (
      <div className={cn('py-8 text-center text-[var(--text-muted)] text-sm', className)}>
        No data available
      </div>
    )
  }

  return (
    <div className={cn('overflow-x-auto -mx-6 scrollbar-thin', className)}>
      <table className="w-full min-w-[500px]" aria-label={ariaLabel}>
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-4 py-2 text-left text-xs font-semibold text-[var(--text-secondary)]',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center'
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-light)]">
          {data.map((row, rowIndex) => (
            <tr key={getRowKey(row, rowIndex)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-2 text-sm text-[var(--text-secondary)]',
                    col.align === 'right' && 'text-right tabular-nums',
                    col.align === 'center' && 'text-center',
                    col.mono && 'font-mono'
                  )}
                >
                  {col.render
                    ? col.render(row[col.key], row)
                    : row[col.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
