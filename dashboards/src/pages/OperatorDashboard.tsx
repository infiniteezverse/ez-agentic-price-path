import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import NavHeader from '../components/header/NavHeader'
import MetricCard from '../components/metrics/MetricCard'
import RevenueChart from '../components/charts/RevenueChart'
import LatencyChart from '../components/charts/LatencyChart'
import VenuePerformance from '../components/charts/VenuePerformance'
import ErrorBreakdown from '../components/charts/ErrorBreakdown'
import SettlementRate from '../components/charts/SettlementRate'
import MetricsTable from '../components/tables/MetricsTable'
import { useOperatorMetrics } from '../hooks/useMetricsQuery'
import { useAdminKey } from '../hooks/useAuthToken'
import { formatUSD, formatLatency, formatPercentage, formatNumber } from '../lib/utils'
import type { SupportedChain, Column, OperatorMetric } from '../lib/types'

export default function OperatorDashboard() {
  const [chain, setChain] = useState<SupportedChain>('base')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const { token: adminKey, setToken: setAdminKey, isSet: hasAdminKey } = useAdminKey()
  const { data: metrics, isLoading, error } = useOperatorMetrics(chain, date, adminKey)

  const metricColumns: Column<OperatorMetric>[] = [
    { key: 'date', label: 'Date', sortable: true },
    {
      key: 'request_count',
      label: 'Requests',
      sortable: true,
      render: (v) => formatNumber(v),
    },
    {
      key: 'total_revenue_usd',
      label: 'Revenue',
      sortable: true,
      render: (v) => formatUSD(v),
    },
    {
      key: 'avg_latency_ms',
      label: 'Avg Latency',
      sortable: true,
      render: (v) => formatLatency(v),
    },
    {
      key: 'settlement_success_rate',
      label: 'Settlement',
      sortable: true,
      render: (v) => formatPercentage(v),
    },
  ]

  if (!hasAdminKey) {
    return (
      <div className="min-h-screen bg-background">
        <NavHeader
          title="EZ-Path Operator Metrics"
          chain={chain}
          onChainChange={setChain}
          date={date}
          onDateChange={setDate}
          isOperator
        />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-border bg-card p-8">
            <div className="flex gap-4">
              <AlertCircle className="text-warning" size={24} />
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Admin Key Required
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter your admin API key to view operator metrics.
                </p>
                <div className="mt-4">
                  <input
                    type="password"
                    placeholder="Enter admin API key..."
                    value={adminKey || ''}
                    onChange={(e) => setAdminKey(e.target.value)}
                    className="w-full max-w-md rounded border border-border bg-input px-4 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Your key is stored locally in your browser.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <NavHeader
        title="EZ-Path Operator Metrics"
        chain={chain}
        onChainChange={setChain}
        date={date}
        onDateChange={setDate}
        isOperator
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-lg border border-error bg-card p-4">
            <p className="text-sm text-error">{error.message}</p>
          </div>
        )}

        <div className="space-y-8">
          {/* Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total Requests"
              value={metrics ? formatNumber(metrics.request_count) : '—'}
              subtext={chain}
            />
            <MetricCard
              label="Total Revenue"
              value={metrics ? formatUSD(metrics.total_revenue_usd) : '—'}
              subtext="USD"
            />
            <MetricCard
              label="Avg Latency"
              value={metrics ? formatLatency(metrics.avg_latency_ms) : '—'}
              subtext="End-to-end"
            />
            <MetricCard
              label="Settlement Success"
              value={
                metrics
                  ? formatPercentage(metrics.settlement_success_rate)
                  : '—'
              }
              subtext="Success rate"
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="metric-card">
              <h3 className="mb-4 text-lg font-semibold">Revenue Trend</h3>
              <RevenueChart data={metrics ? [metrics] : []} loading={isLoading} />
            </div>
            <div className="metric-card">
              <h3 className="mb-4 text-lg font-semibold">Settlement Rate</h3>
              <SettlementRate
                successRate={metrics?.settlement_success_rate || 0}
                loading={isLoading}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="metric-card">
              <h3 className="mb-4 text-lg font-semibold">Venue Performance</h3>
              <VenuePerformance data={metrics?.venue_summary} loading={isLoading} />
            </div>
            <div className="metric-card">
              <h3 className="mb-4 text-lg font-semibold">Error Breakdown</h3>
              <ErrorBreakdown data={metrics?.error_breakdown} loading={isLoading} />
            </div>
          </div>

          {/* Table */}
          <div className="metric-card">
            <h3 className="mb-4 text-lg font-semibold">Detailed Metrics</h3>
            <MetricsTable
              columns={metricColumns}
              data={metrics ? [metrics] : []}
              loading={isLoading}
              emptyMessage="No metrics available for this date"
            />
          </div>
        </div>
      </main>
    </div>
  )
}
