import { useState } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '../../lib/utils'
import { MobileDrawer } from './MobileDrawer'

export function TopNav({ logo, logoHref = '/', links = [], actions, className }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Skip to main content link for accessibility */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header
        className={cn(
          'fixed top-0 inset-x-0 z-50 h-[var(--nav-height)]',
          'bg-[var(--bg-card)]/80 backdrop-blur-lg',
          'border-b border-[var(--border)]',
          className
        )}
      >
        <div className="max-w-7xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-4">
          {/* Logo */}
          <a
            href={logoHref}
            className={cn(
              'font-semibold text-xl text-[var(--text-primary)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded-sm'
            )}
          >
            {logo}
          </a>

          {/* Desktop Links */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {links.map((link, index) => (
              <a
                key={index}
                href={link.href}
                className={cn(
                  'px-3 py-2 text-sm rounded-lg',
                  'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2'
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop Actions */}
          {actions && (
            <div className="hidden md:flex items-center gap-3">{actions}</div>
          )}

          {/* Mobile Menu Button */}
          <button
            className={cn(
              'md:hidden p-2 min-h-[44px] min-w-[44px] -mr-2',
              'flex items-center justify-center rounded-lg',
              'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2'
            )}
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      <MobileDrawer
        id="mobile-menu"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        links={links}
      />
    </>
  )
}
