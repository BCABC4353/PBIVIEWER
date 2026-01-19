import { ResponsiveContainer, LineChart, Line } from 'recharts'
import { cn } from '../../lib/utils'

export function Sparkline({
  data = [],
  color = 'var(--chart-1)',
  height = 32,
  showDot = false,
  className,
  'aria-label': ariaLabel,
}) {
  // Filter out invalid values (null, undefined, NaN)
  const validData = data.filter((v) => v != null && !Number.isNaN(v))

  // Convert array of numbers to Recharts format
  const chartData = validData.map((value, index) => ({ index, value }))

  if (!validData.length) {
    return (
      <div
        className={cn('bg-[var(--bg-muted)] rounded', className)}
        style={{ height }}
      />
    )
  }

  // Generate accessible label
  const minVal = Math.min(...validData)
  const maxVal = Math.max(...validData)
  const lastVal = validData[validData.length - 1]
  const defaultLabel = `Sparkline chart with ${data.length} points. Range: ${minVal} to ${maxVal}. Current: ${lastVal}`

  return (
    <div
      className={className}
      style={{ height, width: '100%' }}
      role="img"
      aria-label={ariaLabel || defaultLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={
              showDot
                ? {
                    r: 0,
                  }
                : false
            }
            activeDot={false}
            isAnimationActive={false}
          />
          {/* Show dot only on last point if showDot is true */}
          {showDot && chartData.length > 0 && (
            <Line
              type="monotone"
              dataKey="value"
              stroke="none"
              dot={(props) => {
                if (props.index === chartData.length - 1) {
                  return (
                    <circle
                      key={props.index}
                      cx={props.cx}
                      cy={props.cy}
                      r={3}
                      fill={color}
                    />
                  )
                }
                return null
              }}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
