import { Crosshair } from 'lucide-react'
import { DOMAINS } from '../../api/client'
import { clock, ms, shortId } from '../../lib/format'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { EVENT_META, FALLBACK_META } from '../eventMeta'
import { describe } from './model'
import type { Row } from './model'

export function EventDialog({
  row,
  all,
  onClose,
  onFollow,
}: {
  row: Row | null
  all: Row[]
  onClose: () => void
  onFollow: (jti: string) => void
}) {
  const trail = row?.jti ? all.filter((r) => r.jti === row.jti).sort((a, b) => a.ts - b.ts) : []
  const t0 = trail[0]?.ts ?? 0
  const meta = row ? (EVENT_META[row.event_type] ?? FALLBACK_META) : FALLBACK_META
  return (
    <Modal
      open={row !== null}
      onOpenChange={(o) => !o && onClose()}
      title={row ? meta.label : ''}
      description={row ? `${DOMAINS[row.domain].label} at ${clock(row.timestamp)}` : undefined}
    >
      {row && (
        <div className="space-y-5">
          <p className="text-sm">{describe(row)}</p>
          {row.jti && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-dim">
                  Life of token <span className="font-mono">{shortId(row.jti)}</span>
                </p>
                <Button variant="ghost" className="!px-3 !py-1" onClick={() => onFollow(row.jti!)}>
                  <Crosshair size={14} /> Follow in trace
                </Button>
              </div>
              <ol className="space-y-1.5">
                {trail.map((t) => {
                  const m = EVENT_META[t.event_type] ?? FALLBACK_META
                  return (
                    <li key={`${t.domain}-${t.event_id}`} className="flex items-center gap-2 rounded-lg bg-raised/60 px-3 py-2 text-xs">
                      <m.icon size={14} style={{ color: m.color }} className="shrink-0" />
                      <span className="font-semibold" style={{ color: DOMAINS[t.domain].color }}>
                        {DOMAINS[t.domain].label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-fg">{describe(t)}</span>
                      <Badge>{t.ts === t0 ? 'start' : `+${ms(t.ts - t0)}`}</Badge>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
          <details>
            <summary className="cursor-pointer text-xs text-dim">Raw record</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-raised p-3 font-mono text-xs text-fg">
              {JSON.stringify(
                { event_id: row.event_id, type: row.event_type, team_id: row.team_id, token_id: row.token_id, timestamp: row.timestamp, detail: row.detail },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      )}
    </Modal>
  )
}
