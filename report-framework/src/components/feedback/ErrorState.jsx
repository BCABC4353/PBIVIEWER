import { AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}) {
  return (
    <div className={cn('text-center py-12 px-4', className)}>
      <div className="inline-flex p-4 bg-[var(--negative-light)] rounded-full mb-4">
        <AlertCircle className="w-6 h-6 text-[var(--negative)]" />
      </div>
      <h3 className="text-base font-medium text-[var(--text-primary)]">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {onRetry && (
        <div className="mt-6">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
