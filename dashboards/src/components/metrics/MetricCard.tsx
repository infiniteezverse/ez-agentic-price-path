import { TrendingUp, TrendingDown } from 'lucide-react'
import type { MetricCardProps } from '../../lib/types'

export default function MetricCard({
  label,
  value,
  subtext,
  trend,
}: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {subtext && <div className="metric-subtext">{subtext}</div>}
      {trend && (
        <div className="mt-2 flex items-center gap-1">
          {trend.positive ? (
            <TrendingUp size={16} className="text-success" />
          ) : (
            <TrendingDown size={16} className="text-error" />
          )}
          <span
            className={`text-xs font-semibold ${trend.positive ? 'text-success' : 'text-error'}`}
          >
            {trend.value > 0 ? '+' : ''}
            {trend.value.toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  )
}
