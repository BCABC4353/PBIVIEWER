import { AlertCircle } from 'lucide-react'

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex p-3 bg-red-100 rounded-full mb-4">
        <AlertCircle className="w-6 h-6 text-red-500" />
      </div>
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      {description && (
        <p className="text-sm text-zinc-500 mt-1">{description}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-sm text-[var(--accent)] hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  )
}
