import { ResponsiveContainer, LineChart, Line } from 'recharts'
import { cn } from '../../lib/utils'

export function Sparkline({
  data = [],
  color = 'var(--chart-1)',
  height = 32,
  showDot = false,
  className,
}) {
  // Convert array of numbers to Recharts format
  const chartData = data.map((value, index) => ({ index, value }))

  if (!data.length) {
    return (
      <div
        className={cn('bg-[var(--bg-muted)] rounded', className)}
        style={{ height }}
      />
    )
  }

  return (
    <div className={className} style={{ height, width: '100%' }}>
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
