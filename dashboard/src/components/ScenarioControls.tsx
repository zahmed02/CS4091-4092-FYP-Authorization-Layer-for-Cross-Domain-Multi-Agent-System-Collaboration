import { motion } from 'framer-motion'
import { Eye, Hourglass, Play, RotateCcw, Ban, CheckCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useScenarioConfig } from '../api/queries'
import type { ScenarioName } from '../api/types'
import { cn } from '../lib/cn'
import { useScenario } from '../store/scenario'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { SCENARIOS } from '../utils/derive'

const ICONS: Record<ScenarioName, LucideIcon> = {
  normal: CheckCheck,
  revoke: Ban,
  scope: Eye,
  expired: Hourglass,
}

export function ScenarioControls() {
  const { scenario, revokeAfter, status, setScenario, setRevokeAfter, start, reset } = useScenario()
  const config = useScenarioConfig()
  const busy = status === 'starting' || status === 'running'
  const total = config.data?.fact_count ?? 0

  return (
    <Panel
      title="Choose what the agents do"
      icon={<Play size={16} />}
      aside={
        config.data && (
          <Badge tone={config.data.writer_mode === 'groq' ? 'accent' : 'neutral'}>
            {config.data.writer_mode === 'groq' ? 'Writer uses the Groq LLM' : 'Writer uses a template (no Groq key)'}
          </Badge>
        )
      }
    >
      <div role="radiogroup" aria-label="Scenario" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(SCENARIOS) as ScenarioName[]).map((key) => {
          const Icon = ICONS[key]
          const active = scenario === key
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => setScenario(key)}
              className={cn(
                'relative rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed',
                active ? 'border-accent/60' : 'border-line hover:border-accent/30',
                busy && !active && 'opacity-45',
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
                {SCENARIOS[key].blurb}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {scenario === 'revoke' && total > 0 && (
          <label className="flex items-center gap-2 text-sm text-dim">
            Revoke before fact
            <select
              value={revokeAfter}
              disabled={busy}
              onChange={(e) => setRevokeAfter(Number(e.target.value))}
              className="rounded-lg border border-line bg-raised px-2 py-1.5 text-fg"
            >
              {Array.from({ length: total }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1} of {total}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="ml-auto flex gap-2">
          {status !== 'idle' && !busy && (
            <Button variant="ghost" onClick={reset}>
              <RotateCcw size={15} /> Clear
            </Button>
          )}
          <Button onClick={() => void start()} disabled={busy}>
            <Play size={15} />
            {status === 'starting' ? 'Starting' : status === 'running' ? 'Running' : 'Run scenario'}
          </Button>
        </div>
      </div>
    </Panel>
  )
}
