import { cn } from '../../lib/utils'

export function Sidebar({ sections = [], currentPath }) {
  return (
    <aside className="hidden lg:block w-64 flex-shrink-0">
      <div className="sticky top-20 space-y-8">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            {section.title && (
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {section.title}
              </h3>
            )}
            <ul className="space-y-1">
              {section.items.map((item, itemIndex) => {
                const isActive = currentPath === item.href
                return (
                  <li key={itemIndex}>
                    <a
                      href={item.href}
                      className={cn(
                        'block px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-zinc-100 text-zinc-900 font-medium'
                          : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                      )}
                    >
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  )
}
