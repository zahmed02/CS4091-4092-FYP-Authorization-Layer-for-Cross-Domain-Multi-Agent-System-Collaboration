import { Download, Pause, Play, ScrollText, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DOMAIN_KEYS, DOMAINS } from '../api/client'
import type { DomainKey } from '../api/client'
import { useAuditFeed } from '../api/audit'
import { AuditCharts } from '../components/audit/AuditCharts'
import { EventDialog } from '../components/audit/EventDialog'
import { EVENT_ORDER, describe, reachTimes, reasonOf, toCsv, toRows } from '../components/audit/model'
import type { Row } from '../components/audit/model'
import { EVENT_META, FALLBACK_META } from '../components/eventMeta'
import { cn } from '../lib/cn'
import { clock, median, ms, shortId } from '../lib/format'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'

const LIMITS = [100, 200, 500]
const PAGE = 100

function Chip({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-semibold transition',
        on ? 'bg-accent/15 text-fg' : 'border-line text-dim hover:text-fg',
      )}
      style={on ? { borderColor: color ?? 'var(--accent)' } : undefined}
    >
      {children}
    </button>
  )
}

function Kpi({ label, value, color, hint }: { label: string; value: string; color: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-raised/60 px-4 py-3" title={hint}>
      <p className="text-2xl font-extrabold tabular-nums" style={{ color }}>
        {value}
      </p>
      <p className="text-xs text-dim">{label}</p>
    </div>
  )
}

export function Audit() {
  const [domain, setDomain] = useState<'all' | DomainKey>('all')
  const [types, setTypes] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(200)
  const [live, setLive] = useState(true)
  const [shown, setShown] = useState(PAGE)
  const [selected, setSelected] = useState<Row | null>(null)
  const a = useAuditFeed('a', limit, live)
  const b = useAuditFeed('b', limit, live)

  const all = useMemo(
    () => [...toRows('a', a.data), ...toRows('b', b.data)].sort((x, y) => y.ts - x.ts),
    [a.data, b.data],
  )
  const reasons = useMemo(
    () => [...new Set(all.map((r) => reasonOf(r)).filter((x): x is string => x !== null))].sort(),
    [all],
  )
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((r) => {
      if (domain !== 'all' && r.domain !== domain) return false
      if (types.length > 0 && !types.includes(r.event_type)) return false
      if (reason && reasonOf(r) !== reason) return false
      if (q) {
        const hay = `${r.jti ?? ''} ${r.team_id ?? ''} ${describe(r)} ${JSON.stringify(r.detail ?? {})}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [all, domain, types, reason, query])

  const accepted = rows.filter((r) => r.event_type === 'token_verified').length
  const refused = rows.filter((r) => r.event_type === 'token_rejected').length
  const reach = useMemo(() => reachTimes(all), [all])
  const med = median(reach.map((r) => r.ms))
  const failed = DOMAIN_KEYS.filter((k) => (k === 'a' ? a : b).isError)

  function download() {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audit-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Events in selection" value={String(rows.length)} color="var(--accent)" />
        <Kpi label="Accepted" value={String(accepted)} color="var(--color-ok)" />
        <Kpi label="Refused" value={String(refused)} color="var(--color-bad)" />
        <Kpi
          label="Median time for a revocation to reach the other domain"
          value={med === null ? 'n/a' : ms(med)}
          color="var(--color-tokens)"
          hint={`${reach.length} revocation${reach.length === 1 ? '' : 's'} recorded at both domains`}
        />
      </div>

      <AuditCharts rows={rows} />

      <Panel
        title="Audit trail"
        icon={<ScrollText size={16} />}
        aside={
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="!px-3 !py-1.5" onClick={() => setLive(!live)}>
              {live ? <Pause size={14} /> : <Play size={14} />} {live ? 'Pause updates' : 'Resume updates'}
            </Button>
            <Button variant="ghost" className="!px-3 !py-1.5" onClick={download} disabled={rows.length === 0}>
              <Download size={14} /> Download CSV
            </Button>
          </div>
        }
      >
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip on={domain === 'all'} onClick={() => setDomain('all')}>
              Both domains
            </Chip>
            {DOMAIN_KEYS.map((k) => (
              <Chip key={k} on={domain === k} color={DOMAINS[k].color} onClick={() => setDomain(k)}>
                {DOMAINS[k].label}
              </Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-line" />
            {LIMITS.map((n) => (
              <Chip key={n} on={limit === n} onClick={() => setLimit(n)}>
                Last {n} per domain
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {EVENT_ORDER.map((t) => {
              const m = EVENT_META[t] ?? FALLBACK_META
              return (
                <Chip
                  key={t}
                  on={types.includes(t)}
                  color={m.color}
                  onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}
                >
                  {m.label}
                </Chip>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[14rem] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                className="w-full rounded-lg border border-line bg-raised py-2 pl-9 pr-3 text-sm text-fg outline-none focus:border-accent"
                placeholder="Search token id, team, agent or reason"
                aria-label="Search the audit trail"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              className="rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg"
              aria-label="Refusal reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Any refusal reason</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {(types.length > 0 || reason || query || domain !== 'all') && (
              <Button
                variant="ghost"
                className="!px-3 !py-2"
                onClick={() => {
                  setTypes([])
                  setReason('')
                  setQuery('')
                  setDomain('all')
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {failed.length > 0 && (
          <p className="mb-3 text-sm text-warn">
            Could not read the audit trail of {failed.map((k) => DOMAINS[k].label).join(' and ')}.
          </p>
        )}
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-dim">
            {all.length === 0
              ? 'No events yet. Issue a token or run a scenario and its events appear here.'
              : 'No events match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="text-xs text-dim">
                <tr>
                  <th className="pb-2 pr-3 font-semibold">Time</th>
                  <th className="pb-2 pr-3 font-semibold">Domain</th>
                  <th className="pb-2 pr-3 font-semibold">Event</th>
                  <th className="pb-2 pr-3 font-semibold">Token</th>
                  <th className="pb-2 font-semibold">What happened</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((r) => {
                  const m = EVENT_META[r.event_type] ?? FALLBACK_META
                  return (
                    <tr
                      key={`${r.domain}-${r.event_id}`}
                      tabIndex={0}
                      onClick={() => setSelected(r)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelected(r)}
                      className="cursor-pointer border-t border-line/60 transition hover:bg-raised/60 focus-visible:bg-raised/60"
                    >
                      <td className="py-2 pr-3 font-mono text-xs text-dim">{clock(r.timestamp)}</td>
                      <td className="py-2 pr-3 font-semibold" style={{ color: DOMAINS[r.domain].color }}>
                        {DOMAINS[r.domain].label}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <m.icon size={14} style={{ color: m.color }} />
                          {m.label}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-dim">{r.jti ? shortId(r.jti) : 'n/a'}</td>
                      <td className="py-2 text-xs text-dim">{describe(r)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length > shown && (
              <div className="pt-4 text-center">
                <Button variant="ghost" onClick={() => setShown(shown + PAGE)}>
                  Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}
                </Button>
              </div>
            )}
          </div>
        )}
      </Panel>

      <EventDialog
        row={selected}
        all={all}
        onClose={() => setSelected(null)}
        onFollow={(jti) => {
          setQuery(jti)
          setSelected(null)
        }}
      />
    </div>
  )
}
