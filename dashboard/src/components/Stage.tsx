import { AnimatePresence, motion } from 'framer-motion'
import { Check, Clock, Eye, KeyRound, PenLine, Search, ShieldAlert, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DOMAINS } from '../api/client'
import type { DomainKey } from '../api/client'
import { cn } from '../lib/cn'
import { countdown, shortId } from '../lib/format'
import { Panel } from '../ui/Panel'
import { STEP_LABELS, STEP_ORDER } from '../utils/derive'
import type { RunView, TokenInfo, Verdict } from '../utils/derive'

const ROLE_ICON: Record<string, LucideIcon> = { researcher: Search, writer: PenLine, auditor: Eye }

function agentState(tk: TokenInfo, view: RunView, now: number) {
  if (tk.revoked) return { text: 'Token revoked', tone: 'bad' as const }
  if (tk.expiresAt) {
    const exp = new Date(tk.expiresAt).getTime()
    if (now > exp + tk.graceSeconds * 1000) return { text: 'Token expired', tone: 'bad' as const }
    if (now > exp) return { text: 'Past expiry, in clock-skew grace', tone: 'warn' as const }
  }
  const last = [...view.verdicts].reverse().find((v) => v.actor.startsWith(`${tk.role}@`))
  if (!last) return { text: 'Holds a token', tone: 'neutral' as const }
  if (last.accepted) return { text: 'Last request accepted', tone: 'ok' as const }
  return {
    text: `Refused: ${last.code ?? 'rejected'}`,
    tone: 'bad' as const,
  }
}

