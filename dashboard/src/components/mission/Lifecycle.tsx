import { motion } from 'framer-motion'
import { Ban, Check, KeyRound, LogIn, Play, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { DOMAINS } from '../../api/client'
import { roleMeta, stageMeta } from '../../lib/roles'
import { wallClock } from '../../lib/format'
import { Badge } from '../../ui/Badge'
import { Panel } from '../../ui/Panel'
import type { AgentView, RunView } from '../../utils/derive'

const WORK = ['researching', 'working', 'reading']
const END = ['done', 'revoked', 'refused', 'expired']

function firstOf(a: AgentView, stages: string[]): number | undefined {
  const times = stages.map((s) => a.at[s]).filter((t): t is number => t !== undefined)
  return times.length ? Math.min(...times) : undefined
}

function Moment({ label, t, start }: { label: string; t: number | undefined; start: number | null }) {
  if (t === undefined) return null
  return (
    <span className="whitespace-nowrap">
      <span className="text-dim">{label}</span>{' '}
      <span className="font-mono text-fg">{start ? wallClock(start + t * 1000) : `${t.toFixed(1)} s`}</span>
      <span className="font-mono text-faint"> +{t.toFixed(1)} s</span>
    </span>
  )
}

export function Lifecycle({
  view,
  live,
  startedAt,
}: {
  view: RunView
  live: boolean
  startedAt: number | null
}) {
  const axisMax = Math.max(8, Math.ceil((view.lastT + 1) / 2) * 2)
  const pct = (t: number) => `${Math.min(100, (t / axisMax) * 100)}%`
  const ticks = Array.from({ length: 5 }, (_, i) => (axisMax / 4) * i)

  return (
    <Panel
      title="Each agent from joining to the end"
      icon={<Timer size={16} />}
      aside={<span className="text-xs text-dim">Real clock times, seconds from the start of the run</span>}
    >
      {view.agents.length === 0 ? (
        <p className="py-8 text-center text-sm text-dim">
          Agents appear here as they are given tokens, join the task and start working.
        </p>
      ) : (
        <div className="space-y-4">
          {view.agents.map((a) => {
            const meta = roleMeta(a.role)
            const st = stageMeta(a.stage)
            const issued = a.at.issued
            const joined = a.at.joined
            const started = firstOf(a, WORK)
            const ended = firstOf(a, END)
            const endStage = END.find((s) => a.at[s] === ended)
            const barFrom = started
            const barTo = ended ?? (live ? view.lastT : undefined)
            const bad = endStage === 'revoked' || endStage === 'refused'
            const color = bad ? 'var(--color-bad)' : endStage === 'expired' ? 'var(--color-warn)' : meta.color
            const tone = { ok: 'ok', bad: 'bad', warn: 'warn', accent: 'accent', neutral: 'neutral' } as const
            const verdicts = view.verdicts.filter((v) => v.role === a.role)
            return (
              <div key={a.role}>
                <div className="grid grid-cols-[9.5rem_1fr] items-center gap-4">
                  <div className="flex items-center gap-2">
                    <meta.icon size={16} style={{ color: meta.color }} />
                    <div className="leading-tight">
                      <p className="text-sm font-bold">{meta.label}</p>
                      <p className="text-[11px]" style={{ color: DOMAINS[a.home].color }}>
                        {DOMAINS[a.home].label}
                      </p>
                    </div>
                  </div>
                  <div className="relative h-9 rounded-lg border border-line bg-raised/50">
                    {ticks.map((t) => (
                      <span
                        key={t}
                        className="absolute top-0 h-full border-l border-line/60"
                        style={{ left: pct(t) }}
                        aria-hidden
                      />
                    ))}
                    {barFrom !== undefined && barTo !== undefined && (
                      <motion.span
                        className="absolute top-2.5 h-4 rounded-full"
                        style={{
                          left: pct(barFrom),
                          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 35%, transparent), ${color})`,
                          boxShadow: `0 0 16px -4px ${color}`,
                        }}
                        animate={{ width: `${Math.max(0.6, ((barTo - barFrom) / axisMax) * 100)}%` }}
                        transition={{ ease: 'linear', duration: 0.3 }}
                      />
                    )}
                    {verdicts.map((v) => (
                      <span
                        key={v.seq}
                        title={`${v.what}: ${v.accepted ? 'accepted' : `refused (${v.code ?? 'rejected'})`}`}
                        className="absolute top-1 h-7 w-0.5 rounded"
                        style={{
                          left: pct(v.t),
                          background: v.accepted ? 'var(--color-ok)' : 'var(--color-bad)',
                          boxShadow: `0 0 8px ${v.accepted ? 'var(--color-ok)' : 'var(--color-bad)'}`,
                        }}
                      />
                    ))}
                    {issued !== undefined && (
                      <Marker at={pct(issued)} title="Token issued" color="var(--color-tokens)">
                        <KeyRound size={11} />
                      </Marker>
                    )}
                    {joined !== undefined && (
                      <Marker at={pct(joined)} title="Joined the task" color="var(--color-ok)">
                        <LogIn size={11} />
                      </Marker>
                    )}
                    {started !== undefined && started !== joined && (
                      <Marker at={pct(started)} title="Started working" color={meta.color}>
                        <Play size={10} />
                      </Marker>
                    )}
                    {ended !== undefined && (
                      <Marker at={pct(ended)} title={stageMeta(endStage ?? '').label} color={color}>
                        {bad ? <Ban size={11} /> : endStage === 'expired' ? <Timer size={11} /> : <Check size={11} />}
                      </Marker>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 grid grid-cols-[9.5rem_1fr] gap-4 text-[11px]">
                  <Badge tone={tone[st.tone]} className="self-start">
                    {st.label}
                  </Badge>
                  <p className="flex flex-wrap gap-x-4 gap-y-0.5">
                    <Moment label="Token issued" t={issued} start={startedAt} />
                    <Moment label="Joined" t={joined} start={startedAt} />
                    <Moment label="Started working" t={started === joined ? undefined : started} start={startedAt} />
                    <Moment label={stageMeta(endStage ?? '').label} t={ended} start={startedAt} />
                  </p>
                </div>
              </div>
            )
          })}
          <div className="grid grid-cols-[9.5rem_1fr] gap-4">
            <span />
            <div className="relative h-4 text-[10px] text-faint">
              {ticks.map((t, i) => (
                <span
                  key={t}
                  className="absolute whitespace-nowrap font-mono"
                  style={{ left: pct(t), transform: i === ticks.length - 1 ? 'translateX(-100%)' : i === 0 ? 'none' : 'translateX(-50%)' }}
                >
                  {t.toFixed(0)} s
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function Marker({
  at,
  title,
  color,
  children,
}: {
  at: string
  title: string
  color: string
  children: ReactNode
}) {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
      title={title}
      className="absolute top-1.5 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border bg-panel"
      style={{ left: at, color, borderColor: color, boxShadow: `0 0 12px -2px ${color}` }}
    >
      {children}
    </motion.span>
  )
}
