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
import { chartColors } from '../../lib/colors'
import { formatDate, formatLatency } from '../../lib/utils'
import type { ChartDataPoint } from '../../lib/types'

interface LatencyChartProps {
  data: ChartDataPoint[]
  loading?: boolean
}

export default function LatencyChart({ data, loading }: LatencyChartProps) {
  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center">
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    )
  }

  const chartData = data.map((d) => ({
    ...d,
    date: formatDate(d.date as string),
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" stroke="var(--color-muted-foreground)" />
        <YAxis stroke="var(--color-muted-foreground)" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '0.5rem',
          }}
          labelStyle={{ color: 'var(--color-foreground)' }}
          formatter={(value: number) => formatLatency(value)}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="avg_latency_ms"
          stroke={chartColors.latency}
          dot={false}
          strokeWidth={2}
          name="Avg Latency"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="p95_latency_ms"
          stroke={chartColors.latencyP95}
          dot={false}
          strokeWidth={2}
          name="P95 Latency"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="p99_latency_ms"
          stroke={chartColors.latencyP99}
          dot={false}
          strokeWidth={2}
          name="P99 Latency"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
