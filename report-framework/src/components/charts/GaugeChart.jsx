import { cn } from '../../lib/utils'
import { fmt } from '../../lib/utils'

// Using hex colors for SVG compatibility (CSS vars don't serialize well to canvas)
const defaultThresholds = [
  { value: 33, color: '#EF4444' },  // --negative
  { value: 66, color: '#F59E0B' },  // --warning
  { value: 100, color: '#10B981' }, // --positive
]

// Fallback colors for CSS variable resolution
const COLOR_MAP = {
  'var(--negative)': '#EF4444',
  'var(--warning)': '#F59E0B',
  'var(--positive)': '#10B981',
  'var(--accent)': '#2563EB',
  'var(--chart-1)': '#2563EB',
  'var(--bg-muted)': '#F4F4F5',
  'var(--text-primary)': '#18181B',
  'var(--text-muted)': '#A1A1AA',
}

const resolveColor = (color) => COLOR_MAP[color] || color

export function GaugeChart({
  value = 0,
  min = 0,
  max = 100,
  thresholds = defaultThresholds,
  label,
  size = 200,
  className,
  'aria-label': ariaLabel,
}) {
  // Normalize value to 0-100 range (guard against division by zero)
  const range = max - min
  const normalizedValue = range === 0 ? 0 : Math.max(0, Math.min(100, ((value - min) / range) * 100))

  // Calculate needle angle (0 = left, 180 = right, we want -90 to 90 degrees)
  const needleAngle = (normalizedValue / 100) * 180 - 90

  // Get current color based on value
  const getCurrentColor = () => {
    const sortedThresholds = [...thresholds].sort((a, b) => a.value - b.value)
    for (const threshold of sortedThresholds) {
      if (normalizedValue <= threshold.value) {
        return threshold.color
      }
    }
    return sortedThresholds[sortedThresholds.length - 1]?.color || 'var(--chart-1)'
  }

  const currentColor = getCurrentColor()

  // Create arc segments
  const createArcPath = (startPercent, endPercent, radius, strokeWidth) => {
    const startAngle = (startPercent / 100) * 180 - 90
    const endAngle = (endPercent / 100) * 180 - 90

    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180

    const centerX = size / 2
    const centerY = size / 2

    const x1 = centerX + radius * Math.cos(startRad)
    const y1 = centerY + radius * Math.sin(startRad)
    const x2 = centerX + radius * Math.cos(endRad)
    const y2 = centerY + radius * Math.sin(endRad)

    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`
  }

  const radius = (size / 2) - 20
  const strokeWidth = 16

  return (
    <div
      className={cn('relative inline-flex flex-col items-center', className)}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={ariaLabel || (label ? `${label}: ${fmt.number(value)}` : `Gauge showing ${fmt.number(value)} of ${fmt.number(max)}`)}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size / 2 + 20}
        viewBox={`0 0 ${size} ${size / 2 + 20}`}
        className="overflow-visible"
      >
        {/* Background arc */}
        <path
          d={createArcPath(0, 100, radius, strokeWidth)}
          fill="none"
          stroke={resolveColor('var(--bg-muted)')}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Colored segments based on thresholds */}
        {thresholds.map((threshold, index) => {
          const prevValue = index > 0 ? thresholds[index - 1].value : 0
          return (
            <path
              key={index}
              d={createArcPath(prevValue, threshold.value, radius, strokeWidth)}
              fill="none"
              stroke={resolveColor(threshold.color)}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={0.3}
            />
          )
        })}

        {/* Value arc */}
        <path
          d={createArcPath(0, normalizedValue, radius, strokeWidth)}
          fill="none"
          stroke={resolveColor(currentColor)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Needle */}
        <g transform={`rotate(${needleAngle}, ${size / 2}, ${size / 2})`}>
          <line
            x1={size / 2}
            y1={size / 2}
            x2={size / 2}
            y2={size / 2 - radius + 10}
            stroke={resolveColor('var(--text-primary)')}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={6}
            fill={resolveColor('var(--text-primary)')}
          />
        </g>

        {/* Min/Max labels */}
        <text
          x={20}
          y={size / 2 + 15}
          className="text-xs fill-[var(--text-muted)]"
          textAnchor="start"
        >
          {fmt.compact(min)}
        </text>
        <text
          x={size - 20}
          y={size / 2 + 15}
          className="text-xs fill-[var(--text-muted)]"
          textAnchor="end"
        >
          {fmt.compact(max)}
        </text>
      </svg>

      {/* Value display */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
        <div className="text-2xl font-bold text-[var(--text-primary)]">
          {fmt.number(value)}
        </div>
        {label && (
          <div className="text-sm text-[var(--text-muted)]">{label}</div>
        )}
      </div>
    </div>
  )
}
