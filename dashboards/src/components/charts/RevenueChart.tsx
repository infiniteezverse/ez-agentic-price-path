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
import { formatDate, formatUSD } from '../../lib/utils'
import type { ChartDataPoint } from '../../lib/types'

interface RevenueChartProps {
  data: ChartDataPoint[]
  loading?: boolean
}

export default function RevenueChart({ data, loading }: RevenueChartProps) {
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
          formatter={(value: number) => formatUSD(value)}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="total_revenue_usd"
          stroke={chartColors.revenue}
          dot={false}
          strokeWidth={2}
          name="Revenue"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
