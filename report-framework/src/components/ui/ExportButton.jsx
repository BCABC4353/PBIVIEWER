import { useState, forwardRef } from 'react'
import { Download, Loader2, Check, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { exportToHtml } from '../../lib/exportHtml'

const variants = {
  primary: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
  secondary: 'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-hover)]',
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
}

const sizes = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

/**
 * ExportButton - Downloads a report section as self-contained HTML
 *
 * @param {string|HTMLElement} target - CSS selector or element ref to export
 * @param {string} filename - Output filename (default: 'report.html')
 * @param {string} title - HTML document title
 * @param {string} variant - Button style: 'primary' | 'secondary' | 'ghost'
 * @param {string} size - Button size: 'sm' | 'md' | 'lg'
 * @param {function} onExport - Callback after successful export
 * @param {function} onError - Callback on export error
 */
export const ExportButton = forwardRef(function ExportButton(
  {
    target = '#main',
    filename = 'report.html',
    title = 'Report',
    variant = 'secondary',
    size = 'md',
    children,
    className,
    onExport,
    onError,
    ...props
  },
  ref
) {
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('')

  const handleExport = async () => {
    if (status === 'loading') return

    setStatus('loading')
    setErrorMessage('')

    try {
      const result = await exportToHtml(target, {
        filename,
        title,
        convertSvgs: true,
        includeTimestamp: true,
      })

      setStatus('success')
      onExport?.(result)

      // Reset to idle after showing success
      setTimeout(() => setStatus('idle'), 2000)
    } catch (error) {
      console.error('Export failed:', error)
      setStatus('error')
      setErrorMessage(error.message || 'Export failed')
      onError?.(error)

      // Reset to idle after showing error
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  const getIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'success':
        return <Check className="h-4 w-4" />
      case 'error':
        return <AlertCircle className="h-4 w-4" />
      default:
        return <Download className="h-4 w-4" />
    }
  }

  const getLabel = () => {
    switch (status) {
      case 'loading':
        return 'Exporting...'
      case 'success':
        return 'Downloaded!'
      case 'error':
        return errorMessage || 'Failed'
      default:
        return children || 'Export HTML'
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleExport}
      disabled={status === 'loading'}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium',
        'transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'min-h-[44px]', // Touch target
        variants[variant],
        sizes[size],
        status === 'success' && 'bg-[var(--positive)] hover:bg-[var(--positive)] text-white',
        status === 'error' && 'bg-[var(--negative)] hover:bg-[var(--negative)] text-white',
        className
      )}
      aria-busy={status === 'loading'}
      {...props}
    >
      {getIcon()}
      <span>{getLabel()}</span>
    </button>
  )
})

/**
 * Compact export icon button (no text)
 */
export const ExportIconButton = forwardRef(function ExportIconButton(
  {
    target = '#main',
    filename = 'report.html',
    title = 'Report',
    className,
    onExport,
    onError,
    ...props
  },
  ref
) {
  const [status, setStatus] = useState('idle')

  const handleExport = async () => {
    if (status === 'loading') return

    setStatus('loading')

    try {
      const result = await exportToHtml(target, {
        filename,
        title,
        convertSvgs: true,
        includeTimestamp: true,
      })

      setStatus('success')
      onExport?.(result)
      setTimeout(() => setStatus('idle'), 2000)
    } catch (error) {
      console.error('Export failed:', error)
      setStatus('error')
      onError?.(error)
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  const getIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-5 w-5 animate-spin" />
      case 'success':
        return <Check className="h-5 w-5" />
      case 'error':
        return <AlertCircle className="h-5 w-5" />
      default:
        return <Download className="h-5 w-5" />
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleExport}
      disabled={status === 'loading'}
      className={cn(
        'inline-flex items-center justify-center rounded-lg',
        'h-11 w-11 min-h-[44px] min-w-[44px]', // Touch target
        'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        status === 'success' && 'text-[var(--positive)]',
        status === 'error' && 'text-[var(--negative)]',
        className
      )}
      aria-label="Export as HTML"
      aria-busy={status === 'loading'}
      {...props}
    >
      {getIcon()}
    </button>
  )
})
