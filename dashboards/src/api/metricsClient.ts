import type { OperatorMetric, AgentMetric, SupportedChain } from '../lib/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ezpath.myezverse.xyz'

async function fetchWithAuth(url: string, adminKey?: string): Promise<Response> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (adminKey) {
    headers['Authorization'] = `Bearer ${adminKey}`
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response
}

export async function fetchOperatorMetrics(
  chain: SupportedChain,
  date: string,
  adminKey: string,
): Promise<OperatorMetric> {
  const url = `${API_BASE_URL}/api/v1/metrics/operator/${chain}/${date}`
  const response = await fetchWithAuth(url, adminKey)
  return response.json()
}

export async function fetchOperatorMetricsByVenue(
  chain: SupportedChain,
  venue: string,
  date: string,
  adminKey: string,
): Promise<any> {
  const url = `${API_BASE_URL}/api/v1/metrics/operator/venue/${chain}/${venue}/${date}`
  const response = await fetchWithAuth(url, adminKey)
  return response.json()
}

export async function fetchOperatorMetricsAggregated(
  date: string,
  adminKey: string,
): Promise<any> {
  const url = `${API_BASE_URL}/api/v1/metrics/operator/chain/${date}`
  const response = await fetchWithAuth(url, adminKey)
  return response.json()
}

export async function fetchAgentMetrics(
  chain: SupportedChain,
  payer: string,
  date: string,
  authToken?: string,
): Promise<AgentMetric> {
  const url = `${API_BASE_URL}/api/v1/metrics/agent/${chain}/${payer}/${date}`
  const response = await fetchWithAuth(url, authToken)
  return response.json()
}

export async function fetchExecutionRecord(
  requestId: string,
  adminKey?: string,
): Promise<any> {
  const url = `${API_BASE_URL}/api/v1/metrics/execution/${requestId}`
  const response = await fetchWithAuth(url, adminKey)
  return response.json()
}

export class MetricsClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message)
    this.name = 'MetricsClientError'
  }
}
