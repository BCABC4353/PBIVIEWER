import { cn } from '../../lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}) {
  return (
    <div className={cn('text-center py-12 px-4', className)}>
      {Icon && (
        <div className="inline-flex p-4 bg-[var(--bg-muted)] rounded-full mb-4">
          <Icon className="w-6 h-6 text-[var(--text-muted)]" />
        </div>
      )}
      {title && (
        <h3 className="text-base font-medium text-[var(--text-primary)]">
          {title}
        </h3>
      )}
      {description && (
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
