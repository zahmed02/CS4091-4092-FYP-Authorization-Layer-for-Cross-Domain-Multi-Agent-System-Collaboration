import { motion } from 'framer-motion'
import { Activity, Bot, ChevronsRight, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DOMAINS } from '../../api/client'
import { cn } from '../../lib/cn'
import { clock, shortId } from '../../lib/format'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'
import { EVENT_META, FALLBACK_META } from '../eventMeta'
import type { Row } from './model'
import { buildRuns, buildTraces, END_META } from './traces'
import type { Run, Trace } from './traces'

export type View = 'run' | 'token'

const XMIN = 10
const XMAX = 86
const GAP = 8.5
const DRAW_SECONDS = 2

const MOMENT: Record<string, string> = {
  token_issued: 'Issued at',
  token_verified: 'Accepted at',
  token_rejected: 'Refused at',
  token_revoked: 'Revoked at',
  task_join_requested: 'Join asked at',
  task_assigned: 'Joined at',
  task_completed: 'Completed at',
  trust_domain_configured: 'Trust set at',
}
const SHORT: Record<string, string> = {
  token_issued: 'Issued',
  token_verified: 'Accepted',
  token_rejected: 'Refused',
  token_revoked: 'Revoked',
  task_join_requested: 'Join asked',
  task_assigned: 'Joined',
  task_completed: 'Completed',
  trust_domain_configured: 'Trust set',
}

const isPeerRevoke = (e: Row) => e.event_type === 'token_revoked' && (e.detail ?? {}).source === 'peer_sync'
const momentLabel = (e: Row) => (isPeerRevoke(e) ? 'Revocation applied at' : (MOMENT[e.event_type] ?? 'Event at'))
const shortLabel = (e: Row) => (isPeerRevoke(e) ? 'Applied' : (SHORT[e.event_type] ?? 'Event'))

function offset(ms: number): string {
  return ms < 1000 ? `+${Math.round(ms)} ms` : `+${(ms / 1000).toFixed(1)} s`
}

function axisOf(span: number) {
  const step = span <= 2000 ? 500 : span <= 10000 ? 2000 : span <= 60000 ? 10000 : 60000
  const max = Math.max(step, Math.ceil(span / step) * step)
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) }
}

const tickLabel = (t: number) => (t > 0 && t < 1000 ? `${t} ms` : `${t / 1000} s`)

/** Place events along the time axis, then push them apart so no two markers ever touch. */
function place(times: number[], axisMax: number): number[] {
  const n = times.length
  const gap = Math.min(GAP, (XMAX - XMIN) / Math.max(1, n - 1))
  const x = times.map((t) => XMIN + (t / axisMax) * (XMAX - XMIN))
  for (let i = 1; i < n; i++) x[i] = Math.max(x[i], x[i - 1] + gap)
  if (x[n - 1] > XMAX) {
    x[n - 1] = XMAX
    for (let i = n - 2; i >= 0; i--) x[i] = Math.min(x[i], x[i + 1] - gap)
    if (x[0] < XMIN) {
      x[0] = XMIN
      for (let i = 1; i < n; i++) x[i] = Math.max(x[i], x[i - 1] + gap)
    }
  }
  return x
}

function Segment({ from, to, color, delay, mode }: { from: number; to: number; color: string; delay: number; mode: 'alive' | 'after' | 'tail' }) {
  if (mode === 'after') {
    return <span aria-hidden className="absolute top-[28px] border-t-2 border-dashed opacity-40" style={{ left: `${from}%`, width: `${to - from}%`, borderColor: 'var(--color-bad)' }} />
  }
  return (
    <motion.span
      aria-hidden
      className="absolute top-[26px] h-1 origin-left overflow-hidden rounded-full"
      style={{
        left: `${from}%`,
        width: `${to - from}%`,
        background: mode === 'tail' ? `linear-gradient(90deg, ${color}, transparent)` : color,
        boxShadow: `0 0 12px -1px ${color}`,
      }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ delay, duration: 0.5, ease: 'easeOut' }}
    >
      <span className="flow-x absolute inset-0 opacity-60" />
    </motion.span>
  )
}

