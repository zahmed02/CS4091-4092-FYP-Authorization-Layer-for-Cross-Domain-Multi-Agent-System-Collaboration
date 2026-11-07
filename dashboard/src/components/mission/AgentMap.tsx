import { AnimatePresence, motion } from 'framer-motion'
import { Ban, Check, KeyRound, Loader2, ShieldCheck, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { DOMAIN_KEYS, DOMAINS } from '../../api/client'
import type { DomainKey } from '../../api/client'
import { cn } from '../../lib/cn'
import { roleMeta, stageMeta } from '../../lib/roles'
import { shortId } from '../../lib/format'
import { Badge } from '../../ui/Badge'
import type { AgentView, Flow, RunView, TokenInfo } from '../../utils/derive'

// Geometry, in percent of the map. Domain A fills the left, Domain B the right.
const NODE_W = 37
const SLOT_TOP = [13, 55]
const NODE_H = 40
const GATE_Y = 50
const EDGE_A = 2 + NODE_W // right edge of an agent in A
const EDGE_B = 100 - 2 - NODE_W // left edge of an agent in B
const GATE_A = 45 // where Domain A's verifier sits, in the gap between the domains
const GATE_B = 55

function slotOf(view: RunView, agent: AgentView): number {
  return view.agents.filter((a) => a.home === agent.home).indexOf(agent)
}

function nodeCenterY(slot: number): number {
  return SLOT_TOP[Math.min(slot, 1)] + NODE_H / 2
}

function AgentNode({
  agent,
  slot,
  active,
  thinking,
  canRevoke,
  onRevoke,
  onInspect,
}: {
  agent: AgentView
  slot: number
  active: boolean
  thinking: string | null
  canRevoke: boolean
  onRevoke: (role: string) => void
  onInspect: (t: TokenInfo) => void
}) {
  const meta = roleMeta(agent.role)
  const st = stageMeta(agent.stage)
  const dead = agent.stage === 'revoked' || agent.stage === 'refused'
  const expired = agent.stage === 'expired'
  const color = dead ? 'var(--color-bad)' : expired ? 'var(--color-warn)' : meta.color
  const left = agent.home === 'a' ? 2 : 100 - 2 - NODE_W
  const style: CSSProperties = {
    left: `${left}%`,
    top: `${SLOT_TOP[Math.min(slot, 1)]}%`,
    width: `${NODE_W}%`,
    height: `${NODE_H}%`,
    borderColor: `color-mix(in srgb, ${color} ${active ? 85 : 45}%, transparent)`,
    boxShadow: active
      ? `0 0 0 1px color-mix(in srgb, ${color} 50%, transparent), 0 0 38px -6px ${color}`
      : `0 0 0 0 transparent`,
    background: `linear-gradient(160deg, color-mix(in srgb, ${color} 12%, var(--color-panel)), var(--color-panel) 65%)`,
  }
  const tone = {
    ok: 'ok',
    bad: 'bad',
    warn: 'warn',
    accent: 'accent',
    neutral: 'neutral',
  } as const

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="absolute flex flex-col justify-between overflow-hidden rounded-2xl border p-3.5 transition-[box-shadow,border-color] duration-500"
      style={style}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border"
            style={{ color, borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
          >
            {active && !dead && (
              <span
                className="absolute inset-0 rounded-xl border"
                style={{ borderColor: color, animation: 'pulse-ring 1.6s ease-out infinite' }}
              />
            )}
            <meta.icon size={19} />
          </span>
          <div className="leading-tight">
            <p className={cn('text-sm font-extrabold', dead && 'line-through decoration-bad/70')}>{meta.label}</p>
            <p className="text-[11px] text-dim">{meta.job}</p>
          </div>
        </div>
        <Badge tone={tone[st.tone]}>{st.label}</Badge>
      </div>

      <div className="min-h-5 text-xs">
        {thinking ? (
          <span className="flex items-center gap-1.5 font-semibold" style={{ color }}>
            <Loader2 size={13} className="animate-spin" /> Asking the model for {thinking}
          </span>
        ) : (
          <span className="flex items-center gap-3 text-dim">
            <span className="flex items-center gap-1 font-semibold text-ok">
              <Check size={13} /> {agent.accepted} accepted
            </span>
            <span className={cn('flex items-center gap-1 font-semibold', agent.refused ? 'text-bad' : 'text-faint')}>
              <X size={13} /> {agent.refused} refused
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {agent.token ? (
          <button
            onClick={() => onInspect(agent.token!)}
            title="Verify this token at either domain"
            className="flex items-center gap-1.5 rounded-md border border-line bg-raised/70 px-2 py-1 font-mono text-[11px] text-dim transition hover:border-accent/60 hover:text-fg"
          >
            <KeyRound size={12} /> {shortId(agent.token.jti, 8)}
          </button>
        ) : (
          <span />
        )}
        {canRevoke && agent.token && !agent.token.revoked && (
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => onRevoke(agent.role)}
            className="flex items-center gap-1.5 rounded-md border border-bad/50 bg-bad/10 px-2.5 py-1 text-[11px] font-bold text-bad transition hover:bg-bad/25 hover:shadow-[0_0_16px_-4px_var(--color-bad)]"
          >
            <Ban size={12} /> Revoke
          </motion.button>
        )}
        {agent.token?.revoked && <span className="text-[11px] font-bold text-bad">Token revoked</span>}
      </div>
    </motion.div>
  )
}

function Gate({ d, result }: { d: DomainKey; result: boolean | null }) {
  const left = d === 'a' ? GATE_A : GATE_B
  const color = result === null ? 'var(--color-faint)' : result ? 'var(--color-ok)' : 'var(--color-bad)'
  return (
    <div
      className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: `${left}%`, top: `${GATE_Y}%` }}
    >
      <motion.span
        key={result === null ? 'idle' : String(result)}
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-panel"
        style={{ color, borderColor: color, boxShadow: result === null ? 'none' : `0 0 22px -2px ${color}` }}
      >
        {result === false ? <X size={17} /> : result ? <Check size={17} /> : <ShieldCheck size={17} />}
      </motion.span>
      <span className="rounded bg-bg/80 px-1.5 text-[10px] font-bold text-dim">{DOMAINS[d].label} verifies</span>
    </div>
  )
}

function FlowLayer({ view }: { view: RunView }) {
  const recent = view.flows.slice(-8)
  const latest = recent[recent.length - 1]
  const pos = (f: Flow) => {
    const a = view.agents.find((x) => x.role === f.role)
    const y1 = a ? nodeCenterY(slotOf(view, a)) : 30
    const x1 = f.from === 'a' ? EDGE_A : EDGE_B
    const x2 = f.to === 'a' ? GATE_A : GATE_B
    return { x1, y1, x2, y2: GATE_Y }
  }
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {recent.map((f) => {
          const p = pos(f)
          const color = f.accepted ? 'var(--color-ok)' : 'var(--color-bad)'
          const isLatest = f === latest
          return (
            <line
              key={f.seq}
              x1={p.x1}
              y1={p.y1}
              x2={p.x2}
              y2={p.y2}
              stroke={color}
              strokeWidth={isLatest ? 2.4 : 1.2}
              strokeOpacity={isLatest ? 0.95 : 0.22}
              vectorEffect="non-scaling-stroke"
              className={isLatest ? 'flow-line' : undefined}
            />
          )
        })}
      </svg>
      <AnimatePresence>
        {latest && (
          <motion.span
            key={latest.seq}
            className="pointer-events-none absolute z-20 -ml-2 -mt-2 h-4 w-4 rounded-full"
            style={{
              background: latest.accepted ? 'var(--color-ok)' : 'var(--color-bad)',
              boxShadow: `0 0 18px 4px ${latest.accepted ? 'var(--color-ok)' : 'var(--color-bad)'}`,
            }}
            initial={{ left: `${pos(latest).x1}%`, top: `${pos(latest).y1}%`, opacity: 1 }}
            animate={{ left: `${pos(latest).x2}%`, top: `${pos(latest).y2}%`, opacity: [1, 1, 0] }}
            transition={{ duration: 1.1, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>
      {latest && (
        <motion.p
          key={`l-${latest.seq}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 top-[8%] z-10 w-[24%] -translate-x-1/2 text-center text-[11px] font-semibold leading-snug"
          style={{ color: latest.accepted ? 'var(--color-ok)' : 'var(--color-bad)' }}
        >
          {latest.what}
        </motion.p>
      )}
    </>
  )
}

export function AgentMap({
  view,
  live,
  onRevoke,
  onInspect,
}: {
  view: RunView
  live: boolean
  onRevoke: (role: string) => void
  onInspect: (t: TokenInfo) => void
}) {
  const latest = view.flows[view.flows.length - 1]
  const gateResult = (d: DomainKey) => (latest && latest.to === d ? latest.accepted : null)
  const activeRole = view.thinking?.role ?? latest?.role ?? null

  return (
    <div className="overflow-x-auto">
      <div className="relative h-[470px] min-w-[760px]">
        {DOMAIN_KEYS.map((k) => {
          const meta = DOMAINS[k]
          const count = view.agents.filter((a) => a.home === k).length
          return (
            <div
              key={k}
              className="absolute top-0 h-full rounded-3xl border"
              style={{
                left: k === 'a' ? '0%' : '60%',
                width: '40%',
                borderColor: `color-mix(in srgb, ${meta.color} 38%, transparent)`,
                background: `linear-gradient(180deg, color-mix(in srgb, ${meta.color} 7%, transparent), transparent 55%)`,
                boxShadow: `inset 0 0 60px -30px ${meta.color}`,
              }}
            >
              <p className="px-5 pt-3 text-xs font-extrabold" style={{ color: meta.color }}>
                {meta.label} <span className="font-semibold text-dim">{count} agent{count === 1 ? '' : 's'}</span>
              </p>
              {count === 0 && (
                <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-faint">
                  No agents from this domain yet
                </p>
              )}
            </div>
          )
        })}
        <FlowLayer view={view} />
        <Gate d="a" result={gateResult('a')} />
        <Gate d="b" result={gateResult('b')} />
        {view.agents.map((a) => (
          <AgentNode
            key={a.role}
            agent={a}
            slot={slotOf(view, a)}
            active={live && a.role === activeRole}
            thinking={view.thinking?.role === a.role ? view.thinking.purpose : null}
            canRevoke={live && !view.outcome}
            onRevoke={onRevoke}
            onInspect={onInspect}
          />
        ))}
      </div>
    </div>
  )
}
