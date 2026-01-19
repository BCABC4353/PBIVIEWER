import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const variants = {
  primary: cn(
    'bg-[var(--accent)] text-white',
    'hover:bg-[var(--accent-hover)]',
    'active:bg-[var(--accent-hover)]'
  ),
  secondary: cn(
    'bg-[var(--bg-muted)] text-[var(--text-primary)]',
    'hover:bg-[var(--bg-hover)] hover:border-[var(--border)]',
    'active:bg-[var(--bg-hover)]'
  ),
  ghost: cn(
    'bg-transparent text-[var(--text-secondary)]',
    'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
    'active:bg-[var(--bg-hover)]'
  ),
  danger: cn(
    'bg-[var(--negative)] text-white',
    'hover:bg-[var(--negative)]/90',
    'active:bg-[var(--negative)]/80'
  ),
}

const sizes = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

export const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    icon: Icon,
    iconPosition = 'left',
    className,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
        </>
      )}
    </button>
  )
})
