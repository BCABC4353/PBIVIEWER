import { useState } from 'react'
import { cn } from '../../lib/utils'

function getColor(value, min, max, colorScale) {
  if (!colorScale || colorScale.length === 0) {
    // Default blue scale
    const intensity = (value - min) / (max - min || 1)
    const alpha = Math.max(0.1, intensity)
    return `rgba(37, 99, 235, ${alpha})`
  }

  const intensity = (value - min) / (max - min || 1)
  const index = Math.min(
    Math.floor(intensity * colorScale.length),
    colorScale.length - 1
  )
  return colorScale[index]
}

export function Heatmap({
  data = [],
  xLabels = [],
  yLabels = [],
  colorScale,
  className,
}) {
  const [hoveredCell, setHoveredCell] = useState(null)

  // Calculate min/max values
  const allValues = data.flat()
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)

  if (!data.length || !data[0]?.length) {
    return (
      <div className={cn('text-center text-[var(--text-muted)] py-8', className)}>
        No data available
      </div>
    )
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="inline-block min-w-full">
        <div className="flex">
          {/* Y-axis labels */}
          <div className="flex flex-col justify-around pr-2">
            {yLabels.map((label, i) => (
              <div
                key={i}
                className="text-xs text-[var(--text-muted)] h-8 flex items-center justify-end"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${data[0].length}, minmax(2rem, 1fr))` }}>
              {data.map((row, rowIndex) =>
                row.map((value, colIndex) => (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className={cn(
                      'relative h-8 rounded-sm transition-all duration-150 cursor-pointer',
                      'hover:ring-2 hover:ring-[var(--accent)] hover:ring-offset-1'
                    )}
                    style={{ backgroundColor: getColor(value, min, max, colorScale) }}
                    onMouseEnter={() => setHoveredCell({ row: rowIndex, col: colIndex, value })}
                    onMouseLeave={() => setHoveredCell(null)}
                    role="gridcell"
                    aria-label={`${yLabels[rowIndex] || `Row ${rowIndex + 1}`}, ${xLabels[colIndex] || `Column ${colIndex + 1}`}: ${value}`}
                  >
                    {/* Tooltip */}
                    {hoveredCell?.row === rowIndex && hoveredCell?.col === colIndex && (
                      <div
                        className={cn(
                          'absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2',
                          'px-2 py-1 text-xs font-medium',
                          'bg-[var(--text-primary)] text-white rounded',
                          'whitespace-nowrap pointer-events-none'
                        )}
                      >
                        {yLabels[rowIndex] && xLabels[colIndex]
                          ? `${yLabels[rowIndex]} / ${xLabels[colIndex]}: `
                          : ''}
                        {value}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* X-axis labels */}
            <div
              className="grid gap-0.5 mt-2"
              style={{ gridTemplateColumns: `repeat(${data[0].length}, minmax(2rem, 1fr))` }}
            >
              {xLabels.map((label, i) => (
                <div
                  key={i}
                  className="text-xs text-[var(--text-muted)] text-center truncate"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
