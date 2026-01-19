import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Card } from './Card'

const trendConfig = {
  up: {
    icon: TrendingUp,
    className: 'text-[var(--positive)]',
  },
  down: {
    icon: TrendingDown,
    className: 'text-[var(--negative)]',
  },
  neutral: {
    icon: Minus,
    className: 'text-[var(--text-muted)]',
  },
}

export function MetricCard({
  label,
  value,
  change,
  changeLabel,
  prefix,
  suffix,
  icon: Icon,
  trend = 'neutral',
  className,
}) {
  const { icon: TrendIcon, className: trendClassName } = trendConfig[trend] || trendConfig.neutral

  return (
    <Card hover className={className}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-secondary)] truncate">
            {label}
          </p>
          <p className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] tracking-tight mt-1">
            {prefix && <span className="text-[var(--text-muted)]">{prefix}</span>}
            {value}
            {suffix && <span className="text-[var(--text-muted)]">{suffix}</span>}
          </p>
          {(change !== undefined || changeLabel) && (
            <div className={cn('flex items-center gap-1.5 mt-2', trendClassName)}>
              <TrendIcon className="w-4 h-4 flex-shrink-0" />
              {change !== undefined && (
                <span className="text-sm font-medium">{change}</span>
              )}
              {changeLabel && (
                <span className="text-sm text-[var(--text-muted)]">{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 bg-[var(--bg-muted)] rounded-lg flex-shrink-0">
            <Icon className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
        )}
      </div>
    </Card>
  )
}
