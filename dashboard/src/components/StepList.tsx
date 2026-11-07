import { motion } from 'framer-motion'
import { Check, Minus, X } from 'lucide-react'
import type { VerificationStep } from '../api/types'
import { cn } from '../lib/cn'
import { ms } from '../lib/format'
import { STEP_LABELS, STEP_ORDER } from '../utils/derive'

export function StepList({ steps }: { steps: VerificationStep[] }) {
  const max = Math.max(0.001, ...steps.map((s) => s.duration_ms))
  return (
    <ol className="space-y-1.5">
      {STEP_ORDER.map((name, i) => {
        const step = steps.find((s) => s.name === name)
        const state = !step ? 'skipped' : step.passed ? 'pass' : 'fail'
        return (
          <motion.li
            key={name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              'grid grid-cols-[1.25rem_8rem_1fr_4.5rem] items-center gap-3 rounded-lg border px-3 py-2 text-sm',
              state === 'pass' && 'border-ok/25 bg-ok/5',
              state === 'fail' && 'border-bad/40 bg-bad/10',
              state === 'skipped' && 'border-line bg-raised/40 text-faint',
            )}
          >
            {state === 'pass' && <Check size={16} className="text-ok" />}
            {state === 'fail' && <X size={16} className="text-bad" />}
            {state === 'skipped' && <Minus size={16} />}
            <span className="font-semibold">{STEP_LABELS[name]}</span>
            <span className="min-w-0">
              {step && (
                <span className="block h-1.5 overflow-hidden rounded-full bg-line">
                  <motion.span
                    className={cn('block h-full rounded-full', step.passed ? 'bg-ok' : 'bg-bad')}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(6, (step.duration_ms / max) * 100)}%` }}
                    transition={{ delay: i * 0.05 + 0.1, duration: 0.4 }}
                  />
                </span>
              )}
            </span>
            <span className="text-right font-mono text-xs text-dim">
              {step ? ms(step.duration_ms) : 'not reached'}
            </span>
          </motion.li>
        )
      })}
    </ol>
  )
}
