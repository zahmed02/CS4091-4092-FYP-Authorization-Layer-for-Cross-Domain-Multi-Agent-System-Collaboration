import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ms, median, percentile } from '../../lib/format'
import { roleMeta } from '../../lib/roles'
import { Panel } from '../../ui/Panel'
import type { RunView } from '../../utils/derive'

const OK = '#34d399'
const BAD = '#fb7185'
const SKY = '#38bdf8'
const VIOLET = '#a78bfa'
const AXIS = { fontSize: 11, fill: '#94a3cc' }
const GRID = '#1f2c58'

const tooltipStyle = {
  contentStyle: {
    background: '#0a1030',
    border: '1px solid #1f2c58',
    borderRadius: 10,
    fontSize: 12,
    color: '#e9eeff',
  },
  labelStyle: { color: '#94a3cc' },
  cursor: { fill: 'rgba(148,163,204,0.08)' },
} as const

function Kpi({ label, value, color, hint }: { label: string; value: string; color: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-raised/60 px-3.5 py-2.5" title={hint}>
      <motion.p
        key={value}
        initial={{ opacity: 0.35, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xl font-extrabold tabular-nums"
        style={{ color }}
      >
        {value}
      </motion.p>
      <p className="text-[11px] text-dim">{label}</p>
    </div>
  )
}

function Chart({
  title,
  note,
  children,
  empty,
  emptyText = 'Waiting for data',
}: {
  title: string
  note: string
  children: ReactNode
  empty: boolean
  emptyText?: string
}) {
  return (
    <div className="rounded-xl border border-line bg-raised/30 p-4">
      <p className="text-sm font-bold">{title}</p>
      <p className="mb-2 text-[11px] text-dim">{note}</p>
      <div className="h-56">
        {empty ? (
          <div className="flex h-full items-center justify-center text-xs text-faint">{emptyText}</div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

export function LiveCharts({ view }: { view: RunView }) {
  const data = useMemo(() => {
    const requests = view.verdicts.map((v, i) => ({
      n: i + 1,
      label: `${v.role}: ${v.what}`,
      roundTrip: v.roundTripMs,
      verify: v.accepted ? v.verificationMs : undefined,
      accepted: v.accepted,
    }))
    const perAgent = view.agents.map((a) => ({ role: roleMeta(a.role).label, accepted: a.accepted, refused: a.refused }))
    const calls = view.llm.map((c, i) => ({
      n: i + 1,
      label: `${roleMeta(c.role).label}: ${c.purpose}`,
      prompt: c.promptTokens,
      completion: c.completionTokens,
      latency: c.latencyMs,
    }))
    const reasons = new Map<string, number>()
    for (const v of view.verdicts) if (!v.accepted) reasons.set(v.code ?? 'REJECTED', (reasons.get(v.code ?? 'REJECTED') ?? 0) + 1)
    return { requests, perAgent, calls, reasons: [...reasons].map(([code, count]) => ({ code, count })) }
  }, [view.verdicts, view.agents, view.llm])

  const verifyTimes = view.verdicts.flatMap((v) => (v.verificationMs !== undefined && v.accepted ? [v.verificationMs] : []))
  const accepted = view.verdicts.filter((v) => v.accepted).length
  const tokens = view.llm.reduce((sum, c) => sum + c.totalTokens, 0)
  const med = median(verifyTimes)
  const p95 = percentile(verifyTimes, 95)

  return (
    <Panel
      title="Live analysis"
      icon={<Activity size={16} />}
      aside={<span className="text-xs text-dim">Updates as each request is verified</span>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Requests verified" value={String(view.verdicts.length)} color="var(--color-fg)" />
        <Kpi label="Accepted" value={String(accepted)} color={OK} />
        <Kpi label="Refused" value={String(view.verdicts.length - accepted)} color={BAD} />
        <Kpi label="Median verification" value={med === null ? 'n/a' : ms(med)} color={SKY} hint="Time the domain spent on its seven checks, accepted requests only" />
        <Kpi label="95th percentile" value={p95 === null ? 'n/a' : ms(p95)} color={SKY} />
        <Kpi label="Model calls" value={String(view.llm.length)} color={VIOLET} />
        <Kpi label="Model tokens" value={tokens.toLocaleString()} color={VIOLET} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Chart
          title="Time per request"
          note="Bars (left axis): full round trip. Line (right axis): the domain's own seven checks. Red bars were refused."
          empty={data.requests.length === 0}
        >
          <ResponsiveContainer>
            <ComposedChart data={data.requests} margin={{ top: 6, right: 0, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="n" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis yAxisId="rt" tick={AXIS} tickLine={false} axisLine={false} unit=" ms" />
              <YAxis yAxisId="v" orientation="right" tick={{ ...AXIS, fill: OK }} tickLine={false} axisLine={false} unit=" ms" />
              <Tooltip {...tooltipStyle} formatter={(v, name) => [`${Number(v).toFixed(2)} ms`, name]} labelFormatter={(_, p) => p[0]?.payload.label ?? ''} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="rt" dataKey="roundTrip" name="Round trip" radius={[4, 4, 0, 0]} maxBarSize={26}>
                {data.requests.map((r) => (
                  <Cell key={r.n} fill={r.accepted ? 'rgba(56,189,248,0.55)' : BAD} />
                ))}
              </Bar>
              <Line yAxisId="v" dataKey="verify" name="Verification" stroke={OK} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Decisions per agent" note="How many of each agent's requests were accepted or refused." empty={data.perAgent.length === 0}>
          <ResponsiveContainer>
            <BarChart data={data.perAgent} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="role" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="accepted" name="Accepted" stackId="d" fill={OK} maxBarSize={44} />
              <Bar dataKey="refused" name="Refused" stackId="d" fill={BAD} radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </Chart>

        <Chart
          title="Language model use"
          note="Tokens per call (bars) and how long each call took (line)."
          empty={data.calls.length === 0}
          emptyText="No model calls in this scenario"
        >
          <ResponsiveContainer>
            <ComposedChart data={data.calls} margin={{ top: 6, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="n" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis yAxisId="t" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" orientation="right" tick={AXIS} tickLine={false} axisLine={false} unit=" ms" />
              <Tooltip {...tooltipStyle} labelFormatter={(_, p) => p[0]?.payload.label ?? ''} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="t" dataKey="prompt" name="Prompt tokens" stackId="k" fill={SKY} maxBarSize={30} />
              <Bar yAxisId="t" dataKey="completion" name="Answer tokens" stackId="k" fill={VIOLET} radius={[4, 4, 0, 0]} maxBarSize={30} />
              <Line yAxisId="l" dataKey="latency" name="Latency" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Why requests were refused" note="Reason code returned by the verifying domain."
          empty={data.reasons.length === 0}
          emptyText="No refusals so far"
        >
          <ResponsiveContainer>
            <BarChart data={data.reasons} layout="vertical" margin={{ top: 6, right: 16, bottom: 0, left: 24 }}>
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis type="category" dataKey="code" tick={AXIS} tickLine={false} axisLine={false} width={150} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name="Refusals" fill={BAD} radius={[0, 4, 4, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </Chart>
      </div>
    </Panel>
  )
}
