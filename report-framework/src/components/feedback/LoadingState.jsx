import { Skeleton } from '../ui/Skeleton'
import { cn } from '../../lib/utils'

export function LoadingState({ height = 200, message, className }) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center', className)}
      style={{ height }}
      role="status"
      aria-label={message || 'Loading'}
    >
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>
      {message && (
        <p className="text-sm text-[var(--text-muted)] mt-6">{message}</p>
      )}
      <span className="sr-only">Loading...</span>
    </div>
  )
}
