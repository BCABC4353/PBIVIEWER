import { Skeleton } from '../ui/Skeleton'

export function LoadingState({ height = 200, message }) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ height }}
    >
      <Skeleton className="h-4 w-48 mb-3" />
      <Skeleton className="h-4 w-32 mb-3" />
      <Skeleton className="h-4 w-40 mb-3" />
      {message && (
        <p className="text-sm text-zinc-400 mt-4">{message}</p>
      )}
    </div>
  )
}
