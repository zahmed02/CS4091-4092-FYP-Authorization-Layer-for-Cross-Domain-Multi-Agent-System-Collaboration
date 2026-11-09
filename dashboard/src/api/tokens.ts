import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { DomainKey } from './client'
import type { PeerSyncResult, TrustDomain, VerificationResult } from './types'

export interface Team {
  team_id: string
  trust_domain_id: string
  name: string
  created_at: string
}

export interface IssueRequest {
  team_id: string
  role: string
  permitted_actions: string[]
  audience_domains?: string[]
  ttl_seconds?: number
}

export interface IssuedToken {
  token: string
  token_type: string
  jti: string
  issuer: string
  audience: string[]
  issued_at: string
  expires_at: string
  header: Record<string, unknown>
  claims: Record<string, unknown>
}

export interface TokenSummary {
  jti: string
  team_id: string
  role: string
  permitted_actions: string[]
  issued_at: string
  expires_at: string
  issuer: string
  revoked: boolean
  revoked_at: string | null
}

export interface RevokeResponse {
  jti: string
  revoked_at: string
  already_revoked: boolean
  registry_ttl_seconds: number
  reason: string | null
  propagation: PeerSyncResult[]
}

export interface ResyncResponse {
  revoked_tokens: number
  peers: string[]
  notices_sent: number
  delivered: number
  failed: number
  failures: unknown[]
}

export function useTeams(d: DomainKey) {
  return useQuery({
    queryKey: ['teams', d],
    queryFn: async () => (await api[d].get<Team[]>('/teams')).data,
  })
}

export function useTrustDomains(d: DomainKey) {
  return useQuery({
    queryKey: ['trust-domains', d],
    refetchInterval: 8000,
    queryFn: async () => (await api[d].get<TrustDomain[]>('/trust-domains')).data,
  })
}

export function useTokenLedger(d: DomainKey) {
  return useQuery({
    queryKey: ['token-ledger', d],
    refetchInterval: 4000,
    queryFn: async () => (await api[d].get<TokenSummary[]>('/tokens', { params: { limit: 50 } })).data,
  })
}

export async function createTeam(d: DomainKey, name: string): Promise<Team> {
  return (await api[d].post<Team>('/teams', { name })).data
}

export async function issueToken(d: DomainKey, body: IssueRequest): Promise<IssuedToken> {
  return (await api[d].post<IssuedToken>('/tokens/issue', body)).data
}

export async function revokeToken(d: DomainKey, jti: string, reason: string): Promise<RevokeResponse> {
  const body = reason.trim() ? { reason: reason.trim() } : {}
  return (await api[d].post<RevokeResponse>(`/tokens/${jti}/revoke`, body)).data
}

export async function resyncPeers(d: DomainKey): Promise<ResyncResponse> {
  return (await api[d].post<ResyncResponse>('/revocations/resync')).data
}

/** Like verifyToken, but a refusal that arrives as HTTP 4xx still returns its verdict. */
export async function checkToken(
  d: DomainKey,
  token: string,
  requiredAction: string | null,
): Promise<VerificationResult> {
  const res = await api[d].post<VerificationResult>(
    '/verify',
    { token, required_action: requiredAction },
    { validateStatus: (s) => s < 500 },
  )
  if (!res.data || !Array.isArray(res.data.steps)) throw new Error('Unexpected verify response')
  return res.data
}
