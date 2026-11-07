import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

type Tone = 'ok' | 'bad' | 'warn' | 'neutral' | 'accent'

const TONES: Record<Tone, string> = {
  ok: 'bg-ok/12 text-ok border-ok/30',
  bad: 'bg-bad/12 text-bad border-bad/30',
  warn: 'bg-warn/12 text-warn border-warn/30',
  neutral: 'bg-raised text-dim border-line',
  accent: 'bg-accent/12 text-accent border-accent/30',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
