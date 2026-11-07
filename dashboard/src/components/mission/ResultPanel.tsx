import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, FileText, OctagonX } from 'lucide-react'
import type { RunView } from '../../utils/derive'
import { Badge } from '../../ui/Badge'
import { Panel } from '../../ui/Panel'

export function ResultPanel({ view }: { view: RunView }) {
  const done = view.outcome?.kind === 'done'
  const review = view.review
  const approved = review?.toUpperCase().startsWith('APPROVE')
  return (
    <Panel
      title="Outcome"
      icon={<FileText size={16} />}
      color={view.outcome ? (done ? 'var(--color-ok)' : 'var(--color-bad)') : undefined}
      glow={!!view.outcome}
    >
      <AnimatePresence mode="wait">
        {!view.outcome ? (
          <motion.p key="wait" exit={{ opacity: 0 }} className="py-6 text-center text-sm text-dim">
            The result appears when the task ends.
          </motion.p>
        ) : (
          <motion.div key="res" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-start gap-3">
              {done ? (
                <CheckCircle2 className="mt-0.5 shrink-0 text-ok" size={20} />
              ) : (
                <OctagonX className="mt-0.5 shrink-0 text-bad" size={20} />
              )}
              <div>
                <p className="text-sm font-bold">{done ? 'Task completed' : 'Task stopped'}</p>
                <p className="text-sm text-dim">{view.outcome.message}</p>
              </div>
            </div>
            {view.summary && (
              <div className="rounded-xl border border-line bg-raised/50 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-dim">Summary written by the writer</p>
                  <Badge tone="accent">{view.summary.mode}</Badge>
                </div>
                <p className="text-sm leading-relaxed">{view.summary.text}</p>
              </div>
            )}
            {review && (
              <div className="rounded-xl border border-line bg-raised/50 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-dim">Reviewer verdict</p>
                  <Badge tone={approved ? 'ok' : 'warn'}>{approved ? 'Approved' : 'Not approved'}</Badge>
                </div>
                <p className="text-sm leading-relaxed">{review.replace(/^[A-Z ]+:\s*/, '')}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  )
}
