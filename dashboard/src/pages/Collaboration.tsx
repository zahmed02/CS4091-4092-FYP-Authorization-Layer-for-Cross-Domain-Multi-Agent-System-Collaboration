import { useMemo, useState } from 'react'
import { useScenarioConfig } from '../api/queries'
import { ResultPanel } from '../components/ResultPanel'
import { ScenarioControls } from '../components/ScenarioControls'
import { Stage } from '../components/Stage'
import { Timeline } from '../components/Timeline'
import { TokenDialog } from '../components/TokenDialog'
import { useNow } from '../lib/useNow'
import { useScenario } from '../store/scenario'
import { deriveRun } from '../utils/derive'
import type { TokenInfo } from '../utils/derive'

export function Collaboration() {
  const { events, status, error } = useScenario()
  const config = useScenarioConfig()
  const view = useMemo(() => deriveRun(events, config.data?.fact_count ?? 0), [events, config.data])
  const now = useNow(view.tokens.length > 0)
  const [inspect, setInspect] = useState<TokenInfo | null>(null)

  return (
    <div className="space-y-6">
      <ScenarioControls />
      {error && (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}
      <Stage view={view} now={now} onInspect={setInspect} />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Timeline events={events} view={view} onInspect={setInspect} />
        <ResultPanel view={view} status={status} />
      </div>
      <TokenDialog token={inspect} onClose={() => setInspect(null)} />
    </div>
  )
}
