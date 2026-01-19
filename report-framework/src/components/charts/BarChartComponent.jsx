import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { CustomTooltip } from './CustomTooltip'

export function BarChartComponent({
  data,
  xKey,
  yKey,
  color = 'var(--chart-1)',
  horizontal = false,
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

  const margin = horizontal
    ? { top: 10, right: 10, left: 80, bottom: 0 }
    : { top: 10, right: 10, left: 0, bottom: 0 }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={validData}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={margin}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          horizontal={!horizontal}
          vertical={horizontal}
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            />
          </>
        ) : (
          <>
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
          </>
        )}
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey={yKey}
          fill={color}
          radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
