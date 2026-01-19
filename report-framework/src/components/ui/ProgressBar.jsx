import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

export function ProgressBar({
  value,
  max = 100,
  color = 'var(--accent)',
  showLabel = false,
  className,
}) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100))

  return (
    <div className={cn('w-full', className)}>
      <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-zinc-500 mt-1">{Math.round(percentage)}%</p>
      )}
    </div>
  )
}
