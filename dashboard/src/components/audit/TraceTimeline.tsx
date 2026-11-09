import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DOMAIN_KEYS, DOMAINS } from '../../api/client'
import type { DomainKey } from '../../api/client'
import { clock } from '../../lib/format'
import { EVENT_META, FALLBACK_META } from '../eventMeta'
import { describe } from './model'
import type { Row } from './model'

export type Spacing = 'even' | 'real'

const TRACKS = [
  { id: 'issue', label: 'Issued and trust', types: ['token_issued', 'trust_domain_configured'] },
  { id: 'decide', label: 'Accept or refuse', types: ['token_verified', 'token_rejected'] },
  { id: 'revoke', label: 'Revocations', types: ['token_revoked'] },
  { id: 'task', label: 'Task work', types: ['task_join_requested', 'task_assigned', 'task_completed'] },
] as const

const GUTTER = 168
const TRACK_H = 38
const LANE_GAP = 26
const TOP = 34
const trackOf = (type: string): number => Math.max(0, TRACKS.findIndex((t) => (t.types as readonly string[]).includes(type)))
const yOf = (d: DomainKey, type: string) => TOP + (d === 'a' ? 0 : TRACKS.length * TRACK_H + LANE_GAP) + trackOf(type) * TRACK_H + TRACK_H / 2

