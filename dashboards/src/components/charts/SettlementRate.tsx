import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts'
import { chartColors } from '../../lib/colors'
import { formatPercentage } from '../../lib/utils'

interface SettlementRateProps {
  successRate: number
  loading?: boolean
}

export default function SettlementRate({
  successRate,
  loading,
}: SettlementRateProps) {
  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const successRateNum = Math.min(Math.max(successRate, 0), 100)
  const failureRate = 100 - successRateNum

  const data = [
    { name: 'Success', value: successRateNum },
    { name: 'Failed', value: failureRate },
  ]

  return (
    <div className="flex h-80 flex-col items-center justify-center">
      <div className="mb-4 text-center">
        <div className="text-4xl font-bold text-success">
          {formatPercentage(successRateNum)}
        </div>
        <p className="text-sm text-muted-foreground">Success Rate</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            startAngle={180}
            endAngle={0}
            dataKey="value"
            isAnimationActive={false}
          >
            <Cell fill={chartColors.success} />
            <Cell fill={chartColors.error} />
          </Pie>
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
