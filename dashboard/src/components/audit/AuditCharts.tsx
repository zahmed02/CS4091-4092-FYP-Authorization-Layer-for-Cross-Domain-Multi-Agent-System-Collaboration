import { BarChart3 } from 'lucide-react'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { clock } from '../../lib/format'
import { Panel } from '../../ui/Panel'
import { reasonOf } from './model'
import type { Row } from './model'

const AXIS = { fontSize: 11, fill: '#94a3cc' }
const GRID = '#1f2c58'
const tip = {
  contentStyle: { background: '#0a1030', border: '1px solid #1f2c58', borderRadius: 10, fontSize: 12, color: '#e9eeff' },
  labelStyle: { color: '#94a3cc' },
  cursor: { fill: 'rgba(148,163,204,0.08)' },
} as const

export function AuditCharts({ rows }: { rows: Row[] }) {
  const reasons = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (r.event_type !== 'token_rejected') continue
      const k = reasonOf(r) ?? 'UNKNOWN'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
  }, [rows])

  const over = useMemo(() => {
    const dec = rows.filter((r) => r.event_type === 'token_verified' || r.event_type === 'token_rejected')
    if (dec.length === 0) return []
    const min = Math.min(...dec.map((r) => r.ts))
    const max = Math.max(...dec.map((r) => r.ts))
    const size = Math.max(5000, Math.ceil((max - min + 1) / 24 / 1000) * 1000)
    const buckets = new Map<number, { t: number; accepted: number; refused: number }>()
    for (const r of dec) {
      const t = min + Math.floor((r.ts - min) / size) * size
      const b = buckets.get(t) ?? { t, accepted: 0, refused: 0 }
      if (r.event_type === 'token_verified') b.accepted += 1
      else b.refused += 1
      buckets.set(t, b)
    }
    return [...buckets.values()]
      .sort((a, b) => a.t - b.t)
      .map((b) => ({ ...b, label: clock(new Date(b.t).toISOString()) }))
  }, [rows])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Decisions over time" icon={<BarChart3 size={16} />}>
        {over.length === 0 ? (
          <p className="py-10 text-center text-sm text-dim">No accept or refuse decisions in this selection.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={over} margin={{ left: -18, right: 6, top: 6 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} minTickGap={28} />
                <YAxis tick={AXIS} allowDecimals={false} />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="accepted" name="Accepted" stackId="d" fill="#34d399" />
                <Bar dataKey="refused" name="Refused" stackId="d" fill="#fb7185" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
      <Panel title="Why tokens were refused" icon={<BarChart3 size={16} />}>
        {reasons.length === 0 ? (
          <p className="py-10 text-center text-sm text-dim">Nothing was refused in this selection.</p>
        ) : (
          <div style={{ height: Math.max(140, reasons.length * 44 + 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reasons} layout="vertical" margin={{ left: 24, right: 14, top: 4 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS} allowDecimals={false} />
                <YAxis type="category" dataKey="reason" tick={AXIS} width={150} />
                <Tooltip {...tip} />
                <Bar dataKey="count" name="Refusals" fill="#fb7185" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  )
}
