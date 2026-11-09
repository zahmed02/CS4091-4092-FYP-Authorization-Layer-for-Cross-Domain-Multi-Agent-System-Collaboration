import type { DomainKey } from '../../api/client'
import type { AuditEvent } from '../../api/types'
import { shortId } from '../../lib/format'

export interface Row extends AuditEvent {
  domain: DomainKey
  ts: number
  jti: string | null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

export function toRows(domain: DomainKey, events: AuditEvent[] | undefined): Row[] {
  return (events ?? []).map((e) => {
    const d = e.detail ?? {}
    return {
      ...e,
      domain,
      ts: new Date(e.timestamp).getTime(),
      jti: e.token_id ?? str(d.jti) ?? str(d.revoked_jti),
    }
  })
}

export const EVENT_ORDER = [
  'token_issued',
  'token_verified',
  'token_rejected',
  'token_revoked',
  'task_join_requested',
  'task_assigned',
  'task_completed',
  'trust_domain_configured',
] as const

export function reasonOf(e: AuditEvent): string | null {
  return str((e.detail ?? {}).reason_code)
}

/** One plain sentence saying what the event was. */
export function describe(e: Row): string {
  const d = e.detail ?? {}
  const list = (v: unknown) => (Array.isArray(v) ? v.join(', ') : '')
  switch (e.event_type) {
    case 'token_issued':
      return `${str(d.role) ?? 'token'} may ${list(d.permitted_actions) || 'act'}, valid ${d.ttl_seconds ?? '?'} s`
    case 'token_verified':
      return `Accepted a token from ${str(d.issuer) ?? 'unknown'}${d.required_action ? ` for ${String(d.required_action)}` : ''}`
    case 'token_rejected': {
      const step = str(d.failed_step)
      return `Refused: ${reasonOf(e) ?? 'unknown reason'}${step ? ` at the ${step} check` : ''}`
    }
    case 'token_revoked':
      return d.source === 'peer_sync'
        ? `Revocation from ${str(d.origin_domain) ?? 'peer'} applied${d.applied === false ? ' (already known)' : ''}`
        : `Revoked here${str(d.reason) ? `: ${str(d.reason)}` : ''}`
    case 'task_join_requested':
    case 'task_assigned':
      return `${str(d.agent) ?? 'Agent'} as ${str(d.task_role) ?? 'contributor'} on ${shortId(str(d.task_id), 12)}`
    case 'task_completed':
      return `${str(d.agent) ?? 'Agent'} finished ${shortId(str(d.task_id), 12)}`
    case 'trust_domain_configured':
      return `${String(d.action ?? 'configured').replaceAll('_', ' ')} for ${str(d.domain) ?? 'a domain'}`
    default:
      return ''
  }
}

export interface Reach {
  jti: string
  from: DomainKey
  to: DomainKey
  ms: number
}

/** For each revocation recorded at the issuer, how long until the peer recorded it too. */
export function reachTimes(rows: Row[]): Reach[] {
  const peer = new Map<string, Row>()
  for (const r of rows) {
    const d = r.detail ?? {}
    if (r.event_type === 'token_revoked' && d.source === 'peer_sync') {
      const j = str(d.revoked_jti)
      if (j && !peer.has(`${r.domain}:${j}`)) peer.set(`${r.domain}:${j}`, r)
    }
  }
  const out: Reach[] = []
  for (const r of rows) {
    const d = r.detail ?? {}
    if (r.event_type !== 'token_revoked' || d.source !== 'local' || !r.jti) continue
    const other: DomainKey = r.domain === 'a' ? 'b' : 'a'
    const p = peer.get(`${other}:${r.jti}`)
    if (p) out.push({ jti: r.jti, from: r.domain, to: other, ms: Math.max(0, p.ts - r.ts) })
  }
  return out
}

function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
}

export function toCsv(rows: Row[]): string {
  const head = ['time', 'domain', 'event', 'token', 'team', 'summary', 'detail']
  const lines = rows.map((r) =>
    [r.timestamp, r.domain, r.event_type, r.jti ?? '', r.team_id ?? '', describe(r), JSON.stringify(r.detail ?? {})]
      .map(cell)
      .join(','),
  )
  return [head.join(','), ...lines].join('\n')
}
