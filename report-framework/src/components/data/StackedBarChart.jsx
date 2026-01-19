import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import { cn } from '../../lib/utils'
import { fmt } from '../../lib/utils'

const defaultColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-[var(--text-primary)] text-white px-3 py-2 rounded-lg shadow-lg text-sm">
      <p className="text-white/60 mb-1">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-white/70">{entry.name}:</span>
          <span className="font-medium">
            {typeof entry.value === 'number' ? fmt.number(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function StackedBarChart({
  data = [],
  xKey = 'name',
  segments = [],
  layout = 'horizontal',
  height = 300,
  showLegend = true,
  className,
}) {
  if (!data.length || !segments.length) {
    return (
      <div
        className={cn('flex items-center justify-center text-[var(--text-muted)]', className)}
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  // Assign default colors if not provided
  const processedSegments = segments.map((seg, index) => ({
    ...seg,
    color: seg.color || defaultColors[index % defaultColors.length],
  }))

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 10, right: 10, left: 10, bottom: showLegend ? 30 : 10 }}
        >
          {layout === 'horizontal' ? (
            <>
              <XAxis
                dataKey={xKey}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                tickFormatter={(value) => fmt.compact(value)}
              />
            </>
          ) : (
            <>
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                tickFormatter={(value) => fmt.compact(value)}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                width={80}
              />
            </>
          )}
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)' }} />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span className="text-[var(--text-secondary)] text-sm">{value}</span>
              )}
            />
          )}
          {processedSegments.map((segment) => (
            <Bar
              key={segment.key}
              dataKey={segment.key}
              name={segment.name || segment.key}
              fill={segment.color}
              stackId="stack"
              radius={[0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
