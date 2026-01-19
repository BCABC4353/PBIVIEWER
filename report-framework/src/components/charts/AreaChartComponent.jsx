import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { CustomTooltip } from './CustomTooltip'

export function AreaChartComponent({
  data,
  xKey,
  yKey,
  color = 'var(--chart-1)',
}) {
  // Validate data
  const validData = Array.isArray(data)
    ? data.filter((d) => d && d[yKey] != null && !Number.isNaN(d[yKey]))
    : []

  if (!validData.length) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
        No data available
      </div>
    )
  }

  const gradientId = `area-gradient-${yKey}`

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={validData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.15} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey={xKey}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          dy={10}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          dx={-10}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
