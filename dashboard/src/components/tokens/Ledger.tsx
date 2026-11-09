import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DOMAIN_KEYS, DOMAINS, describeError } from '../../api/client'
import type { DomainKey } from '../../api/client'
import { revokeToken, useTokenLedger } from '../../api/tokens'
import type { RevokeResponse, TokenSummary } from '../../api/tokens'
import { cn } from '../../lib/cn'
import { clock, countdown, ms, shortId } from '../../lib/format'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'

type Row = TokenSummary & { domain: DomainKey }
type Status = 'active' | 'expired' | 'revoked'

const RANGES = [
  { label: '5 minutes', ms: 5 * 60_000 },
  { label: '30 minutes', ms: 30 * 60_000 },
  { label: '3 hours', ms: 3 * 3_600_000 },
]
const ROW_H = 30

/** Greedy packing: a token goes on the first row where the previous token has already ended. */
function pack(rows: Row[]): { row: Row; track: number }[] {
  const ends: number[] = []
  return [...rows]
    .sort((a, b) => new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime())
    .map((row) => {
      const s = new Date(row.issued_at).getTime()
      let t = ends.findIndex((e) => e <= s)
      if (t === -1) t = ends.length
      ends[t] = new Date(row.expires_at).getTime()
      return { row, track: t }
    })
}

