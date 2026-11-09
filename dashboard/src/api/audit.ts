import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { DomainKey } from './client'
import type { AuditEvent } from './types'

export function useAuditFeed(d: DomainKey, limit: number, live: boolean) {
  return useQuery({
    queryKey: ['audit-feed', d, limit],
    refetchInterval: live ? 3000 : false,
    queryFn: async () => (await api[d].get<AuditEvent[]>('/audit-events', { params: { limit } })).data,
  })
}
