import { useQuery } from '@tanstack/react-query'
import {
  fetchOperatorMetrics,
  fetchAgentMetrics,
  fetchOperatorMetricsByVenue,
} from '../api/metricsClient'
import type { OperatorMetric, AgentMetric, SupportedChain } from '../lib/types'

export function useOperatorMetrics(
  chain: SupportedChain,
  date: string,
  adminKey: string | null,
) {
  return useQuery<OperatorMetric, Error>({
    queryKey: ['operator-metrics', chain, date, adminKey],
    queryFn: () => {
      if (!adminKey) throw new Error('Admin key required')
      return fetchOperatorMetrics(chain, date, adminKey)
    },
    enabled: !!adminKey,
    staleTime: 1000 * 10, // 10 seconds
    refetchInterval: 1000 * 10, // Refetch every 10 seconds
  })
}

export function useAgentMetrics(
  chain: SupportedChain,
  payer: string,
  date: string,
  authToken?: string,
) {
  return useQuery<AgentMetric, Error>({
    queryKey: ['agent-metrics', chain, payer, date],
    queryFn: () => fetchAgentMetrics(chain, payer, date, authToken),
    enabled: !!payer,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 10,
  })
}

export function useVenueMetrics(
  chain: SupportedChain,
  venue: string,
  date: string,
  adminKey: string | null,
) {
  return useQuery<any, Error>({
    queryKey: ['venue-metrics', chain, venue, date, adminKey],
    queryFn: () => {
      if (!adminKey) throw new Error('Admin key required')
      return fetchOperatorMetricsByVenue(chain, venue, date, adminKey)
    },
    enabled: !!adminKey,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 10,
  })
}
