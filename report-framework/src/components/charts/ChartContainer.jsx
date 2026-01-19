import { Card } from '../ui/Card'
import { cn } from '../../lib/utils'

export function ChartContainer({
  title,
  subtitle,
  children,
  height = 300,
  loading = false,
  empty = false,
  emptyMessage = 'No data available',
  className,
}) {
  return (
    <Card className={className}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
          )}
          {subtitle && (
            <p className="text-sm text-[var(--text-secondary)] mt-1">{subtitle}</p>
          )}
        </div>
      )}

      {loading ? (
        <div
          className="bg-[var(--bg-muted)] rounded-lg animate-pulse"
          style={{ height }}
        />
      ) : empty ? (
        <div
          className="flex items-center justify-center text-[var(--text-muted)]"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </Card>
  )
}
