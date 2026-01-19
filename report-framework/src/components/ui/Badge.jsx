import { cn } from '../../lib/utils'

const variantStyles = {
  default: 'bg-[var(--bg-muted)] text-[var(--text-secondary)] ring-[var(--border)]',
  primary: 'bg-blue-50 text-blue-700 ring-blue-200/50',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200/50',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200/50',
  danger: 'bg-red-50 text-red-700 ring-red-200/50',
  info: 'bg-cyan-50 text-cyan-700 ring-cyan-200/50',
}

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  className
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full',
          variant === 'success' && 'bg-emerald-500',
          variant === 'warning' && 'bg-amber-500',
          variant === 'danger' && 'bg-red-500',
          variant === 'primary' && 'bg-blue-500',
          variant === 'info' && 'bg-cyan-500',
          variant === 'default' && 'bg-[var(--text-muted)]',
        )} />
      )}
      {children}
    </span>
  )
}
