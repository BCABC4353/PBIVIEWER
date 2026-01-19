import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Error Boundary - Catches React errors and displays fallback UI
 * Prevents single component failures from crashing the entire app
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log to console in development
    console.error('ErrorBoundary caught:', error, errorInfo)

    // Call optional onError callback
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div
          className={cn(
            'flex flex-col items-center justify-center p-6 rounded-xl',
            'bg-[var(--negative-light)] border border-[var(--negative)]/20',
            'text-center',
            this.props.className
          )}
          role="alert"
        >
          <AlertTriangle className="h-8 w-8 text-[var(--negative)] mb-3" />
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
            Something went wrong
          </h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            {this.props.message || 'This component failed to render.'}
          </p>
          {this.props.showReset !== false && (
            <button
              onClick={this.handleReset}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg',
                'bg-[var(--bg-card)] border border-[var(--border)]',
                'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
              )}
            >
              Try again
            </button>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * HOC to wrap any component with error boundary
 */
export function withErrorBoundary(Component, errorBoundaryProps = {}) {
  return function WrappedComponent(props) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}
