import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '../../lib/utils'

export function ProgressBar({
  value,
  max = 100,
  color = 'var(--accent)',
  showLabel = false,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100))
  const shouldReduceMotion = useReducedMotion()

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  }

  return (
    <div
      className={cn('w-full', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={ariaLabel}
    >
      <div className={cn(
        'bg-[var(--bg-muted)] rounded-full overflow-hidden',
        sizeClasses[size]
      )}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={shouldReduceMotion ? { width: `${percentage}%` } : { width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={shouldReduceMotion ? { duration: 0 } : {
            duration: 0.5,
            ease: [0.33, 1, 0.68, 1]
          }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
          {Math.round(percentage)}%
        </p>
      )}
    </div>
  )
}
