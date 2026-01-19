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
        <div className="p-6 border-b border-zinc-100 flex items-start justify-between">
          <div>
            {title && (
              <h3 className="font-semibold text-zinc-900">{title}</h3>
            )}
            {subtitle && (
              <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}

      {/* Body */}
      {children && <div className="p-6">{children}</div>}

      {/* Footer */}
      {footer && (
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 rounded-b-xl">
          {footer}
        </div>
      )}
    </Card>
  )
}