function AgentCard({
  tk,
  view,
  now,
  onInspect,
}: {
  tk: TokenInfo
  view: RunView
  now: number
  onInspect: (t: TokenInfo) => void
}) {
  const Icon = ROLE_ICON[tk.role] ?? Search
  const st = agentState(tk, view, now)
  const bad = st.tone === 'bad'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1, x: tk.revoked ? [0, -6, 6, -4, 4, 0] : 0 }}
      transition={{ duration: tk.revoked ? 0.5 : 0.3 }}
      className={cn(
        'rounded-xl border p-3.5',
        bad ? 'border-bad/50 bg-bad/8' : 'border-line bg-raised/70',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${DOMAINS[tk.issuer].color} 16%, transparent)`, color: DOMAINS[tk.issuer].color }}
        >
          <Icon size={19} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="font-bold capitalize">{tk.role}</p>
          <p
            className={cn(
              'text-xs font-semibold',
              st.tone === 'ok' && 'text-ok',
              st.tone === 'bad' && 'text-bad',
              st.tone === 'warn' && 'text-warn',
              st.tone === 'neutral' && 'text-dim',
            )}
          >
            {st.text}
          </p>
        </div>
      </div>
      <button
        onClick={() => onInspect(tk)}
        className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-bg/60 px-2.5 py-1.5 text-xs transition hover:border-accent/50"
        title="Verify this token at either domain"
      >
        <span className="flex items-center gap-1.5 font-mono text-dim">
          <KeyRound size={13} className="text-tokens" />
          {shortId(tk.jti)}
        </span>
        <span className={cn('flex items-center gap-1', bad ? 'text-bad' : 'text-dim')}>
          <Clock size={12} />
          {tk.revoked ? 'revoked' : tk.expiresAt ? countdown(tk.expiresAt, now) : 'no expiry'}
        </span>
      </button>
    </motion.div>
  )
}

function Lane({
  d,
  view,
  now,
  onInspect,
}: {
  d: DomainKey
  view: RunView
  now: number
  onInspect: (t: TokenInfo) => void
}) {
  const meta = DOMAINS[d]
  const tokens = view.tokens.filter((t) => t.issuer === d)
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: `color-mix(in srgb, ${meta.color} 35%, var(--color-line))` }}>
      <p className="text-sm font-extrabold" style={{ color: meta.color }}>
        {meta.label}
        <span className="ml-2 text-xs font-medium text-dim">issues tokens to its agents</span>
      </p>
      {tokens.length === 0 ? (
        <p className="py-6 text-center text-xs text-faint">No agent has been given a token yet.</p>
      ) : (
        tokens.map((tk) => <AgentCard key={tk.jti} tk={tk} view={view} now={now} onInspect={onInspect} />)
      )}
    </div>
  )
}

function Gate({ latest }: { latest: Verdict | null }) {
  const goesRight = latest ? latest.verifier === 'b' : true
  return (
    <div className="flex flex-col justify-center gap-4 rounded-xl border border-line bg-bg/50 p-4">
      <p className="text-center text-sm font-extrabold">Verification gate</p>

      <div className="relative h-10">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <AnimatePresence mode="popLayout">
          {latest && (
            <motion.div
              key={latest.seq}
              className={cn(
                'absolute top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border',
                latest.accepted ? 'border-ok bg-ok/20 text-ok' : 'border-bad bg-bad/20 text-bad',
              )}
              initial={{ left: goesRight ? '0%' : '100%', opacity: 0, scale: 0.6 }}
              animate={
                latest.accepted
                  ? { left: goesRight ? '100%' : '0%', opacity: [0, 1, 1, 0.9], scale: 1 }
                  : { left: '50%', opacity: 1, scale: [1, 1, 1.5, 1.25] }
              }
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            >
              {latest.accepted ? <Check size={15} /> : <X size={15} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ul className="grid grid-cols-2 gap-1.5">
        {STEP_ORDER.map((name) => {
          const step = latest?.steps.find((s) => s.name === name)
          const state = !latest ? 'idle' : latest.accepted ? 'pass' : step ? (step.passed ? 'pass' : 'fail') : 'skipped'
          return (
            <motion.li
              key={`${latest?.seq ?? 'idle'}-${name}`}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: 1 }}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold',
                state === 'pass' && 'border-ok/30 bg-ok/8 text-ok',
                state === 'fail' && 'border-bad/50 bg-bad/15 text-bad',
                (state === 'idle' || state === 'skipped') && 'border-line text-faint',
              )}
            >
              {state === 'pass' && <Check size={12} />}
              {state === 'fail' && <ShieldAlert size={12} />}
              {STEP_LABELS[name]}
            </motion.li>
          )
        })}
      </ul>

      <p className="min-h-10 text-center text-xs text-dim">
        {latest
          ? latest.accepted
            ? `${DOMAINS[latest.verifier].label} accepted: ${latest.what}`
            : `${DOMAINS[latest.verifier].label} refused: ${latest.what}`
          : 'Waiting for the first request.'}
      </p>
    </div>
  )
}

function FactTrack({ view }: { view: RunView }) {
  if (view.factTotal === 0) return null
  const next = view.facts.findIndex((f) => f === null)
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-dim">Facts sent to Domain B</span>
      {view.facts.map((f, i) => (
        <motion.span
          key={i}
          layout
          className={cn(
            'flex h-7 min-w-14 items-center justify-center rounded-md border px-2 text-xs font-bold',
            f?.accepted && 'border-ok/40 bg-ok/12 text-ok',
            f && !f.accepted && 'border-bad/50 bg-bad/15 text-bad',
            !f && 'border-line text-faint',
          )}
          animate={!f && i === next && view.verdicts.length > 0 && !view.outcome ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          Fact {i + 1}
        </motion.span>
      ))}
    </div>
  )
}

export function Stage({
  view,
  now,
  onInspect,
}: {
  view: RunView
  now: number
  onInspect: (t: TokenInfo) => void
}) {
  return (
    <Panel title="Two domains, one task" icon={<ShieldAlert size={16} />}>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr_1fr]">
        <Lane d="a" view={view} now={now} onInspect={onInspect} />
        <Gate latest={view.latest} />
        <Lane d="b" view={view} now={now} onInspect={onInspect} />
      </div>
      <FactTrack view={view} />
    </Panel>
  )
}
