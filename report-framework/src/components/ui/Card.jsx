import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

const paddingClasses = {
  none: '',
  compact: 'p-4',
  default: 'p-6',
  spacious: 'p-8',
}

export function Card({
  children,
  className,
  hover = false,
  padding = 'default',
}) {
  const baseClasses = cn(
    'bg-white rounded-xl border border-zinc-200 shadow-sm',
    paddingClasses[padding],
    className
  )

  if (hover) {
    return (
      <motion.div
        className={cn(baseClasses, 'cursor-pointer')}
        whileHover={{
          y: -2,
          boxShadow: 'var(--shadow-lg)',
        }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    )
  }

  return <div className={baseClasses}>{children}</div>
}
