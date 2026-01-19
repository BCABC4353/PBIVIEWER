import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { CustomTooltip } from './CustomTooltip'

export function MultiLineChart({ data, xKey, lines }) {
  // Validate data - ensure array with valid entries
  const validData = Array.isArray(data) ? data.filter((d) => d != null) : []
  const validLines = Array.isArray(lines) ? lines : []

  if (!validData.length || !validLines.length) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
        No data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={validData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
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
        <Legend />
        {validLines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name || line.key}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
