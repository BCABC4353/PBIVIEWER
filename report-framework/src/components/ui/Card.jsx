import { forwardRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '../../lib/utils'

const paddingClasses = {
  none: '',
  compact: 'p-4',
  default: 'p-6',
  spacious: 'p-8',
}

export const Card = forwardRef(function Card(
  {
    children,
    className,
    hover = false,
    padding = 'default',
    as: Component = 'div',
    ...props
  },
  ref
) {
  const shouldReduceMotion = useReducedMotion()

  const baseClasses = cn(
    'bg-[var(--bg-card)] rounded-xl border border-[var(--border)]',
    'shadow-[var(--shadow-sm)]',
    paddingClasses[padding],
    className
  )

  if (hover) {
    return (
      <motion.div
        ref={ref}
        className={cn(
          baseClasses,
          'cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2'
        )}
        whileHover={shouldReduceMotion ? {} : {
          y: -2,
          boxShadow: 'var(--shadow-lg)',
        }}
        whileFocus={shouldReduceMotion ? {} : {
          boxShadow: 'var(--shadow-lg)',
        }}
        transition={shouldReduceMotion ? { duration: 0 } : {
          duration: 0.15,
          ease: [0.33, 1, 0.68, 1],
        }}
        tabIndex={0}
        data-card
        {...props}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <Component ref={ref} className={baseClasses} data-card {...props}>
      {children}
    </Component>
  )
})
