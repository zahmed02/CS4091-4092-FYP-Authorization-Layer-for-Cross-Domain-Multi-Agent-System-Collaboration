import { motion } from 'framer-motion'
import { ClipboardCheck, Radio } from 'lucide-react'
import { DOMAINS } from '../api/client'
import { useContributions } from '../api/queries'
import { ms } from '../lib/format'
import { Badge } from '../ui/Badge'
import { Panel } from '../ui/Panel'
import type { RunView } from '../utils/derive'

export function ResultPanel({ view, status }: { view: RunView; status: string }) {
  const live = status === 'running' || status === 'completed' || status === 'failed'
  const polling = status === 'running'
  const inB = useContributions('b', view.taskId, live, polling, status)
  const inA = useContributions('a', view.taskId, live, polling, status)
  const bRows = inB.data ?? []
  const aRows = inA.data ?? []
  const facts = bRows.filter((c) => c.kind === 'fact')
  const summary = aRows.find((c) => c.kind === 'summary')

  return (
    <Panel title="What each domain stored" icon={<ClipboardCheck size={16} />}>
      {view.taskId === null ? (
        <p className="py-10 text-center text-sm text-dim">
          After a run, this shows what Domain B and Domain A actually hold, read back from their databases.
        </p>
      ) : (
        <div className="space-y-5">
          {view.outcome && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                view.outcome.kind === 'done' ? 'border-ok/40 bg-ok/10 text-ok' : 'border-bad/40 bg-bad/10 text-bad'
              }`}
            >
              {view.outcome.message}
            </motion.div>
          )}

          <div>
            <h3 className="mb-2 flex items-center justify-between text-sm font-bold" style={{ color: DOMAINS.b.color }}>
              Domain B facts
              <Badge tone={facts.length === view.factTotal && view.factTotal > 0 ? 'ok' : 'neutral'}>
                {facts.length} of {view.factTotal}
              </Badge>
            </h3>
            {facts.length === 0 ? (
              <p className="text-xs text-faint">Nothing stored for this task.</p>
            ) : (
              <ul className="space-y-1.5">
                {facts.map((f, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-line bg-raised/50 px-3 py-2 text-xs leading-relaxed"
                  >
                    {f.content}
                  </motion.li>
                ))}
              </ul>
            )}
          </div>

          {view.revoke && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-bad">
                <Radio size={15} /> Revocation notice to the other domain
              </h3>
              {view.revoke.propagation.length === 0 ? (
                <p className="text-xs text-faint">The backend reported no peers to notify.</p>
              ) : (
                <ul className="space-y-1.5">
                  {view.revoke.propagation.map((p) => (
                    <li key={p.peer} className="flex items-center justify-between rounded-lg border border-line bg-raised/50 px-3 py-2 text-xs">
                      <span className="font-semibold">{p.peer}</span>
                      <span className="flex items-center gap-2">
                        <Badge tone={p.status === 'delivered' ? 'ok' : 'bad'}>{p.status}</Badge>
                        <span className="font-mono text-dim">{ms(p.duration_ms)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 flex items-center justify-between text-sm font-bold" style={{ color: DOMAINS.a.color }}>
              Domain A summary
              {view.summary && <Badge tone="accent">{view.summary.mode}</Badge>}
            </h3>
            {summary ? (
              <motion.pre
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="whitespace-pre-wrap rounded-lg border border-line bg-raised/50 p-3 font-sans text-xs leading-relaxed"
              >
                {summary.content}
              </motion.pre>
            ) : (
              <p className="text-xs text-faint">
                {polling ? 'The writer has not answered yet.' : 'No summary was written for this task.'}
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
