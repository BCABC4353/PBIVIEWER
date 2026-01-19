import { cn } from '../../lib/utils'

export function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="border-b border-zinc-200">
      <div className="flex gap-0 -mb-px overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                'px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
                isActive
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
