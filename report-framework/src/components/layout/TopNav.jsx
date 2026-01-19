import { useState } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '../../lib/utils'
import { MobileDrawer } from './MobileDrawer'

export function TopNav({ logo, links = [], actions }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 h-16 bg-white/80 backdrop-blur-lg border-b border-zinc-200">
        <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between">
          {/* Logo */}
          <div className="font-semibold text-xl">{logo}</div>

          {/* Desktop Links */}
          <nav className="hidden md:flex items-center gap-6">
            {links.map((link, index) => (
              <a
                key={index}
                href={link.href}
                className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop Actions */}
          {actions && (
            <div className="hidden md:flex items-center gap-4">{actions}</div>
          )}

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        links={links}
      />
    </>
  )
}
