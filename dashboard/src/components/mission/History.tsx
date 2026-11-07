import { History as HistoryIcon, Play } from 'lucide-react'
import { useRunHistory } from '../../api/queries'
import { useScenario } from '../../store/scenario'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'
import { SCENARIOS } from '../../utils/derive'

export function History() {
  const { data, isError } = useRunHistory()
  const { playReplay, status } = useScenario()
  const busy = status === 'starting' || status === 'running'
  return (
    <Panel title="Recorded runs" icon={<HistoryIcon size={16} />} aside={<span className="text-xs text-dim">Replay any run at its original timing</span>}>
      {isError ? (
        <p className="py-4 text-center text-sm text-bad">Run history could not be loaded.</p>
      ) : !data || data.length === 0 ? (
        <p className="py-4 text-center text-sm text-dim">Finished runs are saved here so you can replay them.</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {data.slice(0, 12).map((r) => (
            <li key={r.run_id} className="flex items-center gap-3 rounded-lg border border-line bg-raised/40 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {SCENARIOS[r.scenario]?.label ?? r.scenario}
                  <span className="ml-2 font-mono text-[11px] font-normal text-faint">{r.run_id}</span>
                </p>
                <p className="text-[11px] text-dim">
                  {new Date(r.started_at * 1000).toLocaleTimeString([], { hour12: false })} · {r.duration_s.toFixed(1)} s · {r.event_count} events
                </p>
              </div>
              <Badge tone={r.status === 'running' ? 'accent' : r.exit_code === 0 ? 'ok' : 'bad'}>
                {r.status === 'running' ? 'Running' : r.exit_code === 0 ? 'As expected' : 'Unexpected'}
              </Badge>
              <Button variant="ghost" className="px-3 py-1.5" disabled={busy || r.status === 'running'} onClick={() => void playReplay(r.run_id)}>
                <Play size={13} /> Replay
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
