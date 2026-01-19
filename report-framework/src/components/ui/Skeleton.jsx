import { cn } from '../../lib/utils'

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        'bg-[var(--bg-muted)] rounded',
        'motion-safe:animate-pulse',
        className
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

Skeleton.Text = function SkeletonText({ lines = 1, className }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  )
}

Skeleton.Circle = function SkeletonCircle({ size = 40, className }) {
  return (
    <Skeleton
      className={cn('rounded-full', className)}
      style={{ width: size, height: size }}
    />
  )
}

Skeleton.Card = function SkeletonCard({ className }) {
  return (
    <div className={cn('p-6 border border-[var(--border)] rounded-xl', className)} aria-hidden="true">
      <Skeleton className="h-4 w-1/3 mb-4" />
      <Skeleton className="h-8 w-1/2 mb-2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}
