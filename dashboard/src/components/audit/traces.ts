import { domainById } from '../../api/client'
import type { DomainKey } from '../../api/client'
import type { Row } from './model'

export type End = 'active' | 'completed' | 'revoked' | 'refused' | 'expired'

export interface Trace {
  jti: string
  label: string
  issuer: DomainKey | null
  events: Row[]
  end: End
  /** Index of the event where the journey stops (revoked or refused), or -1. */
  terminal: number
  start: number
  last: number
  taskId: string | null
}

export interface Run {
  id: string
  taskId: string
  traces: Trace[]
  start: number
  last: number
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

const RANK: Record<string, number> = {
  token_issued: 0,
  token_verified: 1,
  task_join_requested: 2,
  task_assigned: 3,
  task_completed: 4,
  token_rejected: 5,
  token_revoked: 6,
}

const isLocalRevoke = (e: Row) => e.event_type === 'token_revoked' && (e.detail ?? {}).source !== 'peer_sync'

function endOf(events: Row[], now: number): { end: End; terminal: number } {
  const revoked = events.findIndex(isLocalRevoke)
  if (revoked >= 0) return { end: 'revoked', terminal: revoked }
  if (events.some((e) => e.event_type === 'task_completed')) return { end: 'completed', terminal: -1 }
  const decisions = events.filter((e) => e.event_type === 'token_verified' || e.event_type === 'token_rejected')
  const lastDecision = decisions[decisions.length - 1]
  if (lastDecision?.event_type === 'token_rejected') {
    const terminal = events.lastIndexOf(lastDecision)
    return { end: (lastDecision.detail ?? {}).reason_code === 'TOKEN_EXPIRED' ? 'expired' : 'refused', terminal }
  }
  const issued = events.find((e) => e.event_type === 'token_issued')
  const ttl = Number((issued?.detail ?? {}).ttl_seconds)
  if (issued && Number.isFinite(ttl) && issued.ts + ttl * 1000 < now) return { end: 'expired', terminal: -1 }
  return { end: 'active', terminal: -1 }
}

/** One trace per token, newest first. Events without a token are ignored here. */
export function buildTraces(rows: Row[], now: number): Trace[] {
  const byJti = new Map<string, Row[]>()
  for (const r of rows) if (r.jti) byJti.set(r.jti, [...(byJti.get(r.jti) ?? []), r])

  const out: Trace[] = []
  for (const [jti, list] of byJti) {
    const events = [...list].sort((a, b) => a.ts - b.ts || (RANK[a.event_type] ?? 9) - (RANK[b.event_type] ?? 9))
    const pick = (key: string) => events.map((e) => str((e.detail ?? {})[key])).find(Boolean) ?? null
    const issuedEv = events.find((e) => e.event_type === 'token_issued')
    const { end, terminal } = endOf(events, now)
    out.push({
      jti,
      label: pick('agent') ?? pick('role') ?? 'token',
      issuer: issuedEv?.domain ?? domainById(pick('issuer'))?.key ?? null,
      events,
      end,
      terminal,
      start: events[0].ts,
      last: events[events.length - 1].ts,
      taskId: pick('task_id'),
    })
  }
  return out.sort((a, b) => b.last - a.last)
}

/**
 * One run per task. Tokens that never reached the task (for example one that was refused
 * before joining) are added when they were issued while the run was going on.
 */
export function buildRuns(traces: Trace[]): Run[] {
  const runs = new Map<string, Run>()
  for (const t of traces) {
    if (!t.taskId) continue
    const r = runs.get(t.taskId) ?? { id: t.taskId, taskId: t.taskId, traces: [], start: t.start, last: t.last }
    r.traces.push(t)
    r.start = Math.min(r.start, t.start)
    r.last = Math.max(r.last, t.last)
    runs.set(t.taskId, r)
  }
  const list = [...runs.values()]
  for (const t of traces) {
    if (t.taskId) continue
    const home = list.find((r) => t.start >= r.start - 2000 && t.start <= r.last + 2000)
    if (home) {
      home.traces.push(t)
      home.last = Math.max(home.last, t.last)
    }
  }
  return list
    .map((r) => ({ ...r, traces: r.traces.sort((a, b) => a.start - b.start) }))
    .sort((a, b) => b.last - a.last)
}

export const END_META: Record<End, { label: string; tone: 'ok' | 'bad' | 'warn' | 'neutral' | 'accent'; color: string }> = {
  active: { label: 'Still valid', tone: 'accent', color: 'var(--color-tokens)' },
  completed: { label: 'Task completed', tone: 'ok', color: 'var(--color-ok)' },
  revoked: { label: 'Revoked', tone: 'bad', color: 'var(--color-bad)' },
  refused: { label: 'Refused', tone: 'bad', color: 'var(--color-bad)' },
  expired: { label: 'Expired', tone: 'warn', color: 'var(--color-warn)' },
}
