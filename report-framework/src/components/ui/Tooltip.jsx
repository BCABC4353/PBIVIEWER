import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '../../lib/utils'

const positions = {
  top: {
    tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrow: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--text-primary)] border-x-transparent border-b-transparent',
  },
  bottom: {
    tooltip: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrow: 'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--text-primary)] border-x-transparent border-t-transparent',
  },
  left: {
    tooltip: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrow: 'left-full top-1/2 -translate-y-1/2 border-l-[var(--text-primary)] border-y-transparent border-r-transparent',
  },
  right: {
    tooltip: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrow: 'right-full top-1/2 -translate-y-1/2 border-r-[var(--text-primary)] border-y-transparent border-l-transparent',
  },
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
  className,
}) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef(null)
  const shouldReduceMotion = useReducedMotion()

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setVisible(false)
  }

  const handleFocus = () => {
    setVisible(true)
  }

  const handleBlur = () => {
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const animation = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 },
      }

  const positionClasses = positions[position] || positions.top

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
      <AnimatePresence>
        {visible && content && (
          <motion.div
            role="tooltip"
            className={cn(
              'absolute z-50 pointer-events-none',
              'px-2 py-1 text-xs font-medium',
              'bg-[var(--text-primary)] text-white rounded',
              'whitespace-nowrap',
              positionClasses.tooltip
            )}
            {...animation}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
          >
            {content}
            {/* Arrow */}
            <span
              className={cn(
                'absolute border-4',
                positionClasses.arrow
              )}
              aria-hidden="true"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
