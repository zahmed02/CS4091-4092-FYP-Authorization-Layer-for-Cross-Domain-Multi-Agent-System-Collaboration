import { motion } from 'framer-motion'
import { ArrowLeftRight, Database, KeyRound, MemoryStick, Server } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DOMAIN_KEYS, DOMAINS, domainById } from '../../api/client'
import type { DomainKey } from '../../api/client'
import { useAuditEvents, useHealth, usePeers, useProcessMetrics, useSelfDomain } from '../../api/queries'
import type { AuditEvent } from '../../api/types'
import { megabytes } from '../../lib/format'
import { EVENT_META, FALLBACK_META } from '../eventMeta'

const W = 1000
const H = 650
const CY = 285
const R = 72
const CENTER: Record<DomainKey, { x: number; y: number }> = { a: { x: 230, y: CY }, b: { x: 770, y: CY } }
// Satellites sit on the outer side of each domain, away from the trust link.
const ANGLES: Record<DomainKey, number[]> = { a: [130, 180, 230, 280], b: [50, 0, 310, 260] }
const RING = 168

type Pt = { x: number; y: number }
const LINK_AB: [Pt, Pt, Pt, Pt] = [
  { x: 302, y: 252 },
  { x: 420, y: 150 },
  { x: 580, y: 150 },
  { x: 698, y: 252 },
]
const LINK_BA: [Pt, Pt, Pt, Pt] = [
  { x: 698, y: 318 },
  { x: 580, y: 420 },
  { x: 420, y: 420 },
  { x: 302, y: 318 },
]

