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
  const margin = horizontal
    ? { top: 10, right: 10, left: 80, bottom: 0 }
    : { top: 10, right: 10, left: 0, bottom: 0 }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={margin}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#E4E4E7"
          horizontal={!horizontal}
          vertical={horizontal}
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#71717A' }}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#71717A' }}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#71717A' }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#71717A' }}
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
