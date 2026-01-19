import { cn } from '../../lib/utils'
import { fmt } from '../../lib/utils'

const defaultColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export function FunnelChart({
  data = [],
  height = 300,
  showConversion = true,
  className,
  'aria-label': ariaLabel = 'Funnel chart',
}) {
  if (!data.length) {
    return (
      <div
        className={cn('flex items-center justify-center text-[var(--text-muted)]', className)}
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  const maxValue = Math.max(...data.map((d) => d.value))

  // Generate screen reader summary
  const srSummary = data.map((item, index) => {
    const prevValue = index > 0 ? data[index - 1].value : null
    const conversionRate = prevValue ? ((item.value / prevValue) * 100).toFixed(1) : null
    return `${item.name}: ${fmt.compact(item.value)}${conversionRate ? ` (${conversionRate}% conversion)` : ''}`
  }).join(', ')

  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      style={{ minHeight: height }}
      role="img"
      aria-label={`${ariaLabel}. ${srSummary}`}
    >
      {data.map((item, index) => {
        const widthPercent = (item.value / maxValue) * 100
        const prevValue = index > 0 ? data[index - 1].value : null
        const conversionRate = prevValue ? ((item.value / prevValue) * 100).toFixed(1) : null
        const color = item.color || defaultColors[index % defaultColors.length]

        return (
          <div key={index} className="flex items-center gap-4">
            {/* Label */}
            <div className="w-24 sm:w-32 flex-shrink-0 text-right">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {item.name}
              </span>
            </div>

            {/* Bar */}
            <div className="flex-1 relative">
              <div
                className="h-10 rounded-lg transition-all duration-300 flex items-center justify-end pr-3"
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor: color,
                  minWidth: '60px',
                }}
              >
                <span className="text-sm font-semibold text-white">
                  {fmt.compact(item.value)}
                </span>
              </div>
            </div>

            {/* Conversion rate */}
            {showConversion && (
              <div className="w-16 sm:w-20 flex-shrink-0 text-left">
                {conversionRate !== null ? (
                  <span className="text-sm text-[var(--text-muted)]">
                    {conversionRate}%
                  </span>
                ) : (
                  <span className="text-sm text-[var(--text-muted)]">—</span>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Legend for conversion */}
      {showConversion && data.length > 1 && (
        <div className="flex justify-end mt-2 text-xs text-[var(--text-muted)]">
          <span>Conversion from previous step</span>
        </div>
      )}
    </div>
  )
}
