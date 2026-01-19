import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

export function Section({ children, className, animate = true }) {
  const baseClasses = cn('py-8 md:py-12 lg:py-16', className)

  if (!animate) {
    return <section className={baseClasses}>{children}</section>
  }

  return (
    <motion.section
      className={baseClasses}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {children}
    </motion.section>
  )
}
