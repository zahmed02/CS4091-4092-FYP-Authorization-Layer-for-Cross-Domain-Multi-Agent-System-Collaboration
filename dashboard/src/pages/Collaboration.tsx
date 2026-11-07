import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Radio, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useScenarioConfig } from '../api/queries'
import { AgentMap } from '../components/mission/AgentMap'
import { EventLog } from '../components/mission/EventLog'
import { History } from '../components/mission/History'
import { Lifecycle } from '../components/mission/Lifecycle'
import { LiveCharts } from '../components/mission/LiveCharts'
import { PresenterBar } from '../components/mission/PresenterBar'
import { ResultPanel } from '../components/mission/ResultPanel'
import { TokenDialog } from '../components/TokenDialog'
import { roleMeta } from '../lib/roles'
import { useScenario } from '../store/scenario'
import { Panel } from '../ui/Panel'
import { deriveRun } from '../utils/derive'
import type { TokenInfo } from '../utils/derive'

function Narration({ text, paused }: { text: string; paused: boolean }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-5 py-3.5"
      style={{
        borderColor: `color-mix(in srgb, ${paused ? 'var(--color-warn)' : 'var(--accent)'} 45%, transparent)`,
        background: `color-mix(in srgb, ${paused ? 'var(--color-warn)' : 'var(--accent)'} 7%, var(--color-panel))`,
      }}
      aria-live="polite"
    >
      <span className={paused ? 'text-warn' : 'text-accent'}>{paused ? <Pause size={18} /> : <Radio size={18} />}</span>
      <AnimatePresence mode="wait">
        <motion.p
          key={text}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="text-sm font-semibold"
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

export function Collaboration() {
  const s = useScenario()
  const config = useScenarioConfig()
  const view = useMemo(() => deriveRun(s.events, s.waiting), [s.events, s.waiting])
  const [inspect, setInspect] = useState<TokenInfo | null>(null)
  const live = s.status === 'running' && !s.replay

  const last = s.events[s.events.length - 1]
  const narration = s.waiting
    ? `Paused. Next step: ${s.waiting}. Press Next step to continue.`
    : view.thinking
      ? `${roleMeta(view.thinking.role).label} is asking ${config.data?.llm_model ?? 'the model'} for ${view.thinking.purpose}.`
      : last
        ? last.kind === 'stage' || last.kind === 'verdict' || last.kind === 'done' || last.kind === 'abort' || last.kind === 'revoke'
          ? last.message
          : (s.events.findLast((e) => e.kind === 'verdict' || e.kind === 'stage')?.message ?? last.message)
        : 'Choose a scenario and press Run. Each agent appears when its domain gives it a token.'

  return (
    <div className="space-y-6">
      <PresenterBar />
      {s.error && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          {s.error}
        </p>
      )}
      <Narration text={narration} paused={!!s.waiting} />
      <Panel
        title="Agents across both domains"
        icon={<Sparkles size={16} />}
        glow={live}
        aside={<span className="text-xs text-dim">Select Revoke on an agent to cut its access while it works</span>}
      >
        <AgentMap view={view} live={live} onRevoke={(r) => void s.revoke(r)} onInspect={setInspect} />
      </Panel>
      <Lifecycle view={view} live={live} startedAt={s.startedAt} />
      <LiveCharts view={view} />
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <EventLog events={s.events} view={view} startedAt={s.startedAt} onInspect={setInspect} />
        <div className="space-y-6">
          <ResultPanel view={view} />
          <History />
        </div>
      </div>
      <TokenDialog token={inspect} onClose={() => setInspect(null)} />
    </div>
  )
}
