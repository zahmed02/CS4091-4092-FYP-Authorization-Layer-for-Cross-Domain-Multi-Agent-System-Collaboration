import { AnimatePresence, motion } from 'framer-motion'
import { Ban, Bot, Check, Flag, KeyRound, ScrollText, ShieldX, Sparkles, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { domainById } from '../api/client'
import type { ScenarioEvent } from '../api/types'
import { ms, shortId } from '../lib/format'
import { Badge } from '../ui/Badge'
import { Panel } from '../ui/Panel'
import { STEP_LABELS, tokenForActor } from '../utils/derive'
import type { RunView, TokenInfo } from '../utils/derive'

function row(ev: ScenarioEvent): { icon: LucideIcon; color: string; title: string } {
  const d = ev.data
  switch (ev.kind) {
    case 'issue':
      return { icon: KeyRound, color: 'var(--color-tokens)', title: `Issued ${d.role} token ${shortId(d.jti)}` }
    case 'verdict':
      return d.accepted
        ? { icon: Check, color: 'var(--color-ok)', title: d.what }
        : { icon: ShieldX, color: 'var(--color-bad)', title: d.what }
    case 'revoke':
      return { icon: Ban, color: 'var(--color-bad)', title: `Revoked token ${shortId(d.jti)} at Domain A` }
    case 'summary':
      return { icon: Sparkles, color: 'var(--color-overview)', title: 'Final summary written' }
    case 'abort':
      return { icon: Flag, color: 'var(--color-bad)', title: ev.message }
    case 'done':
      return { icon: Flag, color: 'var(--color-ok)', title: ev.message }
    default:
      return { icon: Bot, color: 'var(--color-dim)', title: ev.message }
  }
}

export function Timeline({
  events,
  view,
  onInspect,
}: {
  events: ScenarioEvent[]
  view: RunView
  onInspect: (t: TokenInfo) => void
}) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [events.length])

  return (
    <Panel
      title="What happened, step by step"
      icon={<ScrollText size={16} />}
      aside={events.length > 0 && <span className="text-xs text-dim">Select a request to verify its token</span>}
    >
      {events.length === 0 ? (
        <p className="py-10 text-center text-sm text-dim">
          Pick a scenario above and select Run scenario. Every token issue, join, verification and revocation lands here as it happens.
        </p>
      ) : (
        <ol className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {events.map((ev) => {
              const r = row(ev)
              const dom = domainById(ev.actor.split('@')[1] ?? ev.actor)
              const verdict = ev.kind === 'verdict'
              const tk = verdict
                ? tokenForActor(view, ev.actor)
                : view.tokens.find((t) => t.jti === ev.data.jti)
              const clickable = (verdict || ev.kind === 'issue') && tk
              const inner = (
                <>
                  <span className="w-12 shrink-0 text-right font-mono text-xs text-faint">{ev.t.toFixed(2)}s</span>
                  <r.icon size={16} className="shrink-0" style={{ color: r.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.title}</span>
                    <span className="block truncate text-xs" style={{ color: dom?.color ?? 'var(--color-dim)' }}>
                      {ev.actor}
                    </span>
                    {verdict && !ev.data.accepted && (
                      <span className="block text-xs text-bad">
                        Refused at {(ev.data.failed_steps as string[]).map((s) => STEP_LABELS[s] ?? s).join(', ') || 'unknown step'}
                      </span>
                    )}
                  </span>
                  {verdict && (
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={ev.data.accepted ? 'ok' : 'bad'}>
                        {ev.data.accepted ? 'Accepted' : ev.data.code ?? 'Rejected'}
                      </Badge>
                      {ev.data.accepted && (
                        <span className="hidden font-mono text-xs text-dim sm:inline">{ms(ev.data.verification_ms)}</span>
                      )}
                    </span>
                  )}
                  {clickable && <ChevronRight size={15} className="shrink-0 text-faint" />}
                </>
              )
              return (
                <motion.li
                  key={ev.seq}
                  layout
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  {clickable ? (
                    <button
                      onClick={() => tk && onInspect(tk)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-raised"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-2 py-2">{inner}</div>
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
          <div ref={end} />
        </ol>
      )}
    </Panel>
  )
}
