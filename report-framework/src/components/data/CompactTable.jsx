import { cn } from '../../lib/utils'

export function CompactTable({ columns, data, className }) {
  return (
    <div className={cn('overflow-x-auto -mx-6', className)}>
      <table className="w-full min-w-[500px]">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-2 text-left text-xs font-semibold text-zinc-600',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center'
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-2 text-sm text-zinc-700',
                    col.align === 'right' && 'text-right tabular-nums',
                    col.align === 'center' && 'text-center',
                    col.mono && 'font-mono'
                  )}
                >
                  {col.render
                    ? col.render(row[col.key], row)
                    : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
