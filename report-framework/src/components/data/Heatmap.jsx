import { useState } from 'react'
import { cn } from '../../lib/utils'

function getColor(value, min, max, colorScale) {
  if (!colorScale || colorScale.length === 0) {
    // Default blue scale - using rgba for maximum browser/email compatibility
    // Accent color #2563EB = rgb(37, 99, 235)
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
  'aria-label': ariaLabel = 'Heatmap',
}) {
  const [hoveredCell, setHoveredCell] = useState(null)
  const [focusedCell, setFocusedCell] = useState(null)

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

  // Handle keyboard navigation
  const handleKeyDown = (e, rowIndex, colIndex) => {
    const numRows = data.length
    const numCols = data[0].length
    let newRow = rowIndex
    let newCol = colIndex

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        newRow = Math.max(0, rowIndex - 1)
        break
      case 'ArrowDown':
        e.preventDefault()
        newRow = Math.min(numRows - 1, rowIndex + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        newCol = Math.max(0, colIndex - 1)
        break
      case 'ArrowRight':
        e.preventDefault()
        newCol = Math.min(numCols - 1, colIndex + 1)
        break
      default:
        return
    }

    setFocusedCell({ row: newRow, col: newCol })
    // Focus the new cell
    const cellId = `heatmap-cell-${newRow}-${newCol}`
    document.getElementById(cellId)?.focus()
  }

  return (
    <div className={cn('overflow-x-auto', className)} role="grid" aria-label={ariaLabel}>
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
                    id={`heatmap-cell-${rowIndex}-${colIndex}`}
                    className={cn(
                      'relative h-8 rounded-sm transition-all duration-150 cursor-pointer',
                      'hover:ring-2 hover:ring-[var(--accent)] hover:ring-offset-1',
                      'focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1'
                    )}
                    style={{ backgroundColor: getColor(value, min, max, colorScale) }}
                    onMouseEnter={() => setHoveredCell({ row: rowIndex, col: colIndex, value })}
                    onMouseLeave={() => setHoveredCell(null)}
                    onFocus={() => setFocusedCell({ row: rowIndex, col: colIndex, value })}
                    onBlur={() => setFocusedCell(null)}
                    onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                    tabIndex={rowIndex === 0 && colIndex === 0 ? 0 : -1}
                    role="gridcell"
                    aria-label={`${yLabels[rowIndex] || `Row ${rowIndex + 1}`}, ${xLabels[colIndex] || `Column ${colIndex + 1}`}: ${value}`}
                  >
                    {/* Tooltip */}
                    {(hoveredCell?.row === rowIndex && hoveredCell?.col === colIndex) ||
                     (focusedCell?.row === rowIndex && focusedCell?.col === colIndex) ? (
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
                    ) : null}
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