function bez(p: [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t
  const x = u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x
  const y = u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y
  return { x, y }
}
const pathOf = (p: [Pt, Pt, Pt, Pt]) => `M ${p[0].x} ${p[0].y} C ${p[1].x} ${p[1].y}, ${p[2].x} ${p[2].y}, ${p[3].x} ${p[3].y}`
const SAMPLES = Array.from({ length: 14 }, (_, i) => i / 13)

interface Pulse {
  id: string
  kind: 'cross' | 'local'
  from: DomainKey
  to: DomainKey
  color: string
}

function pulseOf(e: AuditEvent, at: DomainKey): Pulse {
  const d = e.detail ?? {}
  const meta = EVENT_META[e.event_type] ?? FALLBACK_META
  let from: DomainKey | undefined
  if (e.event_type === 'token_verified' || e.event_type === 'token_rejected') {
    from = domainById(typeof d.issuer === 'string' ? d.issuer : null)?.key
  } else if (e.event_type === 'token_revoked' && d.source === 'peer_sync') {
    from = domainById(typeof d.origin_domain === 'string' ? d.origin_domain : null)?.key ?? (at === 'a' ? 'b' : 'a')
  }
  const color = e.event_type === 'token_verified' ? 'var(--color-ok)' : meta.color
  return from && from !== at
    ? { id: e.event_id, kind: 'cross', from, to: at, color }
    : { id: e.event_id, kind: 'local', from: at, to: at, color }
}

const SAT: { key: 'reachable' | 'db' | 'redis' | 'keys'; label: string; icon: LucideIcon }[] = [
  { key: 'reachable', label: 'API', icon: Server },
  { key: 'db', label: 'PostgreSQL', icon: Database },
  { key: 'redis', label: 'Redis', icon: MemoryStick },
  { key: 'keys', label: 'Signing keys', icon: KeyRound },
]

function Domain({ d, mountedAt, now }: { d: DomainKey; mountedAt: number; now: number }) {
  const meta = DOMAINS[d]
  const c = CENTER[d]
  const health = useHealth(d)
  const self = useSelfDomain(d)
  const metrics = useProcessMetrics(d)
  const audit = useAuditEvents(d, 200)
  const h = health.data
  const allUp = h ? h.reachable && h.db && h.redis && h.keys : undefined
  const count = (t: string) => audit.data?.filter((e) => e.event_type === t).length ?? 0
  const tiles = [
    { label: 'Issued', value: count('token_issued'), color: 'var(--color-tokens)' },
    { label: 'Accepted', value: count('token_verified'), color: 'var(--color-ok)' },
    { label: 'Refused', value: count('token_rejected'), color: 'var(--color-bad)' },
    { label: 'Revoked', value: count('token_revoked'), color: 'var(--color-bad)' },
  ]
  const fresh = (audit.data ?? []).filter((e) => new Date(e.timestamp).getTime() > mountedAt - 3000 && now - new Date(e.timestamp).getTime() < 7000)
  const rings = fresh.map((e) => pulseOf(e, d)).filter((p) => p.kind === 'local')
  const fp = self.data?.fingerprint

  return (
    <g>
      {/* slow orbit ring that carries the satellites */}
      <circle cx={c.x} cy={c.y} r={RING} fill="none" stroke={meta.color} strokeOpacity={0.22} strokeDasharray="3 9" className="orbit" style={{ transformOrigin: `${c.x}px ${c.y}px` }} />
      {SAT.map((s, i) => {
        const a = (ANGLES[d][i] * Math.PI) / 180
        const x = c.x + RING * Math.cos(a)
        const y = c.y + RING * Math.sin(a)
        const ok = h ? h[s.key] : undefined
        const col = ok === undefined ? 'var(--color-faint)' : ok ? 'var(--color-ok)' : 'var(--color-bad)'
        return (
          <g key={s.key}>
            <line x1={c.x} y1={c.y} x2={x} y2={y} stroke={col} strokeOpacity={0.35} strokeWidth={1.5} />
            <motion.circle
              cx={x}
              cy={y}
              r={26}
              fill="var(--color-panel)"
              stroke={col}
              strokeWidth={2}
              animate={ok === false ? { r: [26, 30, 26] } : { r: 26 }}
              transition={{ repeat: ok === false ? Infinity : 0, duration: 1.2 }}
              style={{ filter: `drop-shadow(0 0 8px ${col})` }}
            >
              <title>{`${s.label}: ${ok === undefined ? 'checking' : ok ? 'healthy' : 'down'}`}</title>
            </motion.circle>
            <s.icon x={x - 11} y={y - 11} size={22} color={col} />
            <text x={x} y={y + 44} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-fg)">
              {s.label}
            </text>
            <text x={x} y={y + 60} textAnchor="middle" fontSize={11} fill={col}>
              {ok === undefined ? 'checking' : ok ? 'healthy' : 'down'}
            </text>
          </g>
        )
      })}

      {/* the domain itself */}
      <motion.circle
        cx={c.x}
        cy={c.y}
        r={R + 14}
        fill="none"
        stroke={meta.color}
        strokeOpacity={0.35}
        animate={{ r: [R + 12, R + 20, R + 12], strokeOpacity: [0.4, 0.1, 0.4] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
      />
      <circle
        cx={c.x}
        cy={c.y}
        r={R}
        fill={`color-mix(in srgb, ${meta.color} 14%, var(--color-panel))`}
        stroke={allUp === false ? 'var(--color-bad)' : meta.color}
        strokeWidth={3}
        style={{ filter: `drop-shadow(0 0 22px ${meta.color})` }}
      />
      <text x={c.x} y={c.y - 4} textAnchor="middle" fontSize={22} fontWeight={800} fill={meta.color}>
        {meta.label}
      </text>
      <text x={c.x} y={c.y + 20} textAnchor="middle" fontSize={12} fill="var(--color-dim)">
        {self.data?.name ?? 'reading identity'}
      </text>
      <text x={c.x} y={c.y + R + 40} textAnchor="middle" fontSize={11} fill="var(--color-faint)" fontFamily="ui-monospace, monospace">
        {fp ? `${fp.slice(0, 7)}${fp.slice(7, 21)}…` : ''}
        <title>{fp}</title>
      </text>

      {rings.map((p) => (
        <motion.circle
          key={p.id}
          cx={c.x}
          cy={c.y}
          fill="none"
          stroke={p.color}
          strokeWidth={3}
          initial={{ r: R, opacity: 0.9 }}
          animate={{ r: R + 70, opacity: 0 }}
          transition={{ duration: 1.3, ease: 'easeOut' }}
        />
      ))}

      {/* counters */}
      {tiles.map((t, i) => {
        const x = c.x - 176 + i * 91
        return (
          <g key={t.label}>
            <rect x={x} y={500} width={83} height={56} rx={12} fill="var(--color-panel)" stroke={t.color} strokeOpacity={0.4} />
            <motion.text
              key={t.value}
              x={x + 41.5}
              y={527}
              textAnchor="middle"
              fontSize={22}
              fontWeight={800}
              fill={t.color}
              initial={{ opacity: 0.25 }}
              animate={{ opacity: 1 }}
            >
              {t.value}
            </motion.text>
            <text x={x + 41.5} y={546} textAnchor="middle" fontSize={11} fill="var(--color-dim)">
              {t.label}
            </text>
          </g>
        )
      })}
      {metrics.data && (
        <text x={c.x} y={585} textAnchor="middle" fontSize={11} fill="var(--color-faint)">
          {`memory ${megabytes(metrics.data.rss_bytes)}  ·  ${metrics.data.redis_keys} revoked in Redis  ·  audit on verify ${metrics.data.audit_verifications ? 'on' : 'off'}`}
        </text>
      )}
    </g>
  )
}

function Direction({ from, to, path, labelY }: { from: DomainKey; to: DomainKey; path: [Pt, Pt, Pt, Pt]; labelY: number }) {
  const peers = usePeers(from)
  const peer = peers.data?.find((p) => p.peer === DOMAINS[to].id) ?? peers.data?.[0]
  const ready = peer ? peer.key_registered && peer.reachable : undefined
  const col = ready === undefined ? 'var(--color-faint)' : ready ? 'var(--color-ok)' : 'var(--color-bad)'
  const marker = ready === undefined ? 'url(#arrow-dim)' : ready ? 'url(#arrow-ok)' : 'url(#arrow-bad)'
  return (
    <g>
      <path d={pathOf(path)} fill="none" stroke={col} strokeWidth={2.4} strokeOpacity={0.85} markerEnd={marker} className={ready ? 'flow-line' : undefined} />
      <text x={500} y={labelY} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--color-fg)">
        <tspan fill={DOMAINS[from].color}>{DOMAINS[from].label}</tspan> trusts <tspan fill={DOMAINS[to].color}>{DOMAINS[to].label}</tspan>
      </text>
      <text x={500} y={labelY + 17} textAnchor="middle" fontSize={11} fill={col}>
        {peer ? `${peer.key_registered ? 'key registered' : 'key missing'}  ·  ${peer.reachable ? 'reachable' : 'unreachable'}` : 'reading peers'}
      </text>
    </g>
  )
}

export function FederationMap() {
  const a = useAuditEvents('a', 200)
  const b = useAuditEvents('b', 200)
  const [now, setNow] = useState(() => Date.now())
  const [mountedAt] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const cross = useMemo(() => {
    let accepted = 0
    let refused = 0
    let synced = 0
    for (const k of DOMAIN_KEYS) {
      for (const e of (k === 'a' ? a.data : b.data) ?? []) {
        const p = pulseOf(e, k)
        if (p.kind !== 'cross') continue
        if (e.event_type === 'token_verified') accepted += 1
        else if (e.event_type === 'token_rejected') refused += 1
        else if (e.event_type === 'token_revoked') synced += 1
      }
    }
    return { accepted, refused, synced }
  }, [a.data, b.data])

  const pulses = useMemo(() => {
    const out: Pulse[] = []
    for (const k of DOMAIN_KEYS) {
      for (const e of (k === 'a' ? a.data : b.data) ?? []) {
        const t = new Date(e.timestamp).getTime()
        if (t > mountedAt - 3000 && now - t < 7000) {
          const p = pulseOf(e, k)
          if (p.kind === 'cross') out.push(p)
        }
      }
    }
    return out
  }, [a.data, b.data, mountedAt, now])

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      <svg viewBox={`0 70 ${W} ${H - 70}`} className="h-auto w-full" role="img" aria-label="Map of both trust domains, their services and the trust link between them">
        <defs>
          {[
            ['ok', 'var(--color-ok)'],
            ['bad', 'var(--color-bad)'],
            ['dim', 'var(--color-faint)'],
          ].map(([id, col]) => (
            <marker key={id} id={`arrow-${id}`} viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={col} />
            </marker>
          ))}
        </defs>

        <Direction from="a" to="b" path={LINK_AB} labelY={128} />
        <Direction from="b" to="a" path={LINK_BA} labelY={452} />

        {/* hub of the link */}
        <circle cx={500} cy={CY} r={38} fill="var(--color-panel)" stroke="var(--color-overview)" strokeOpacity={0.6} strokeWidth={2} style={{ filter: 'drop-shadow(0 0 14px var(--color-overview))' }} />
        <ArrowLeftRight x={488} y={CY - 12} size={24} color="var(--color-overview)" />
        <text x={500} y={CY + 58} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-fg)">
          Across the link
        </text>
        <text x={500} y={CY + 75} textAnchor="middle" fontSize={11}>
          <tspan fill="var(--color-ok)">{cross.accepted} accepted</tspan>
          <tspan fill="var(--color-faint)"> · </tspan>
          <tspan fill="var(--color-bad)">{cross.refused} refused</tspan>
        </text>
        <text x={500} y={CY + 91} textAnchor="middle" fontSize={11} fill="var(--color-tokens)">
          {cross.synced} revocations synced
        </text>

        <Domain d="a" mountedAt={mountedAt} now={now} />
        <Domain d="b" mountedAt={mountedAt} now={now} />

        {/* packets travelling between the domains */}
        {pulses.map((p) => {
          const path = p.from === 'a' ? LINK_AB : LINK_BA
          const pts = SAMPLES.map((t) => bez(path, t))
          return (
            <motion.circle
              key={p.id}
              r={9}
              fill={p.color}
              style={{ filter: `drop-shadow(0 0 10px ${p.color})` }}
              initial={{ cx: pts[0].x, cy: pts[0].y, opacity: 1 }}
              animate={{ cx: pts.map((q) => q.x), cy: pts.map((q) => q.y), opacity: [1, 1, 1, 0] }}
              transition={{ duration: 1.5, ease: 'easeInOut' }}
            />
          )
        })}
      </svg>
      <p className="mt-1 text-center text-xs text-dim">
        Each dot is a real event. A dot crossing the link is a token verified by the other domain, or a revocation notice arriving.
      </p>
    </div>
  )
}
