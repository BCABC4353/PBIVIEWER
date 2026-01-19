import { fmt } from '../../lib/utils'

export function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) {
    return null
  }

  return (
    <div className="bg-[var(--text-primary)] text-white px-3 py-2 rounded-lg shadow-[var(--shadow-lg)] text-sm">
      {label && <p className="text-white/60 mb-1">{label}</p>}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-white/70">{entry.name}:</span>
          <span className="font-medium">
            {typeof entry.value === 'number'
              ? fmt.number(entry.value)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}
