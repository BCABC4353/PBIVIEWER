import { cn } from '../../lib/utils'

export function Sidebar({ sections = [], currentPath, className }) {
  return (
    <aside className={cn('hidden lg:block w-64 flex-shrink-0', className)}>
      <nav
        className="sticky top-[calc(var(--nav-height)+1rem)] space-y-8"
        aria-label="Sidebar navigation"
      >
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            {section.title && (
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 px-3">
                {section.title}
              </h3>
            )}
            <ul className="space-y-1" role="list">
              {section.items.map((item, itemIndex) => {
                const isActive = currentPath === item.href
                return (
                  <li key={itemIndex}>
                    <a
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                        'transition-colors duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
                        isActive
                          ? 'bg-[var(--bg-selected)] text-[var(--accent)] font-medium'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      {item.icon && <item.icon className="w-4 h-4 flex-shrink-0" />}
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
