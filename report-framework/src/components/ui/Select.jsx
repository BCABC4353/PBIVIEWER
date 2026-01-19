import { forwardRef, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export const Select = forwardRef(function Select(
  {
    label,
    options = [],
    placeholder = 'Select an option',
    error,
    className,
    ...props
  },
  ref
) {
  const id = useId()
  const selectId = props.id || id
  const errorId = `${selectId}-error`

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'block w-full px-3 py-2 pr-10 min-h-[44px] sm:min-h-0 sm:py-2',
            'bg-[var(--bg-card)] border rounded-lg',
            'text-[var(--text-primary)]',
            'appearance-none cursor-pointer',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--bg-muted)]',
            error
              ? 'border-[var(--negative)] focus:ring-[var(--negative)] focus:border-[var(--negative)]'
              : 'border-[var(--border)]'
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <ChevronDown className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
        </div>
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-[var(--negative)]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
