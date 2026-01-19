import { cn } from '../../lib/utils'

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('bg-zinc-200 animate-pulse rounded', className)}
      {...props}
    />
  )
}