const dayLabel = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function TraceTimeline({
  rows,
  count,
  spacing,
  followed,
  hovered,
  onHover,
  onSelect,
}: {
  rows: Row[]
  count: number
  spacing: Spacing
  followed: string | null
  hovered: Row | null
  onHover: (r: Row | null) => void
  onSelect: (r: Row) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(900)
  const shown = useMemo(() => [...rows].sort((a, b) => a.ts - b.ts).slice(-count), [rows, count])
  const n = shown.length
  const t0 = shown[0]?.ts ?? 0
  const t1 = shown[n - 1]?.ts ?? 1
  const STEP = 22
  const width = Math.max(GUTTER + cw, spacing === 'even' ? GUTTER + 40 + n * STEP : GUTTER + 1000)
  const xOf = (r: Row, i: number) =>
    spacing === 'even' ? GUTTER + 24 + i * STEP : GUTTER + 24 + ((r.ts - t0) / Math.max(1, t1 - t0)) * (width - GUTTER - 60)
  const height = TOP + TRACKS.length * TRACK_H * 2 + LANE_GAP + 44

  const focus = followed ?? hovered?.jti ?? null
  const pts = useMemo(() => shown.map((r, i) => ({ r, x: xOf(r, i), y: yOf(r.domain, r.event_type) })), [shown, spacing, width]) // eslint-disable-line react-hooks/exhaustive-deps
  const path = focus ? pts.filter((p) => p.r.jti === focus) : []

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setCw(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [n, spacing, cw])

  const ticks = pts.filter((_, i) => (spacing === 'even' ? i % 6 === 0 : i % Math.max(1, Math.round(n / 8)) === 0))

  return (
    <div className="flex">
      {/* labels stay put while the trace scrolls */}
      <div className="relative shrink-0" style={{ width: GUTTER, height }}>
        {DOMAIN_KEYS.map((d) =>
          TRACKS.map((t) => (
            <p key={`${d}-${t.id}`} className="absolute left-0 right-2 -translate-y-1/2 text-right text-[11px] text-dim" style={{ top: yOf(d, t.types[0]) }}>
              {t.label}
            </p>
          )),
        )}
        {DOMAIN_KEYS.map((d) => (
          <p key={d} className="absolute left-0 text-xs font-extrabold" style={{ top: yOf(d, 'token_issued') - TRACK_H / 2 - 20, color: DOMAINS[d].color }}>
            {DOMAINS[d].label}
          </p>
        ))}
      </div>
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
        <svg width={width - GUTTER} height={height} viewBox={`${GUTTER} 0 ${width - GUTTER} ${height}`} role="img" aria-label="Audit events of both domains placed on tracks along a time axis">
          <defs>
            <marker id="trace-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
          </defs>
          {DOMAIN_KEYS.map((d) => (
            <g key={d}>
              <rect x={GUTTER} y={TOP + (d === 'a' ? 0 : TRACKS.length * TRACK_H + LANE_GAP) - 4} width={width - GUTTER} height={TRACKS.length * TRACK_H + 8} rx={12} fill={`color-mix(in srgb, ${DOMAINS[d].color} 5%, transparent)`} stroke={DOMAINS[d].color} strokeOpacity={0.2} />
              {TRACKS.map((t) => (
                <line key={t.id} x1={GUTTER} x2={width} y1={yOf(d, t.types[0])} y2={yOf(d, t.types[0])} stroke="var(--color-line)" strokeDasharray="2 6" />
              ))}
            </g>
          ))}

          {/* the followed token's journey, drawn as arrows from event to event */}
          {path.slice(1).map((p, i) => {
            const q = path[i]
            const mx = (q.x + p.x) / 2
            return (
              <motion.path
                key={`${q.r.event_id}-${p.r.event_id}`}
                d={`M ${q.x} ${q.y} C ${mx} ${q.y}, ${mx} ${p.y}, ${p.x} ${p.y}`}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.4}
                markerEnd="url(#trace-arrow)"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                style={{ filter: 'drop-shadow(0 0 6px var(--accent))' }}
              />
            )
          })}

          {pts.map(({ r, x, y }) => {
            const m = EVENT_META[r.event_type] ?? FALLBACK_META
            const dim = focus !== null && r.jti !== focus
            const hot = hovered?.event_id === r.event_id && hovered.domain === r.domain
            return (
              <g key={`${r.domain}-${r.event_id}`} onMouseEnter={() => onHover(r)} onMouseLeave={() => onHover(null)} onClick={() => onSelect(r)} onFocus={() => onHover(r)} onBlur={() => onHover(null)} onKeyDown={(e) => e.key === 'Enter' && onSelect(r)} tabIndex={0} role="button" aria-label={`${m.label} at ${DOMAINS[r.domain].label}, ${clock(r.timestamp)}`} className="cursor-pointer outline-none">
                <motion.circle
                  cx={x}
                  cy={y}
                  fill={r.event_type === 'token_rejected' ? 'var(--color-panel)' : m.color}
                  stroke={m.color}
                  strokeWidth={r.event_type === 'token_rejected' ? 3 : 1.5}
                  initial={{ r: 0 }}
                  animate={{ r: hot ? 10 : 7, opacity: dim ? 0.2 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  style={{ filter: hot || !dim ? `drop-shadow(0 0 5px ${m.color})` : undefined }}
                />
                <circle cx={x} cy={y} r={14} fill="transparent" />
              </g>
            )
          })}

          {ticks.map((p) => (
            <g key={`tick-${p.r.event_id}`}>
              <line x1={p.x} x2={p.x} y1={height - 36} y2={height - 28} stroke="var(--color-faint)" />
              <text x={p.x} y={height - 14} textAnchor="middle" fontSize={10} fill="var(--color-faint)" fontFamily="ui-monospace, monospace">
                {clock(p.r.timestamp)}
              </text>
              {t1 - t0 > 12 * 3_600_000 && (
                <text x={p.x} y={height - 2} textAnchor="middle" fontSize={9} fill="var(--color-faint)">
                  {dayLabel(p.r.ts)}
                </text>
              )}
            </g>
          ))}
          {n === 0 && (
            <text x={GUTTER + 40} y={height / 2} fontSize={14} fill="var(--color-dim)">
              No events match these filters.
            </text>
          )}
        </svg>
      </div>
    </div>
  )
}

export function HoverLine({ row }: { row: Row | null }) {
  const m = row ? (EVENT_META[row.event_type] ?? FALLBACK_META) : null
  return (
    <p className="mt-2 min-h-5 text-sm text-dim" aria-live="polite">
      {row && m ? (
        <>
          <span className="font-bold" style={{ color: DOMAINS[row.domain].color }}>
            {DOMAINS[row.domain].label}
          </span>{' '}
          <span className="font-mono text-xs">{clock(row.timestamp)}</span> · <span className="font-semibold text-fg">{m.label}</span> · {describe(row)}
        </>
      ) : (
        'Hover an event to see what happened and follow its token. Click one to open its full record.'
      )}
    </p>
  )
}
