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

interface VenueData {
  name: string
  requests: number
  win_count: number
  win_rate: number
  avg_latency_ms: number
}

interface VenuePerformanceProps {
  data: Record<string, VenueData> | undefined
  loading?: boolean
}

export default function VenuePerformance({
  data,
  loading,
}: VenuePerformanceProps) {
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
        <p className="text-sm text-muted-foreground">No venue data available</p>
      </div>
    )
  }

  const chartData = Object.entries(data).map(([name, venue]) => ({
    name,
    ...venue,
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="name" stroke="var(--color-muted-foreground)" />
        <YAxis stroke="var(--color-muted-foreground)" yAxisId="left" />
        <YAxis
          stroke="var(--color-muted-foreground)"
          yAxisId="right"
          orientation="right"
        />
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
          yAxisId="left"
          dataKey="requests"
          fill={colorByVenue['0x'] || '#3b82f6'}
          name="Requests"
          isAnimationActive={false}
        />
        <Bar
          yAxisId="right"
          dataKey="win_rate"
          fill={colorByVenue['paraswap'] || '#f59e0b'}
          name="Win Rate (%)"
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
