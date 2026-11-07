import { AnimatePresence, motion } from 'framer-motion'
import {
  Ban,
  Check,
  ChevronDown,
  CircleDot,
  Flag,
  KeyRound,
  Pause,
  Sparkles,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ScenarioEvent } from '../../api/types'
import { cn } from '../../lib/cn'
import { roleMeta, stageMeta } from '../../lib/roles'
import { wallClock } from '../../lib/format'
import { Panel } from '../../ui/Panel'
import type { RunView, TokenInfo } from '../../utils/derive'
import { StepList } from '../StepList'

const roleOf = (actor: string) => actor.split('@')[0]

function Row({
  ev,
  startedAt,
  tokenOf,
  onInspect,
}: {
  ev: ScenarioEvent
  startedAt: number | null
  tokenOf: (jti: string) => TokenInfo | undefined
  onInspect: (t: TokenInfo) => void
}) {
  const [open, setOpen] = useState(false)
  const d = ev.data
  const role = roleOf(ev.actor)
  const meta = roleMeta(role)
  let icon = <CircleDot size={14} />
  let color = 'var(--color-dim)'
  let text = ev.message
  if (ev.kind === 'issue') {
    icon = <KeyRound size={14} />
    color = 'var(--color-tokens)'
    text = `${d.domain === 'domain-a' ? 'Domain A' : 'Domain B'} issued a token to the ${roleMeta(d.role).label.toLowerCase()}`
  } else if (ev.kind === 'stage') {
    const st = stageMeta(d.stage)
    icon = <Sparkles size={14} />
    color = st.tone === 'bad' ? 'var(--color-bad)' : st.tone === 'ok' ? 'var(--color-ok)' : st.tone === 'warn' ? 'var(--color-warn)' : 'var(--color-accent)'
    text = `${roleMeta(d.role).label} is now: ${st.label.toLowerCase()}`
  } else if (ev.kind === 'verdict') {
    icon = d.accepted ? <Check size={14} /> : <X size={14} />
    color = d.accepted ? 'var(--color-ok)' : 'var(--color-bad)'
    text = d.accepted
      ? `${d.what}: accepted by ${d.verified_by} in ${Number(d.verification_ms).toFixed(2)} ms`
      : `${d.what}: refused (${d.code}) at the ${(d.failed_steps ?? []).join(', ') || 'first'} check`
  } else if (ev.kind === 'revoke') {
    icon = <Ban size={14} />
    color = 'var(--color-bad)'
    const prop = (d.propagation ?? []) as { peer: string; status: string }[]
    text = `${roleMeta(d.role).label} token revoked at ${d.domain ?? ev.actor.split(' ')[0]}. ${prop.map((x) => `Notice to ${x.peer}: ${x.status}`).join('; ')}`
  } else if (ev.kind === 'wait') {
    icon = <Pause size={14} />
    color = 'var(--color-accent)'
    text = `Paused. Next step: ${d.label}`
  } else if (ev.kind === 'done' || ev.kind === 'abort') {
    icon = <Flag size={14} />
    color = ev.kind === 'done' ? 'var(--color-ok)' : 'var(--color-bad)'
  } else if (ev.kind === 'llm') {
    icon = <Sparkles size={14} />
    color = 'var(--color-writer)'
  }
  const token = ev.kind === 'issue' ? tokenOf(d.jti) : undefined
  const expandable = ev.kind === 'verdict' && Array.isArray(d.steps) && d.steps.length > 0
  const clock = startedAt ? wallClock(startedAt + ev.t * 1000) : `${ev.t.toFixed(1)} s`

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="border-b border-line/70 py-2 last:border-0"
    >
      <div className="grid grid-cols-[4.6rem_1.2rem_1fr_auto] items-start gap-2.5 text-sm">
        <span className="pt-0.5 font-mono text-[11px] text-dim" title={`${ev.t.toFixed(2)} s from the start`}>
          {clock}
        </span>
        <span className="pt-0.5" style={{ color }}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="mr-2 text-[11px] font-bold" style={{ color: meta.color }}>
            {ev.actor.includes('@') ? meta.label : ev.actor}
          </span>
          <span className={cn(ev.kind === 'stage' ? 'text-dim' : 'text-fg')}>{text}</span>
        </span>
        <span className="flex gap-1.5">
          {token && (
            <button
              onClick={() => onInspect(token)}
              className="rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim transition hover:border-accent/60 hover:text-fg"
            >
              Verify token
            </button>
          )}
          {expandable && (
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-dim transition hover:border-accent/60 hover:text-fg"
            >
              Seven checks <ChevronDown size={12} className={cn('transition', open && 'rotate-180')} />
            </button>
          )}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {open && expandable && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pb-1 pl-[5.8rem] pt-2">
              <StepList steps={d.steps} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

export function EventLog({
  events,
  view,
  startedAt,
  onInspect,
}: {
  events: ScenarioEvent[]
  view: RunView
  startedAt: number | null
  onInspect: (t: TokenInfo) => void
}) {
  const rows = [...events].reverse()
  return (
    <Panel title="What happened, newest first" icon={<CircleDot size={16} />} aside={<span className="text-xs text-dim">{events.length} events</span>}>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-dim">Run a scenario and every step is listed here as it happens.</p>
      ) : (
        <ul className="max-h-[34rem] overflow-y-auto pr-1">
          {rows.map((ev) => (
            <Row
              key={ev.seq}
              ev={ev}
              startedAt={startedAt}
              tokenOf={(jti) => view.tokens.find((t) => t.jti === jti)}
              onInspect={onInspect}
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}
