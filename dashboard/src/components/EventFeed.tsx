import { AnimatePresence, motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import { useMemo } from 'react'
import { DOMAINS } from '../api/client'
import { useAuditEvents } from '../api/queries'
import { clock, shortId } from '../lib/format'
import { Panel } from '../ui/Panel'
import { EVENT_META, FALLBACK_META } from './eventMeta'

// Not every audit event carries a token id; show the next most useful detail.
function detailOf(e: { token_id: string | null; team_id: string | null; detail: Record<string, unknown> | null }): string {
  if (e.token_id) return shortId(e.token_id)
  const d = e.detail ?? {}
  for (const key of ['reason_code', 'task_id', 'role', 'reason']) {
    const v = d[key]
    if (typeof v === 'string' && v) return v.length > 18 ? `${v.slice(0, 18)}…` : v
  }
  return e.team_id ? `team ${shortId(e.team_id, 6)}` : ''
}

export function EventFeed({ limit = 14 }: { limit?: number }) {
  const a = useAuditEvents('a', 50)
  const b = useAuditEvents('b', 50)

  const rows = useMemo(() => {
    const all = [
      ...(a.data ?? []).map((e) => ({ ...e, domain: 'a' as const })),
      ...(b.data ?? []).map((e) => ({ ...e, domain: 'b' as const })),
    ]
    return all.sort((x, y) => y.timestamp.localeCompare(x.timestamp)).slice(0, limit)
  }, [a.data, b.data, limit])

  return (
    <Panel
      title="Live audit trail"
      icon={<Activity size={16} />}
      aside={<span className="text-xs text-dim">Both domains, newest first</span>}
    >
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-dim">
          No events yet. Run a scenario on the Collaboration page and its events appear here.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {rows.map((e) => {
              const meta = EVENT_META[e.event_type] ?? FALLBACK_META
              const dom = DOMAINS[e.domain]
              return (
                <motion.li
                  key={`${e.domain}-${e.event_id}`}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-[4.5rem_6rem_1fr_auto] items-center gap-3 py-2.5 text-sm"
                >
                  <span className="font-mono text-xs text-dim">{clock(e.timestamp)}</span>
                  <span className="text-xs font-bold" style={{ color: dom.color }}>
                    {dom.label}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <meta.icon size={15} style={{ color: meta.color }} className="shrink-0" />
                    <span className="truncate font-semibold">{meta.label}</span>
                  </span>
                  <span className="font-mono text-xs text-dim">{detailOf(e)}</span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  )
}
