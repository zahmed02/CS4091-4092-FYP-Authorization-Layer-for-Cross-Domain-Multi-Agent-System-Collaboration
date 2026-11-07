import { domainById } from '../api/client'
import type { DomainKey } from '../api/client'
import type { PeerSyncResult, ScenarioEvent, VerificationStep } from '../api/types'

export interface TokenInfo {
  jti: string
  token: string
  role: string
  issuer: DomainKey
  audience: string[]
  expiresAt: string | null
  graceSeconds: number
  revoked: boolean
}

export interface Verdict {
  seq: number
  t: number
  actor: string
  role: string
  what: string
  accepted: boolean
  verifier: DomainKey
  status: number
  code?: string
  failedSteps: string[]
  steps: VerificationStep[]
  verificationMs?: number
  roundTripMs: number
}

export interface StageMark {
  stage: string
  t: number
  note: string
}

export interface AgentView {
  role: string
  home: DomainKey
  token: TokenInfo | null
  stage: string
  stages: StageMark[]
  accepted: number
  refused: number
  /** First time the agent reached each stage, in seconds from the start. */
  at: Record<string, number>
}

export interface LlmCall {
  seq: number
  t: number
  role: string
  purpose: string
  model: string
  latencyMs: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface Flow {
  seq: number
  role: string
  from: DomainKey
  to: DomainKey
  what: string
  accepted: boolean
}

export interface RunView {
  taskId: string | null
  scenario: string | null
  topic: string | null
  tokens: TokenInfo[]
  agents: AgentView[]
  verdicts: Verdict[]
  flows: Flow[]
  llm: LlmCall[]
  thinking: { role: string; purpose: string } | null
  revokes: { t: number; role: string; propagation: PeerSyncResult[]; status: number }[]
  summary: { text: string; mode: string } | null
  review: string | null
  outcome: { kind: 'done' | 'abort'; message: string; t: number } | null
  waiting: string | null
  lastT: number
}

function domainKey(id: string | undefined): DomainKey {
  return domainById(id)?.key ?? 'a'
}

const roleOf = (actor: string) => actor.split('@')[0]

export function deriveRun(events: ScenarioEvent[], waiting: string | null = null): RunView {
  const view: RunView = {
    taskId: null,
    scenario: null,
    topic: null,
    tokens: [],
    agents: [],
    verdicts: [],
    flows: [],
    llm: [],
    thinking: null,
    revokes: [],
    summary: null,
    review: null,
    outcome: null,
    waiting,
    lastT: 0,
  }
  const agent = (role: string, home: DomainKey): AgentView => {
    let a = view.agents.find((x) => x.role === role)
    if (!a) {
      a = { role, home, token: null, stage: 'issued', stages: [], accepted: 0, refused: 0, at: {} }
      view.agents.push(a)
    }
    return a
  }

  for (const ev of events) {
    const d = ev.data
    view.lastT = Math.max(view.lastT, ev.t)
    if (ev.kind === 'info' && typeof d.task_id === 'string') {
      view.taskId = d.task_id
      view.scenario = d.scenario ?? null
      view.topic = d.topic ?? null
    }
    if (ev.kind === 'info' && typeof d.review === 'string') view.review = d.review
    if (ev.kind === 'issue') {
      const tok: TokenInfo = {
        jti: d.jti,
        token: d.token,
        role: d.role,
        issuer: domainKey(d.domain),
        audience: d.audience ?? [],
        expiresAt: d.expires_at ?? null,
        graceSeconds: d.grace_seconds ?? 0,
        revoked: false,
      }
      view.tokens.push(tok)
      agent(d.role, tok.issuer).token = tok
    }
    if (ev.kind === 'stage') {
      const a = agent(d.role, domainKey(d.domain))
      a.stage = d.stage
      a.stages.push({ stage: d.stage, t: ev.t, note: ev.message })
      if (!(d.stage in a.at)) a.at[d.stage] = ev.t
    }
    if (ev.kind === 'llm') {
      const role = roleOf(ev.actor)
      if (d.phase === 'start') view.thinking = { role, purpose: d.purpose }
      else view.thinking = null
      if (d.phase === 'done') {
        view.llm.push({
          seq: ev.seq,
          t: ev.t,
          role,
          purpose: d.purpose,
          model: d.model,
          latencyMs: d.latency_ms,
          promptTokens: d.prompt_tokens,
          completionTokens: d.completion_tokens,
          totalTokens: d.total_tokens,
        })
      }
    }
    if (ev.kind === 'revoke') {
      view.revokes.push({
        t: ev.t,
        role: d.role,
        propagation: d.propagation ?? [],
        status: d.status,
      })
      for (const tk of view.tokens) if (tk.jti === d.jti) tk.revoked = true
    }
    if (ev.kind === 'verdict') {
      const role = roleOf(ev.actor)
      const v: Verdict = {
        seq: ev.seq,
        t: ev.t,
        actor: ev.actor,
        role,
        what: d.what,
        accepted: d.accepted,
        verifier: domainKey(d.domain),
        status: d.status,
        code: d.code,
        failedSteps: d.failed_steps ?? [],
        steps: d.steps ?? [],
        verificationMs: d.verification_ms,
        roundTripMs: d.round_trip_ms,
      }
      view.verdicts.push(v)
      const home = view.agents.find((a) => a.role === role)?.home ?? 'a'
      const a = agent(role, home)
      if (v.accepted) a.accepted += 1
      else a.refused += 1
      view.flows.push({ seq: ev.seq, role, from: home, to: v.verifier, what: v.what, accepted: v.accepted })
    }
    if (ev.kind === 'summary') view.summary = { text: d.text, mode: d.mode }
    if (ev.kind === 'done' || ev.kind === 'abort') {
      view.outcome = { kind: ev.kind, message: ev.message, t: ev.t }
    }
  }
  return view
}

export const STEP_LABELS: Record<string, string> = {
  format: 'Token format',
  issuer_key: 'Issuer key',
  signature: 'Signature',
  expiry: 'Expiry',
  audience: 'Audience',
  scope: 'Scope',
  revocation: 'Revocation',
}

export const STEP_ORDER = Object.keys(STEP_LABELS)

export const SCENARIOS = {
  normal: {
    label: 'Complete the task',
    blurb: 'Two agents join, the researcher sends facts and the writer answers back.',
  },
  team: {
    label: 'Four-agent team',
    blurb: 'Researcher, analyst, writer and reviewer hand work across both domains.',
  },
  revoke: {
    label: 'Revoke mid-task',
    blurb: 'The researcher token is revoked part-way. Domain B must refuse the next fact.',
  },
  scope: {
    label: 'Exceed permissions',
    blurb: 'A read-only token can read, but is refused when it tries to join or write.',
  },
  expired: {
    label: 'Token expires',
    blurb: 'A short-lived token works at first, then is refused once it expires.',
  },
} as const
