import { AnimatePresence, motion } from 'framer-motion'
import {
  Ban,
  CheckCheck,
  Eye,
  FastForward,
  Hourglass,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Users,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useScenarioConfig } from '../../api/queries'
import type { Pace, ScenarioName } from '../../api/types'
import { cn } from '../../lib/cn'
import { useScenario } from '../../store/scenario'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'
import { SCENARIOS } from '../../utils/derive'

const ICONS: Record<ScenarioName, LucideIcon> = {
  normal: CheckCheck,
  team: Users,
  revoke: Ban,
  scope: Eye,
  expired: Hourglass,
}

const ORDER: ScenarioName[] = ['team', 'normal', 'revoke', 'scope', 'expired']

const PACES: { id: Pace; label: string; icon: LucideIcon; hint: string }[] = [
  { id: 'fast', label: 'Fast', icon: Zap, hint: 'No pauses between steps' },
  { id: 'slow', label: 'Slow', icon: FastForward, hint: 'A pause of about two seconds between steps' },
  { id: 'step', label: 'Step', icon: SkipForward, hint: 'Stops before every step until you press Next' },
]

function PaceControl({ disabled }: { disabled?: boolean }) {
  const { pace, setPace } = useScenario()
  return (
    <div role="radiogroup" aria-label="Pace" className="flex gap-1 rounded-lg border border-line bg-raised p-1">
      {PACES.map((p) => (
        <button
          key={p.id}
          role="radio"
          aria-checked={pace === p.id}
          disabled={disabled}
          title={p.hint}
          onClick={() => void setPace(p.id)}
          className={cn(
            'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition',
            pace === p.id ? 'text-bg' : 'text-dim hover:text-fg',
          )}
        >
          {pace === p.id && (
            <motion.span
              layoutId="pace-active"
              className="absolute inset-0 rounded-md bg-accent shadow-[0_0_16px_-4px_var(--accent)]"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <p.icon size={13} className="relative" />
          <span className="relative">{p.label}</span>
        </button>
      ))}
    </div>
  )
}

function ReplayBar() {
  const { replay, status, toggleReplay, setReplaySpeed, reset } = useScenario()
  if (!replay) return null
  const done = status !== 'running'
  const pct = replay.duration > 0 ? (replay.position / replay.duration) * 100 : 100
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3">
      <span className="text-xs font-bold text-accent">Replaying {replay.runId}</span>
      <Button variant="ghost" onClick={toggleReplay} disabled={done} className="px-3 py-1.5">
        {replay.playing ? <Pause size={14} /> : <Play size={14} />}
        {replay.playing ? 'Pause' : 'Play'}
      </Button>
      <div role="radiogroup" aria-label="Replay speed" className="flex gap-1">
        {[1, 2, 4].map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={replay.speed === s}
            onClick={() => setReplaySpeed(s)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-bold transition',
              replay.speed === s ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line text-dim hover:text-fg',
            )}
          >
            {s}x
          </button>
        ))}
      </div>
      <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
        <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${pct}%` }} transition={{ ease: 'linear', duration: 0.1 }} />
      </div>
      <span className="font-mono text-xs text-dim">
        {replay.position.toFixed(1)} / {replay.duration.toFixed(1)} s
      </span>
      <Button variant="ghost" onClick={reset} className="px-3 py-1.5">
        <RotateCcw size={14} /> Exit replay
      </Button>
    </div>
  )
}

export function PresenterBar() {
  const s = useScenario()
  const config = useScenarioConfig()
  const busy = s.status === 'starting' || s.status === 'running'
  const live = s.status === 'running' && !s.replay
  const total = config.data?.fact_count ?? 0
  const paused = s.pace === 'step'

  return (
    <Panel title="Run a scenario" icon={<Play size={16} />} glow={live}>
      <div role="radiogroup" aria-label="Scenario" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {ORDER.map((key) => {
          const Icon = ICONS[key]
          const active = s.scenario === key
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => s.setScenario(key)}
              className={cn(
                'relative rounded-xl border p-3 text-left transition disabled:cursor-not-allowed',
                active ? 'border-accent/70 shadow-[0_0_24px_-10px_var(--accent)]' : 'border-line hover:border-accent/35',
                busy && !active && 'opacity-40',
              )}
            >
              {active && (
                <motion.span
                  layoutId="scenario-active"
                  className="absolute inset-0 rounded-xl bg-accent/10"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                />
              )}
              <span className="relative flex items-center gap-2 text-sm font-bold">
                <Icon size={16} className="text-accent" />
                {SCENARIOS[key].label}
              </span>
              <span className="relative mt-1 block text-xs leading-relaxed text-dim">
                {key === 'expired' && config.data
                  ? `A ${config.data.expiry_ttl_seconds} s token works, then Domain B refuses it after ${config.data.clock_skew_seconds} s of clock-skew allowance.`
                  : SCENARIOS[key].blurb}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-dim">
          Topic the agents work on
          <input
            value={s.topic}
            disabled={busy}
            maxLength={200}
            onChange={(e) => s.setTopic(e.target.value)}
            placeholder={config.data?.default_topic ?? 'Default topic'}
            className="rounded-lg border border-line bg-raised px-3 py-2 text-sm font-medium text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
          />
        </label>
        {s.scenario === 'revoke' && total > 0 && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-dim">
            Revoke before fact
            <select
              value={s.revokeAfter}
              disabled={busy}
              onChange={(e) => s.setRevokeAfter(Number(e.target.value))}
              className="rounded-lg border border-line bg-raised px-2 py-2 text-sm text-fg"
            >
              {Array.from({ length: total }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1} of {total}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-col gap-1 text-xs font-semibold text-dim">
          Pace
          <PaceControl disabled={s.status === 'starting' || !!s.replay} />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {live && (
            <>
              <Button variant="ghost" onClick={() => void s.setPace(paused ? 'slow' : 'step')}>
                {paused ? <Play size={15} /> : <Pause size={15} />}
                {paused ? 'Play' : 'Pause'}
              </Button>
              <Button onClick={() => void s.next()} disabled={!s.waiting} className={cn(s.waiting && 'animate-pulse')}>
                <SkipForward size={15} /> Next step
              </Button>
            </>
          )}
          {s.status !== 'idle' && !busy && (
            <Button variant="ghost" onClick={s.reset}>
              <RotateCcw size={15} /> Clear
            </Button>
          )}
          {!s.replay && (
            <Button onClick={() => void s.start()} disabled={busy}>
              <Play size={15} />
              {s.status === 'starting' ? 'Starting' : s.status === 'running' ? 'Running' : 'Run scenario'}
            </Button>
          )}
        </div>
      </div>
      <AnimatePresence>{s.replay && <ReplayBar />}</AnimatePresence>
    </Panel>
  )
}
