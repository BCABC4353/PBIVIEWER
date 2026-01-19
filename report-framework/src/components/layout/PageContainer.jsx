import { cn } from '../../lib/utils'

const sizeClasses = {
  narrow: 'max-w-2xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
}

export function PageContainer({ children, size = 'default', className }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 md:px-6 lg:px-8',
        sizeClasses[size],
        className
      )}
    >
      {children}
    </div>
  )
}