function Lane({ trace, t0, axisMax, onSelect }: { trace: Trace; t0: number; axisMax: number; onSelect: (r: Row) => void }) {
  const end = END_META[trace.end]
  const evs = trace.events
  const xs = place(evs.map((e) => e.ts - t0), axisMax)
  const alive = trace.terminal >= 0 ? trace.terminal : evs.length - 1
  const dense = (XMAX - XMIN) / Math.max(1, evs.length - 1) < 7
  const delayAt = (x: number) => 0.2 + (x / 100) * DRAW_SECONDS
  const startX = 3.5

  return (
    <div>
      <div className="grid grid-cols-[10rem_1fr] items-center gap-4">
        <div className="flex items-start gap-2">
          <Bot size={16} className="mt-0.5 shrink-0" style={{ color: trace.issuer ? DOMAINS[trace.issuer].color : 'var(--color-dim)' }} />
          <div className="leading-tight">
            <p className="text-sm font-bold capitalize">{trace.label}</p>
            <p className="text-[11px]" style={{ color: trace.issuer ? DOMAINS[trace.issuer].color : undefined }}>
              {trace.issuer ? `Issued by ${DOMAINS[trace.issuer].label}` : 'Issuer not in view'}
            </p>
            <p className="font-mono text-[11px] text-faint">{shortId(trace.jti)}</p>
          </div>
        </div>

        <div className="relative h-[68px] rounded-lg border border-line bg-raised/50">
          <span className="absolute h-3 w-3 -translate-x-1/2 rounded-full border-2 bg-panel" style={{ left: `${startX}%`, top: 22, borderColor: 'var(--color-ok)', boxShadow: '0 0 8px var(--color-ok)' }} />
          <span className="absolute -translate-x-1/2 text-[10px] font-bold text-ok" style={{ left: `${startX}%`, top: 46 }}>
            Start
          </span>

          <Segment from={startX} to={xs[0]} color="var(--color-ok)" delay={0.1} mode="alive" />
          {evs.slice(0, -1).map((e, i) => {
            const mode = i < alive ? 'alive' : 'after'
            const color = i + 1 === trace.terminal ? end.color : 'var(--color-ok)'
            return <Segment key={`s${e.event_id}`} from={xs[i]} to={xs[i + 1]} color={color} delay={delayAt(xs[i])} mode={mode} />
          })}
          {trace.end === 'active' && (
            <>
              <Segment from={xs[xs.length - 1]} to={96} color={end.color} delay={delayAt(xs[xs.length - 1])} mode="tail" />
              <motion.span className="absolute -translate-x-1/2" style={{ left: '95%', top: 21, color: end.color }} animate={{ x: [0, 4, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.4 }}>
                <ChevronsRight size={18} />
              </motion.span>
              <span className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold" style={{ left: '91%', top: 46, color: end.color }}>
                Still valid
              </span>
            </>
          )}

          {evs.map((e, i) => {
            const m = EVENT_META[e.event_type] ?? FALLBACK_META
            const stop = i === trace.terminal
            return (
              <motion.button
                key={`${e.domain}-${e.event_id}`}
                type="button"
                onClick={() => onSelect(e)}
                title={`${momentLabel(e)} ${DOMAINS[e.domain].label}, ${clock(e.timestamp)}. Click for the full record.`}
                aria-label={`${momentLabel(e)} ${DOMAINS[e.domain].label} ${clock(e.timestamp)}`}
                className="absolute z-10 flex h-7 w-7 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-2 bg-panel outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={{ left: `${xs[i]}%`, top: 14, color: m.color, borderColor: m.color, boxShadow: `0 0 ${stop ? 18 : 12}px -1px ${m.color}` }}
                initial={{ scale: 0 }}
                animate={{ scale: stop ? 1.15 : 1 }}
                whileHover={{ scale: 1.25 }}
                transition={{ type: 'spring', stiffness: 460, damping: 20, delay: delayAt(xs[i]) }}
              >
                <m.icon size={13} />
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-extrabold text-bg" style={{ background: DOMAINS[e.domain].color }}>
                  {e.domain.toUpperCase()}
                </span>
              </motion.button>
            )
          })}
          {!dense &&
            evs.map((e, i) => (
              <span key={`l${e.event_id}`} className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-bold" style={{ left: `${xs[i]}%`, top: 46, color: (EVENT_META[e.event_type] ?? FALLBACK_META).color }}>
                {shortLabel(e)}
              </span>
            ))}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[10rem_1fr] gap-4 text-[11px]">
        <Badge tone={end.tone} className="self-start">
          {end.label}
        </Badge>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-x-4 gap-y-1">
          {evs.map((e) => {
            const m = EVENT_META[e.event_type] ?? FALLBACK_META
            return (
              <li key={`${e.domain}-${e.event_id}`}>
                <button type="button" onClick={() => onSelect(e)} className="flex w-full items-baseline gap-1.5 whitespace-nowrap text-left hover:text-fg">
                  <span className="h-2 w-2 shrink-0 translate-y-px rounded-full" style={{ background: m.color }} />
                  <span className="text-dim">{momentLabel(e)}</span>
                  <b style={{ color: DOMAINS[e.domain].color }}>{DOMAINS[e.domain].label}</b>
                  <span className="font-mono text-fg">{clock(e.timestamp)}</span>
                  <span className="font-mono text-faint">{offset(e.ts - t0)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function Lanes({ traces, t0, last, onSelect, replay }: { traces: Trace[]; t0: number; last: number; onSelect: (r: Row) => void; replay: number }) {
  const { max, ticks } = axisOf(last - t0)
  const pct = (t: number) => XMIN + (t / max) * (XMAX - XMIN)
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px] space-y-6" key={replay}>
        {traces.map((t) => (
          <Lane key={t.jti} trace={t} t0={t0} axisMax={max} onSelect={onSelect} />
        ))}
        <div className="grid grid-cols-[10rem_1fr] gap-4">
          <span />
          <div className="relative h-4 text-[10px] text-faint">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap font-mono" style={{ left: `${pct(t)}%` }}>
                {tickLabel(t)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function outcomes(traces: Trace[]) {
  const n = (e: string) => traces.filter((t) => t.end === e).length
  return (
    <span className="flex flex-wrap gap-1.5">
      {n('completed') > 0 && <Badge tone="ok">{n('completed')} completed</Badge>}
      {n('active') > 0 && <Badge tone="accent">{n('active')} still valid</Badge>}
      {n('revoked') > 0 && <Badge tone="bad">{n('revoked')} revoked</Badge>}
      {n('refused') > 0 && <Badge tone="bad">{n('refused')} refused</Badge>}
      {n('expired') > 0 && <Badge tone="warn">{n('expired')} expired</Badge>}
    </span>
  )
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition', on ? 'border-accent bg-accent/15 text-fg' : 'border-line text-dim hover:text-fg')}>
      {children}
    </button>
  )
}

export function TraceBoard({ rows, view, onView, followed, onFollow, onSelect }: { rows: Row[]; view: View; onView: (v: View) => void; followed: string | null; onFollow: (jti: string | null) => void; onSelect: (r: Row) => void }) {
  const [now, setNow] = useState(() => Date.now())
  const [runId, setRunId] = useState<string | null>(null)
  const [replay, setReplay] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 2000)
    return () => window.clearInterval(id)
  }, [])

  const traces = useMemo(() => buildTraces(rows, now), [rows, now])
  const runs = useMemo(() => buildRuns(traces), [traces])
  const run: Run | undefined = runs.find((r) => r.id === runId) ?? runs[0]
  const token = traces.find((t) => t.jti === followed) ?? traces[0]

  return (
    <Panel
      title="Trace"
      icon={<Activity size={16} />}
      aside={
        <div className="flex flex-wrap items-center gap-1.5">
          <Seg on={view === 'run'} onClick={() => onView('run')}>
            A task run
          </Seg>
          <Seg on={view === 'token'} onClick={() => onView('token')}>
            One token
          </Seg>
          <Button variant="ghost" className="!px-3 !py-1" onClick={() => setReplay(replay + 1)}>
            <RotateCcw size={13} /> Replay
          </Button>
        </div>
      }
    >
      {view === 'run' ? (
        runs.length === 0 || !run ? (
          <p className="py-10 text-center text-sm text-dim">No task run recorded yet. Run a scenario from the Collaboration page and its journey appears here.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-dim">Pick a run. Each lane is one agent token, from the moment it is issued to where it ends. The line stays lit while the token is accepted and stops where it is revoked or refused.</p>
            <div className="mb-5 flex gap-3 overflow-x-auto pb-1">
              {runs.slice(0, 12).map((r) => (
                <button key={r.id} type="button" onClick={() => setRunId(r.id)} aria-pressed={r.id === run.id} className={cn('shrink-0 rounded-xl border px-4 py-2.5 text-left transition', r.id === run.id ? 'border-accent bg-accent/10' : 'border-line bg-raised/40 hover:border-line-strong')}>
                  <p className="text-sm font-bold">Task {shortId(r.taskId, 10)}</p>
                  <p className="mb-1.5 text-[11px] text-dim">
                    {r.traces.length} token{r.traces.length === 1 ? '' : 's'} · started <span className="font-mono">{clock(new Date(r.start).toISOString())}</span>
                  </p>
                  {outcomes(r.traces)}
                </button>
              ))}
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-line bg-raised/40 px-4 py-3 text-sm">
              <b style={{ color: 'var(--accent)' }}>Task {shortId(run.taskId, 10)}</b>
              <span className="text-dim">{new Set(run.traces.map((t) => t.label)).size} agents</span>
              <span className="text-dim">
                <span className="font-mono text-fg">{clock(new Date(run.start).toISOString())}</span> to <span className="font-mono text-fg">{clock(new Date(run.last).toISOString())}</span>
                <span className="font-mono text-faint"> · {offset(run.last - run.start).slice(1)}</span>
              </span>
              <span className="ml-auto">{outcomes(run.traces)}</span>
            </div>
            <Lanes key={run.id} traces={run.traces} t0={run.start} last={run.last} onSelect={onSelect} replay={replay} />
          </>
        )
      ) : token ? (
        <>
          <label className="mb-5 flex flex-wrap items-center gap-3 text-sm text-dim">
            Token
            <select className="min-w-72 rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg" value={token.jti} onChange={(e) => onFollow(e.target.value)} aria-label="Choose a token">
              {traces.slice(0, 60).map((t) => (
                <option key={t.jti} value={t.jti}>
                  {t.label} · {shortId(t.jti)} · {END_META[t.end].label}
                </option>
              ))}
            </select>
            <span className="text-xs">Seconds count from the moment this token was issued.</span>
          </label>
          <Lanes key={token.jti} traces={[token]} t0={token.start} last={token.last} onSelect={onSelect} replay={replay} />
        </>
      ) : (
        <p className="py-10 text-center text-sm text-dim">No tokens recorded yet. Issue one on the Tokens and Trust page.</p>
      )}
      <p className="mt-5 text-xs text-faint">The small letter on a marker is the domain where it was recorded. Markers are spread so none overlap; the exact times are listed under each lane. Click a marker for the full record.</p>
    </Panel>
  )
}
