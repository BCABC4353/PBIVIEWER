import { cn } from '../../lib/utils'

const variantStyles = {
  default: 'bg-[var(--bg-muted)] text-[var(--text-secondary)] ring-[var(--border)]',
  primary: 'bg-[var(--accent-light)] text-[var(--accent-text)] ring-[var(--accent)]/20',
  success: 'bg-[var(--positive-light)] text-[var(--positive-text)] ring-[var(--positive)]/20',
  warning: 'bg-[var(--warning-light)] text-[var(--warning-text)] ring-[var(--warning)]/20',
  danger: 'bg-[var(--negative-light)] text-[var(--negative-text)] ring-[var(--negative)]/20',
  info: 'bg-[var(--info-light)] text-[var(--info-text)] ring-[var(--info)]/20',
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
          variant === 'success' && 'bg-[var(--positive)]',
          variant === 'warning' && 'bg-[var(--warning)]',
          variant === 'danger' && 'bg-[var(--negative)]',
          variant === 'primary' && 'bg-[var(--accent)]',
          variant === 'info' && 'bg-[var(--info)]',
          variant === 'default' && 'bg-[var(--text-muted)]',
        )} />
      )}
      {children}
    </span>
  )
}
