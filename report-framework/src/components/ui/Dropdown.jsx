import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '../../lib/utils'

export function Dropdown({
  trigger,
  items = [],
  align = 'left',
  className,
}) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const dropdownRef = useRef(null)
  const triggerRef = useRef(null)
  const shouldReduceMotion = useReducedMotion()

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
        setFocusedIndex(0)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex((prev) => (prev + 1) % items.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex((prev) => (prev - 1 + items.length) % items.length)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusedIndex >= 0 && items[focusedIndex]) {
          items[focusedIndex].onClick?.()
          setOpen(false)
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  const animation = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: -8, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -8, scale: 0.96 },
      }

  return (
    <div ref={dropdownRef} className={cn('relative inline-block', className)}>
      {/* Trigger */}
      <div
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="cursor-pointer focus:outline-none"
      >
        {trigger}
      </div>

      {/* Dropdown menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-orientation="vertical"
            className={cn(
              'absolute z-50 mt-2 min-w-[180px]',
              'bg-[var(--bg-card)] border border-[var(--border)] rounded-lg',
              'shadow-[var(--shadow-lg)] py-1',
              align === 'right' ? 'right-0' : 'left-0'
            )}
            {...animation}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
          >
            {items.map((item, index) => (
              <button
                key={index}
                role="menuitem"
                onClick={() => {
                  item.onClick?.()
                  setOpen(false)
                }}
                onMouseEnter={() => setFocusedIndex(index)}
                onFocus={() => setFocusedIndex(index)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 min-h-[44px] text-sm text-left',
                  'transition-colors duration-150',
                  'focus:outline-none',
                  focusedIndex === index && 'bg-[var(--bg-hover)]',
                  item.danger
                    ? 'text-[var(--negative)] hover:bg-[var(--negative-light)]'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                )}
              >
                {item.icon && (
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                )}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
