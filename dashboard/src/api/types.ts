export interface TrustDomain {
  trust_domain_id: string
  name: string
  public_key: string
  fingerprint: string
  is_self: boolean
  created_at: string
}

export interface PeerStatus {
  peer: string
  endpoint: string
  key_registered: boolean
  reachable: boolean
}

export interface AuditEvent {
  event_id: string
  event_type: string
  team_id: string | null
  token_id: string | null
  timestamp: string
  detail: Record<string, unknown> | null
}

export interface ProcessMetrics {
  pid: number
  rss_bytes: number
  threads: number
  redis_used_memory_bytes: number
  redis_keys: number
  audit_verifications: boolean
}

export interface VerificationStep {
  name: string
  passed: boolean
  detail: string
  duration_ms: number
}

export interface VerificationResult {
  valid: boolean
  reason_code: string | null
  verified_by: string
  issuer: string | null
  jti: string | null
  claims: Record<string, unknown> | null
  steps: VerificationStep[]
  duration_ms: number
}

export interface Contribution {
  agent_name: string
  kind: string
  content: string
  created_at?: string
}

export interface PeerSyncResult {
  peer: string
  endpoint: string
  status: string
  detail: string
  duration_ms: number
}

export type ScenarioName = 'normal' | 'revoke' | 'scope' | 'expired' | 'team'
export type RunStatus = 'running' | 'completed' | 'failed'
export type Pace = 'fast' | 'slow' | 'step'

export interface ScenarioEvent {
  seq: number
  t: number
  actor: string
  kind: 'info' | 'issue' | 'stage' | 'wait' | 'llm' | 'verdict' | 'revoke' | 'abort' | 'summary' | 'done'
  message: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
}

export interface ScenarioRun {
  run_id: string
  scenario: ScenarioName
  topic: string
  revoke_after: number
  status: RunStatus
  exit_code: number | null
  error: string | null
  mode: Pace
  waiting: string | null
  started_at: number
  events: ScenarioEvent[]
}

export interface RunSummary {
  run_id: string
  scenario: ScenarioName
  topic: string
  status: RunStatus
  exit_code: number | null
  started_at: number
  event_count: number
  duration_s: number
}

export interface ScenarioConfig {
  scenarios: ScenarioName[]
  roles: string[]
  default_topic: string
  fact_count: number
  llm_enabled: boolean
  llm_model: string
  writer_mode: 'groq' | 'template'
  active_runs: number
  expiry_ttl_seconds: number
  clock_skew_seconds: number
}
