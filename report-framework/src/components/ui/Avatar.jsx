import { useState } from 'react'
import { cn } from '../../lib/utils'

const sizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export function Avatar({ src, name, size = 'md', className }) {
  const [imgError, setImgError] = useState(false)
  const showImage = src && !imgError

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        'rounded-full overflow-hidden',
        'bg-[var(--bg-muted)] border-2 border-[var(--bg-card)]',
        'text-[var(--text-secondary)] font-medium',
        'ring-2 ring-[var(--border)]',
        sizes[size],
        className
      )}
      role="img"
      aria-label={name || 'Avatar'}
    >
      {showImage ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </div>
  )
}