export function Ledger() {
  const a = useTokenLedger('a')
  const b = useTokenLedger('b')
  const qc = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  const [range, setRange] = useState(RANGES[1].ms)
  const [picked, setPicked] = useState<Row | null>(null)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const end = now + range * 0.12
  const start = end - range
  const x = (t: number) => ((t - start) / (end - start)) * 100
  const clampPct = (p: number) => Math.min(100, Math.max(0, p))

  const lanes = useMemo(() => {
    const out = {} as Record<DomainKey, { row: Row; track: number }[]>
    for (const k of DOMAIN_KEYS) {
      const data = (k === 'a' ? a.data : b.data) ?? []
      const rows = data
        .map((t) => ({ ...t, domain: k }) as Row)
        .filter((t) => new Date(t.expires_at).getTime() > start && new Date(t.issued_at).getTime() < end)
      out[k] = pack(rows)
    }
    return out
  }, [a.data, b.data, start, end])

  const statusOf = (r: Row): Status => (r.revoked ? 'revoked' : new Date(r.expires_at).getTime() <= now ? 'expired' : 'active')

  const revoke = useMutation<RevokeResponse, unknown, Row>({
    mutationFn: (row) => revokeToken(row.domain, row.jti, 'Revoked from the lifetime lanes'),
    onSuccess: (res, row) => {
      const p = res.propagation.map((q) => `${q.peer} ${q.status} in ${ms(q.duration_ms)}`).join(', ')
      setNote(`Revoked ${shortId(res.jti)} at ${DOMAINS[row.domain].label}. ${p || 'No peers to notify.'}`)
      setPicked(null)
      void qc.invalidateQueries({ queryKey: ['token-ledger'] })
    },
  })

  const ticks = Array.from({ length: 6 }, (_, i) => start + ((end - start) * i) / 5)
  const total = lanes.a.length + lanes.b.length
  const failed = DOMAIN_KEYS.filter((k) => (k === 'a' ? a : b).isError)
  const live = picked ? statusOf(picked) : null

  return (
    <Panel
      title="Token lifetimes"
      aside={
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <button key={r.ms} type="button" aria-pressed={range === r.ms} onClick={() => setRange(r.ms)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition', range === r.ms ? 'border-accent bg-accent/15 text-fg' : 'border-line text-dim hover:text-fg')}>
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      {failed.length > 0 && <p className="mb-3 text-sm text-warn">Could not read the tokens of {failed.map((k) => DOMAINS[k].label).join(' and ')}.</p>}
      <p className="mb-3 text-xs text-dim">
        Each bar runs from the moment a token was issued to the moment it expires. A revoked token is cut short and the rest is struck through. Click a bar to inspect or revoke it.
      </p>

      <div className="relative">
        {DOMAIN_KEYS.map((k) => {
          const tracks = Math.max(1, ...lanes[k].map((l) => l.track + 1))
          return (
            <div key={k} className="mb-3 grid grid-cols-[5.5rem_1fr] gap-3">
              <div className="pt-1 text-xs font-extrabold" style={{ color: DOMAINS[k].color }}>
                {DOMAINS[k].label}
                <p className="font-normal text-faint">{lanes[k].length} token{lanes[k].length === 1 ? '' : 's'}</p>
              </div>
              <div className="relative overflow-hidden rounded-xl border border-line bg-raised/40" style={{ height: tracks * ROW_H + 10 }}>
                {lanes[k].map(({ row, track }) => {
                  const st = statusOf(row)
                  const s = new Date(row.issued_at).getTime()
                  const e = new Date(row.expires_at).getTime()
                  const cut = row.revoked && row.revoked_at ? Math.min(e, Math.max(s, new Date(row.revoked_at).getTime())) : e
                  const left = clampPct(x(s))
                  const fullRight = clampPct(x(e))
                  const liveRight = clampPct(x(cut))
                  const col = st === 'active' ? 'var(--color-ok)' : st === 'revoked' ? 'var(--color-bad)' : 'var(--color-faint)'
                  const sel = picked?.jti === row.jti && picked.domain === row.domain
                  return (
                    <button
                      key={`${row.domain}-${row.jti}`}
                      type="button"
                      onClick={() => setPicked(sel ? null : row)}
                      title={`${row.role} · ${shortId(row.jti)} · ${st} · issued ${clock(row.issued_at)}`}
                      className="absolute flex items-center overflow-hidden rounded-md text-left text-[11px] font-semibold outline-none transition hover:brightness-125 focus-visible:ring-2 focus-visible:ring-accent"
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(0.6, fullRight - left)}%`,
                        top: 5 + track * ROW_H,
                        height: ROW_H - 6,
                        border: `1px solid color-mix(in srgb, ${col} ${sel ? 100 : 55}%, transparent)`,
                        background:
                          st === 'revoked'
                            ? `linear-gradient(90deg, color-mix(in srgb, ${col} 30%, transparent) ${((liveRight - left) / Math.max(0.01, fullRight - left)) * 100}%, repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, ${col} 18%, transparent) 5px 7px) 0)`
                            : `color-mix(in srgb, ${col} ${st === 'active' ? 22 : 10}%, transparent)`,
                        boxShadow: sel ? `0 0 14px -2px ${col}` : undefined,
                      }}
                    >
                      <span className="shrink-0 px-1.5" style={{ color: col }}>
                        {st === 'revoked' ? '✕' : st === 'active' ? '●' : '○'}
                      </span>
                      <span className={cn('truncate pr-1.5 text-fg', st === 'revoked' && 'line-through decoration-bad/60')}>
                        {row.role} {shortId(row.jti, 6)}
                      </span>
                    </button>
                  )
                })}
                {lanes[k].length === 0 && <p className="px-3 pt-2 text-xs text-faint">No tokens in this window.</p>}
                <div className="pointer-events-none absolute inset-y-0 w-px bg-accent/80" style={{ left: `${x(now)}%` }} />
              </div>
            </div>
          )
        })}
        <div className="grid grid-cols-[5.5rem_1fr] gap-3">
          <span />
          <div className="relative h-5 text-[11px] text-faint">
            {ticks.map((t, i) => (
              <span key={i} className="absolute -translate-x-1/2 font-mono" style={{ left: `${x(t)}%` }}>
                {clock(new Date(t).toISOString())}
              </span>
            ))}
            <span className="absolute -translate-x-1/2 font-bold text-accent" style={{ left: `${x(now)}%`, top: -1 }} />
          </div>
        </div>
      </div>

      {total === 0 && <p className="py-4 text-center text-sm text-dim">No tokens in this window. Issue one above, or widen the range.</p>}

      {picked && live && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised/60 p-3 text-sm">
          <Badge tone={live === 'active' ? 'ok' : live === 'revoked' ? 'bad' : 'neutral'}>{live === 'active' ? 'Active' : live === 'revoked' ? 'Revoked' : 'Expired'}</Badge>
          <span style={{ color: DOMAINS[picked.domain].color }} className="font-bold">
            {DOMAINS[picked.domain].label}
          </span>
          <span>{picked.role}</span>
          <span className="font-mono text-xs text-dim">{shortId(picked.jti)}</span>
          <span className="text-xs text-dim">{picked.permitted_actions.join(', ')}</span>
          <span className="text-xs text-dim">issued {clock(picked.issued_at)}</span>
          {live === 'active' && <span className="text-xs text-faint">{countdown(picked.expires_at, now)}</span>}
          {live === 'active' && (
            <Button variant="danger" className="ml-auto !px-3 !py-1.5" disabled={revoke.isPending} onClick={() => revoke.mutate(picked)}>
              <Ban size={14} /> Revoke
            </Button>
          )}
        </div>
      )}
      {note && <p className="mt-3 text-sm text-dim">{note}</p>}
      {revoke.isError && <p className="mt-3 text-sm text-bad">{describeError(revoke.error)}</p>}
    </Panel>
  )
}
