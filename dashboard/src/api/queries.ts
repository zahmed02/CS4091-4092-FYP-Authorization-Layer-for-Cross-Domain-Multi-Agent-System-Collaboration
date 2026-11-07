import { useQuery } from '@tanstack/react-query'
import { api, root } from './client'
import type { DomainKey } from './client'
import type {
  AuditEvent,
  Contribution,
  PeerStatus,
  ProcessMetrics,
  RunSummary,
  ScenarioConfig,
  TrustDomain,
  VerificationResult,
} from './types'

export interface HealthState {
  reachable: boolean
  db: boolean
  redis: boolean
  keys: boolean
}

export function useHealth(d: DomainKey) {
  return useQuery({
    queryKey: ['health', d],
    refetchInterval: 4000,
    queryFn: async (): Promise<HealthState> => {
      const paths = ['/health', '/health/db', '/health/redis', '/health/keys']
      const res = await Promise.allSettled(paths.map((p) => root[d].get(p)))
      const ok = res.map((r) => r.status === 'fulfilled')
      return { reachable: ok[0], db: ok[1], redis: ok[2], keys: ok[3] }
    },
  })
}

export function useSelfDomain(d: DomainKey) {
  return useQuery({
    queryKey: ['self', d],
    queryFn: async () => (await api[d].get<TrustDomain>('/trust-domains/self')).data,
  })
}

export function usePeers(d: DomainKey) {
  return useQuery({
    queryKey: ['peers', d],
    refetchInterval: 8000,
    queryFn: async () => (await api[d].get<PeerStatus[]>('/revocations/peers')).data,
  })
}

export function useAuditEvents(d: DomainKey, limit = 200) {
  return useQuery({
    queryKey: ['audit', d, limit],
    refetchInterval: 2500,
    queryFn: async () =>
      (await api[d].get<AuditEvent[]>('/audit-events', { params: { limit } })).data,
  })
}

export function useProcessMetrics(d: DomainKey) {
  return useQuery({
    queryKey: ['metrics', d],
    refetchInterval: 4000,
    queryFn: async () => (await api[d].get<ProcessMetrics>('/metrics/process')).data,
  })
}

export function useContributions(
  d: DomainKey,
  taskId: string | null,
  enabled: boolean,
  polling: boolean,
  settledKey: string,
) {
  return useQuery({
    queryKey: ['contributions', d, taskId, settledKey],
    enabled: enabled && taskId !== null,
    refetchInterval: polling ? 1500 : false,
    queryFn: async () =>
      (await api[d].get<{ contributions: Contribution[] }>(`/collab/${taskId}/contributions`))
        .data.contributions,
  })
}

export function useScenarioConfig() {
  return useQuery({
    queryKey: ['scenario-config'],
    queryFn: async () => (await api.a.get<ScenarioConfig>('/scenarios/config')).data,
  })
}

export function useRunHistory() {
  return useQuery({
    queryKey: ['run-history'],
    refetchInterval: 6000,
    queryFn: async () => (await api.a.get<{ runs: RunSummary[] }>('/scenarios/runs')).data.runs,
  })
}

export async function verifyToken(
  d: DomainKey,
  token: string,
  requiredAction?: string,
): Promise<VerificationResult> {
  const res = await api[d].post<VerificationResult>('/verify', {
    token,
    required_action: requiredAction ?? null,
  })
  return res.data
}
