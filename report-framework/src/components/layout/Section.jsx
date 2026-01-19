import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '../../lib/utils'

export function Section({ children, className, animate = true, id }) {
  const baseClasses = cn('py-8 md:py-12 lg:py-16', className)
  const shouldReduceMotion = useReducedMotion()

  if (!animate || shouldReduceMotion) {
    return (
      <section id={id} className={baseClasses}>
        {children}
      </section>
    )
  }

  return (
    <motion.section
      id={id}
      className={baseClasses}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{
        duration: 0.4,
        ease: [0.33, 1, 0.68, 1]
      }}
    >
      {children}
    </motion.section>
  )
}
