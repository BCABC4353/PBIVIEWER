import { cn } from '../../lib/utils'
import { Card } from './Card'

export function InfoCard({
  title,
  subtitle,
  children,
  action,
  footer,
  className,
}) {
  return (
    <Card padding="none" className={className}>
      {/* Header */}
      {(title || action) && (
        <div className="p-6 border-b border-[var(--border-light)] flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
            )}
            {subtitle && (
              <p className="text-sm text-[var(--text-secondary)] mt-1">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}

      {/* Body */}
      {children && <div className="p-6">{children}</div>}

      {/* Footer */}
      {footer && (
        <div className="px-6 py-4 bg-[var(--bg-muted)] border-t border-[var(--border-light)] rounded-b-xl">
          {footer}
        </div>
      )}
    </Card>
  )
}
