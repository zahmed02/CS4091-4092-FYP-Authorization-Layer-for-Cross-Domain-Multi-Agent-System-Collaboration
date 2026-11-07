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

export interface RunView {
  taskId: string | null
  tokens: TokenInfo[]
  verdicts: Verdict[]
  facts: (Verdict | null)[]
  factTotal: number
  revoke: { t: number; propagation: PeerSyncResult[]; status: number } | null
  summary: { text: string; mode: string } | null
  outcome: { kind: 'done' | 'abort'; message: string } | null
  latest: Verdict | null
}

function domainKey(id: string | undefined): DomainKey {
  return domainById(id)?.key ?? 'a'
}

export function deriveRun(events: ScenarioEvent[], factTotal: number): RunView {
  const view: RunView = {
    taskId: null,
    tokens: [],
    verdicts: [],
    facts: Array.from({ length: factTotal }, () => null),
    factTotal,
    revoke: null,
    summary: null,
    outcome: null,
    latest: null,
  }
  for (const ev of events) {
    const d = ev.data
    if (ev.kind === 'info' && typeof d.task_id === 'string') view.taskId = d.task_id
    if (ev.kind === 'issue') {
      view.tokens.push({
        jti: d.jti,
        token: d.token,
        role: d.role,
        issuer: domainKey(d.domain),
        audience: d.audience ?? [],
        expiresAt: d.expires_at ?? null,
        graceSeconds: d.grace_seconds ?? 0,
        revoked: false,
      })
    }
    if (ev.kind === 'revoke') {
      view.revoke = {
        t: ev.t,
        propagation: d.propagation ?? [],
        status: d.status,
      }
      for (const tk of view.tokens) if (tk.jti === d.jti) tk.revoked = true
    }
    if (ev.kind === 'verdict') {
      const v: Verdict = {
        seq: ev.seq,
        t: ev.t,
        actor: ev.actor,
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
      view.latest = v
      const m = /^fact (\d+)\/(\d+)/.exec(v.what)
      if (m) {
        const idx = Number(m[1]) - 1
        if (idx >= 0 && idx < view.facts.length) view.facts[idx] = v
      }
    }
    if (ev.kind === 'summary') view.summary = { text: d.text, mode: d.mode }
    if (ev.kind === 'done' || ev.kind === 'abort') {
      view.outcome = { kind: ev.kind, message: ev.message }
    }
  }
  return view
}

// Actors look like "researcher@domain-a": the part before @ is the role.
export function tokenForActor(view: RunView, actor: string): TokenInfo | undefined {
  const role = actor.split('@')[0]
  return view.tokens.find((t) => t.role === role)
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
    blurb: 'Both agents join, the researcher sends every fact and the writer answers back.',
  },
  revoke: {
    label: 'Revoke mid-task',
    blurb: 'The researcher token is revoked part-way through. Domain B must refuse the next fact.',
  },
  scope: {
    label: 'Exceed permissions',
    blurb: 'A read-only token can read a resource but is refused when it tries to join or write.',
  },
  expired: {
    label: 'Token expires',
    blurb: 'A short-lived token works at first, then is refused once it expires.',
  },
} as const
