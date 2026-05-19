import { useState } from 'react'
import NavHeader from '../components/header/NavHeader'
import MetricCard from '../components/metrics/MetricCard'
import RevenueChart from '../components/charts/RevenueChart'
import LatencyChart from '../components/charts/LatencyChart'
import TierBreakdown from '../components/charts/TierBreakdown'
import { useAgentMetrics } from '../hooks/useMetricsQuery'
import { usePayerAddress } from '../hooks/useAuthToken'
import { formatUSD, formatLatency, formatBPS, formatNumber } from '../lib/utils'
import type { SupportedChain, AgentMetric } from '../lib/types'

export default function AgentDashboard() {
  const [chain, setChain] = useState<SupportedChain>('base')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const { token: payer } = usePayerAddress()
  const { data: metrics, isLoading, error } = useAgentMetrics(chain, payer || '', date)

  return (
    <div className="min-h-screen bg-background">
      <NavHeader
        title="EZ-Path Agent Metrics"
        chain={chain}
        onChainChange={setChain}
        date={date}
        onDateChange={setDate}
        isOperator={false}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-8">
          {error && (
            <div className="rounded-lg border border-error bg-card p-4">
              <p className="text-sm text-error">{error.message}</p>
            </div>
          )}

          {/* Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Total Requests"
                value={metrics ? formatNumber(metrics.request_count) : '—'}
                subtext="Requests"
              />
              <MetricCard
                label="Total Fees"
                value={metrics ? formatUSD(metrics.total_fees_usd) : '—'}
                subtext="Paid"
              />
              <MetricCard
                label="Avg Latency"
                value={metrics ? formatLatency(metrics.avg_latency_ms) : '—'}
                subtext="Your average"
              />
              <MetricCard
                label="Avg Edge"
                value={
                  metrics && metrics.avg_edge_bps
                    ? formatBPS(metrics.avg_edge_bps)
                    : '—'
                }
                subtext="vs runner-up"
              />
            </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
              <div className="metric-card">
                <h3 className="mb-4 text-lg font-semibold">Fees Trend</h3>
                <RevenueChart
                  data={
                    metrics
                      ? [
                          {
                            date: metrics.date,
                            total_revenue_usd: parseFloat(metrics.total_fees_usd),
                          },
                        ]
                      : []
                  }
                  loading={isLoading}
                />
              </div>
              <div className="metric-card">
                <h3 className="mb-4 text-lg font-semibold">Latency Trend</h3>
                <LatencyChart
                  data={
                    metrics
                      ? [
                          {
                            date: metrics.date,
                            avg_latency_ms: metrics.avg_latency_ms,
                            p95_latency_ms: metrics.p95_latency_ms,
                            p99_latency_ms: 0,
                          },
                        ]
                      : []
                  }
                  loading={isLoading}
                />
              </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="metric-card">
                <h3 className="mb-4 text-lg font-semibold">Tier Breakdown</h3>
                <TierBreakdown
                  data={metrics?.tier_breakdown}
                  loading={isLoading}
                />
              </div>
              <div className="metric-card">
                <h3 className="mb-4 text-lg font-semibold">
                  Routing Engine Usage
                </h3>
                <div className="flex flex-col gap-3">
                  {metrics?.routing_engine_usage &&
                    Object.entries(metrics.routing_engine_usage).map(
                      ([engine, count]) => (
                        <div key={engine} className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            {engine}
                          </span>
                          <span className="font-semibold text-foreground">
                            {count}
                          </span>
                        </div>
                      ),
                    )}
                  {!metrics?.routing_engine_usage && !isLoading && (
                    <p className="text-sm text-muted-foreground">
                      No routing data available
                    </p>
                  )}
                  {isLoading && (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  )}
                </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
