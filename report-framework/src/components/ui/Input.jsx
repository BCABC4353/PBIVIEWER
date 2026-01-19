import { forwardRef, useId } from 'react'
import { cn } from '../../lib/utils'

export const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    icon: Icon,
    className,
    ...props
  },
  ref
) {
  const id = useId()
  const inputId = props.id || id
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-2',
            'bg-[var(--bg-card)] border rounded-lg',
            'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--bg-muted)]',
            error
              ? 'border-[var(--negative)] focus:ring-[var(--negative)] focus:border-[var(--negative)]'
              : 'border-[var(--border)]',
            Icon && 'pl-10'
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={cn(
            error && errorId,
            hint && !error && hintId
          ) || undefined}
          {...props}
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-[var(--negative)]" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-sm text-[var(--text-muted)]">
          {hint}
        </p>
      )}
    </div>
  )
})
