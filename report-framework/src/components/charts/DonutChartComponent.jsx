import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { CustomTooltip } from './CustomTooltip'

const DEFAULT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
]

export function DonutChartComponent({
  data,
  dataKey,
  nameKey,
  colors = DEFAULT_COLORS,
}) {
  // Validate data - filter out entries with invalid values
  const validData = Array.isArray(data)
    ? data.filter((d) => d && d[dataKey] != null && !Number.isNaN(d[dataKey]))
    : []

  if (!validData.length) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
        No data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={validData}
          dataKey={dataKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="80%"
          paddingAngle={2}
        >
          {validData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={colors[index % colors.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend verticalAlign="bottom" height={36} />
      </PieChart>
    </ResponsiveContainer>
  )
}
