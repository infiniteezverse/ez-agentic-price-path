import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { chartColors } from '../../lib/colors'

interface ErrorBreakdownProps {
  data: Record<string, number> | undefined
  loading?: boolean
}

export default function ErrorBreakdown({ data, loading }: ErrorBreakdownProps) {
  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex h-80 items-center justify-center">
        <p className="text-sm text-muted-foreground">No error data available</p>
      </div>
    )
  }

  const chartData = Object.entries(data).map(([error, count]) => ({
    error,
    count,
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="error" stroke="var(--color-muted-foreground)" />
        <YAxis stroke="var(--color-muted-foreground)" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '0.5rem',
          }}
          labelStyle={{ color: 'var(--color-foreground)' }}
        />
        <Legend />
        <Bar
          dataKey="count"
          fill={chartColors.error}
          name="Count"
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
