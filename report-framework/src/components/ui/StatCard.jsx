import { cn } from '../../lib/utils'

export function StatCard({ label, value, sublabel, trend, className }) {
  return (
    <div className={cn('p-4 text-center', className)}>
      <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
        {label}
      </p>
      <p className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight mt-1">
        {value}
      </p>
      {sublabel && (
        <p className={cn(
          'text-xs mt-1',
          trend === 'up' && 'text-[var(--positive)]',
          trend === 'down' && 'text-[var(--negative)]',
          !trend && 'text-[var(--text-muted)]'
        )}>
          {sublabel}
        </p>
      )}
    </div>
  )
}
