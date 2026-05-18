export type SupportedChain = 'base' | 'solana' | 'arbitrum' | 'optimism' | 'polygon'

export interface OperatorMetric {
  date: string
  chain: SupportedChain
  request_count: number
  total_revenue_atomic: number
  total_revenue_usd: string
  avg_latency_ms: number
  p95_latency_ms: number
  p99_latency_ms: number
  settlement_success_rate: number
  settlement_success_count: number
  settlement_total_count: number
  fallback_count: number
  fallback_reasons: Record<string, number>
  error_breakdown: Record<string, number>
  venue_summary: Record<string, VenueSummary>
}

export interface VenueSummary {
  requests: number
  win_count: number
  win_rate: number
  avg_latency_ms: number
}

export interface AgentMetric {
  date: string
  chain: SupportedChain
  payer: string
  request_count: number
  total_fees_atomic: number
  total_fees_usd: string
  avg_latency_ms: number
  p95_latency_ms: number
  avg_edge_bps: number | null
  success_rate: number
  tier_breakdown: Record<string, number>
  routing_engine_usage: Record<string, number>
}

export interface MetricCardProps {
  label: string
  value: string | number
  subtext?: string
  trend?: {
    value: number
    positive: boolean
  }
}

export interface ChartDataPoint {
  date: string
  [key: string]: string | number
}
