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
import { colorByVenue } from '../../lib/colors'

interface TierBreakdownProps {
  data: Record<string, number> | undefined
  loading?: boolean
}

export default function TierBreakdown({ data, loading }: TierBreakdownProps) {
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
        <p className="text-sm text-muted-foreground">No tier data available</p>
      </div>
    )
  }

  const chartData = [
    {
      tier: 'Basic',
      count: data.basic || 0,
    },
    {
      tier: 'Resilient',
      count: data.resilient || 0,
    },
    {
      tier: 'Institutional',
      count: data.institutional || 0,
    },
  ]

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="tier" stroke="var(--color-muted-foreground)" />
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
          fill={colorByVenue['0x'] || '#3b82f6'}
          name="Requests"
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
