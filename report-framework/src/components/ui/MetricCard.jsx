import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Card } from './Card'

const trendStyles = {
  up: 'text-emerald-600',
  down: 'text-red-500',
  neutral: 'text-zinc-500',
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
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null

  return (
    <Card hover>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">{label}</p>
          <p className="text-2xl md:text-3xl font-semibold text-zinc-900 tracking-tight mt-1">
            {prefix}
            {value}
            {suffix}
          </p>
          {(change !== undefined || changeLabel) && (
            <div className={cn('flex items-center gap-1 mt-2', trendStyles[trend])}>
              {TrendIcon && <TrendIcon className="w-4 h-4" />}
              {change !== undefined && (
                <span className="text-sm font-medium">{change}</span>
              )}
              {changeLabel && (
                <span className="text-sm text-zinc-500">{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div className="p-2 bg-zinc-100 rounded-lg">
            <Icon className="w-5 h-5 text-zinc-600" />
          </div>
        )}
      </div>
    </Card>
  )
}
