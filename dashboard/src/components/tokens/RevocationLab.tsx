import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Ban, Check, Copy, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DOMAIN_KEYS, DOMAINS, describeError } from '../../api/client'
import type { DomainKey } from '../../api/client'
import { checkToken, revokeToken } from '../../api/tokens'
import type { RevokeResponse } from '../../api/tokens'
import type { VerificationResult } from '../../api/types'
import { countdown, ms, shortId } from '../../lib/format'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'
import { STEP_LABELS, STEP_ORDER } from '../../utils/derive'
import type { IssuedHere } from './IssueForm'

type Outcome = { result: VerificationResult } | { error: string }

interface After {
  revoke: RevokeResponse
  revokeMs: number
  outcomes: Record<DomainKey, Outcome & { at: number }>
}

const NO_ACTION = ''
const OUTSIDE = 'admin:delete'
const LANE_Y: Record<DomainKey, number> = { a: 96, b: 322 }
const GX = (i: number) => 262 + i * 98
const GATE_R = 23

type GateState = 'pending' | 'pass' | 'fail' | 'skipped'

function gateStates(result: VerificationResult | null, loading: boolean): GateState[] {
  if (!result) return STEP_ORDER.map(() => 'pending')
  void loading
  return STEP_ORDER.map((name) => {
    const s = result.steps.find((x) => x.name === name)
    return !s ? 'skipped' : s.passed ? 'pass' : 'fail'
  })
}

const COLOR: Record<GateState, string> = {
  pending: 'var(--color-faint)',
  pass: 'var(--color-ok)',
  fail: 'var(--color-bad)',
  skipped: 'var(--color-line)',
}

function Lane({ d, result, issuer, version }: { d: DomainKey; result: VerificationResult | null; issuer: DomainKey; version: string }) {
  const y = LANE_Y[d]
  const states = gateStates(result, false)
  const failedAt = states.indexOf('fail')
  const verdict = result ? (result.valid ? 'ok' : 'bad') : 'idle'
  const vcol = verdict === 'ok' ? 'var(--color-ok)' : verdict === 'bad' ? 'var(--color-bad)' : 'var(--color-faint)'
  const startX = 188
  return (
    <g>
      <text x={startX} y={y - 52} fontSize={13} fontWeight={800} fill={DOMAINS[d].color}>
        {DOMAINS[d].label} verifies{d === issuer ? ' its own token' : ''}
      </text>
      {/* the chain: each link takes the colour of the gate it leaves */}
      {[-1, ...STEP_ORDER.map((_, i) => i)].map((i) => {
        const x1 = i === -1 ? startX : GX(i) + GATE_R
        const x2 = i === STEP_ORDER.length - 1 ? 928 - 30 : GX(i + 1) - GATE_R
        if (i === STEP_ORDER.length - 1) {
          const col = states[i] === 'pass' ? COLOR.pass : COLOR[states[i]]
          return <line key={i} x1={GX(i) + GATE_R} y1={y} x2={898} y2={y} stroke={col} strokeOpacity={states[i] === 'pass' ? 0.9 : 0.25} strokeWidth={2.4} strokeDasharray={states[i] === 'pass' ? undefined : '4 6'} />
        }
        const prev = i === -1 ? 'pass' : states[i]
        const cut = failedAt !== -1 && i >= failedAt
        return (
          <motion.line
            key={`${version}-${i}`}
            x1={x1}
            y1={y}
            x2={x2}
            y2={y}
            stroke={cut ? COLOR.skipped : prev === 'pass' ? COLOR.pass : COLOR[prev]}
            strokeWidth={2.4}
            strokeOpacity={cut ? 0.5 : 0.9}
            strokeDasharray={cut ? '4 6' : undefined}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.25, delay: (i + 1) * 0.1 }}
          />
        )
      })}
      {STEP_ORDER.map((name, i) => {
        const st = states[i]
        const col = COLOR[st]
        const step = result?.steps.find((s) => s.name === name)
        return (
          <g key={`${version}-${name}`}>
            <motion.circle
              cx={GX(i)}
              cy={y}
              r={GATE_R}
              fill={st === 'pending' || st === 'skipped' ? 'var(--color-panel)' : `color-mix(in srgb, ${col} 16%, var(--color-panel))`}
              stroke={col}
              strokeWidth={2.4}
              initial={{ scale: 0.6, opacity: 0.4 }}
              animate={{ scale: 1, opacity: st === 'skipped' ? 0.45 : 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20, delay: (i + 1) * 0.1 }}
              style={{ transformOrigin: `${GX(i)}px ${y}px`, filter: st === 'pass' || st === 'fail' ? `drop-shadow(0 0 9px ${col})` : undefined }}
            >
              <title>{step ? `${STEP_LABELS[name]}: ${step.detail}` : STEP_LABELS[name]}</title>
            </motion.circle>
            {st === 'pass' && <Check x={GX(i) - 10} y={y - 10} size={20} color={col} />}
            {st === 'fail' && <X x={GX(i) - 10} y={y - 10} size={20} color={col} />}
            {(st === 'pending' || st === 'skipped') && (
              <text x={GX(i)} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={col}>
                {i + 1}
              </text>
            )}
            <text x={GX(i)} y={y + 44} textAnchor="middle" fontSize={11} fontWeight={600} fill={st === 'skipped' ? 'var(--color-faint)' : 'var(--color-fg)'}>
              {STEP_LABELS[name]}
            </text>
            {step && (
              <text x={GX(i)} y={y + 58} textAnchor="middle" fontSize={10} fill="var(--color-faint)" fontFamily="ui-monospace, monospace">
                {ms(step.duration_ms)}
              </text>
            )}
          </g>
        )
      })}
      {/* verdict */}
      <motion.circle
        key={`${version}-v-${verdict}`}
        cx={940}
        cy={y}
        r={30}
        fill={`color-mix(in srgb, ${vcol} 16%, var(--color-panel))`}
        stroke={vcol}
        strokeWidth={3}
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.85 }}
        style={{ transformOrigin: `940px ${y}px`, filter: verdict === 'idle' ? undefined : `drop-shadow(0 0 14px ${vcol})` }}
      />
      <text x={940} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill={vcol}>
        {verdict === 'ok' ? 'Accepts' : verdict === 'bad' ? 'Refuses' : '…'}
      </text>
      {result?.reason_code && (
        <text x={940} y={y + 52} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--color-bad)">
          {result.reason_code}
        </text>
      )}
    </g>
  )
}

function Diagram({
  issued,
  results,
  after,
  version,
}: {
  issued: IssuedHere | null
  results: Record<DomainKey, VerificationResult | null>
  after: After | null
  version: string
}) {
  const issuer: DomainKey = issued?.domain ?? 'a'
  const peer: DomainKey = issuer === 'a' ? 'b' : 'a'
  const delivered = after?.revoke.propagation[0]
  // Labels hang under each gate, so the notice leaves the issuer lane below them and enters the peer lane from above.
  const sig =
    issuer === 'a'
      ? { from: { x: GX(6), y: LANE_Y.a + 68 }, to: { x: GX(6), y: LANE_Y.b - GATE_R - 3 } }
      : { from: { x: GX(6), y: LANE_Y.b - GATE_R - 3 }, to: { x: GX(6), y: LANE_Y.a + 68 } }
  return (
    <svg viewBox="0 0 1000 410" className="h-auto w-full" role="img" aria-label="A token passing seven checks at each domain">
      <defs>
        <marker id="pipe-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-bad)" />
        </marker>
        <marker id="pipe-arrow-dim" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-faint)" />
        </marker>
      </defs>

      {/* where the token starts */}
      <motion.circle cx={64} cy={209} r={44} fill={`color-mix(in srgb, ${DOMAINS[issuer].color} 14%, var(--color-panel))`} stroke={DOMAINS[issuer].color} strokeWidth={3} style={{ filter: `drop-shadow(0 0 16px ${DOMAINS[issuer].color})` }} animate={{ opacity: issued ? 1 : 0.5 }} />
      <text x={64} y={206} textAnchor="middle" fontSize={13} fontWeight={800} fill={DOMAINS[issuer].color}>
        {issued ? DOMAINS[issuer].label : 'Issuer'}
      </text>
      <text x={64} y={223} textAnchor="middle" fontSize={10} fill="var(--color-dim)">
        {issued ? issued.role : 'no token yet'}
      </text>
      {issued && (
        <text x={64} y={272} textAnchor="middle" fontSize={10} fill="var(--color-faint)" fontFamily="ui-monospace, monospace">
          {shortId(issued.token.jti)}
        </text>
      )}
      {DOMAIN_KEYS.map((d) => (
        <path key={d} d={`M 106 ${d === 'a' ? 196 : 222} C 150 ${d === 'a' ? 150 : 270}, 150 ${LANE_Y[d]}, 186 ${LANE_Y[d]}`} fill="none" stroke={issued ? 'var(--color-tokens)' : 'var(--color-faint)'} strokeWidth={2} strokeDasharray="5 6" strokeOpacity={issued ? 0.85 : 0.35} className={issued ? 'flow-line' : undefined} />
      ))}

      <Lane d="a" result={results.a} issuer={issuer} version={version} />
      <Lane d="b" result={results.b} issuer={issuer} version={version} />

      {/* the revocation notice, from the issuer's last gate to the peer's */}
      <motion.line
        key={after ? 'sent' : 'idle'}
        x1={sig.from.x}
        y1={sig.from.y}
        x2={sig.to.x}
        y2={sig.to.y}
        stroke={after ? 'var(--color-bad)' : 'var(--color-faint)'}
        strokeWidth={after ? 3 : 1.6}
        strokeDasharray={after ? undefined : '3 7'}
        strokeOpacity={after ? 1 : 0.4}
        markerEnd={after ? 'url(#pipe-arrow)' : 'url(#pipe-arrow-dim)'}
        initial={after ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      />
      <text x={GX(6) - 14} y={206} textAnchor="end" fontSize={12} fontWeight={700} fill={after ? 'var(--color-bad)' : 'var(--color-faint)'}>
        Revocation notice
      </text>
      <text x={GX(6) - 14} y={223} textAnchor="end" fontSize={11} fill="var(--color-dim)">
        {delivered ? `${delivered.status} · ${ms(delivered.duration_ms)}` : `${DOMAINS[issuer].label} tells ${DOMAINS[peer].label}`}
      </text>
    </svg>
  )
}

export function RevocationLab({ issued }: { issued: IssuedHere | null }) {
  if (!issued) {
    return (
      <Panel title="Token pipeline" aside={<span className="text-xs text-dim">Issue a token to send it through the seven checks of both domains.</span>}>
        <Diagram issued={null} results={{ a: null, b: null }} after={null} version="empty" />
      </Panel>
    )
  }
  return <Lab key={issued.token.jti} issued={issued} />
}

function useVerdict(d: DomainKey, token: string, action: string, outcome?: Outcome) {
  const q = useQuery({
    queryKey: ['lab-verify', token, d, action],
    queryFn: () => checkToken(d, token, action || null),
    staleTime: Infinity,
    gcTime: 0,
    retry: 0,
    enabled: !outcome,
  })
  const result = outcome ? ('result' in outcome ? outcome.result : null) : (q.data ?? null)
  const error = outcome ? ('error' in outcome ? outcome.error : null) : q.isError ? describeError(q.error) : null
  return { result, error }
}

function Lab({ issued }: { issued: IssuedHere }) {
  const { token, domain } = issued
  const [action, setAction] = useState(NO_ACTION)
  const [reason, setReason] = useState('')
  const [after, setAfter] = useState<After | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const qc = useQueryClient()
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const a = useVerdict('a', token.token, action, after?.outcomes.a)
  const b = useVerdict('b', token.token, action, after?.outcomes.b)
  const actions = (token.claims.permitted_actions as string[] | undefined) ?? []

  const run = useMutation({
    mutationFn: async (): Promise<After> => {
      const t0 = performance.now()
      const revoke = await revokeToken(domain, token.jti, reason)
      const revokeMs = performance.now() - t0
      const pairs = await Promise.all(
        DOMAIN_KEYS.map(async (k): Promise<[DomainKey, Outcome & { at: number }]> => {
          try {
            const result = await checkToken(k, token.token, action || null)
            return [k, { result, at: performance.now() - t0 }]
          } catch (e) {
            return [k, { error: describeError(e), at: performance.now() - t0 }]
          }
        }),
      )
      return { revoke, revokeMs, outcomes: Object.fromEntries(pairs) as After['outcomes'] }
    },
    onSuccess: (r) => {
      setAfter(r)
      void qc.invalidateQueries({ queryKey: ['token-ledger'] })
    },
  })

  const peer: DomainKey = domain === 'a' ? 'b' : 'a'
  const peerOutcome = after?.outcomes[peer]
  const refusedAt = peerOutcome && 'result' in peerOutcome && peerOutcome.result.reason_code === 'TOKEN_REVOKED' ? peerOutcome.at : null
  const errors = [a.error, b.error].filter(Boolean)

  async function copy() {
    try {
      await navigator.clipboard.writeText(token.token)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Panel
      title="Token pipeline"
      glow={!after}
      aside={
        <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
          <Badge tone="accent">{issued.role}</Badge>
          <span>
            from <b style={{ color: DOMAINS[domain].color }}>{DOMAINS[domain].label}</b> for {token.audience.join(', ')}
          </span>
          <span className="font-mono text-faint">{shortId(token.jti)}</span>
          <span>{countdown(token.expires_at, now)}</span>
          <Button variant="ghost" className="!px-2.5 !py-1" onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy token'}
          </Button>
        </div>
      }
    >
      <Diagram issued={issued} results={{ a: a.result, b: b.result }} after={after} version={`${action}-${after ? 'after' : 'before'}`} />
      {errors.length > 0 && <p className="mt-2 text-sm text-bad">{errors[0]}</p>}

      <div className="mt-4 space-y-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-wrap items-center gap-2 text-xs text-dim">
            Ask both domains to allow
            <select className="rounded-lg border border-line bg-raised px-2 py-1.5 text-sm text-fg" value={action} disabled={run.isPending || after !== null} onChange={(e) => setAction(e.target.value)}>
              <option value={NO_ACTION}>no particular action</option>
              {actions.map((x) => (
                <option key={x} value={x}>
                  {x} (granted)
                </option>
              ))}
              <option value={OUTSIDE}>{OUTSIDE} (not granted)</option>
            </select>
          </label>
          <details className="text-xs text-dim">
            <summary className="cursor-pointer">Claims</summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-raised p-3 font-mono text-xs text-fg">{JSON.stringify({ header: token.header, claims: token.claims }, null, 2)}</pre>
          </details>
        </div>

        {after ? (
          <div className="space-y-2 rounded-xl border border-bad/30 bg-bad/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-bad">
              <Ban size={16} /> Revoked at {DOMAINS[domain].label}
              {after.revoke.already_revoked && <span className="text-xs font-normal text-dim">(it was already revoked)</span>}
            </p>
            {refusedAt !== null ? (
              <p>
                {DOMAINS[peer].label} refused the token <span className="font-mono">{ms(refusedAt)}</span> after you pressed Revoke. The revoke call itself took <span className="font-mono">{ms(after.revokeMs)}</span>.
              </p>
            ) : (
              <p className="text-warn">{DOMAINS[peer].label} did not report TOKEN_REVOKED. It may be unreachable, or it never accepted the token.</p>
            )}
            <ul className="space-y-1">
              {after.revoke.propagation.map((p) => (
                <li key={p.peer} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={p.status === 'delivered' ? 'ok' : p.status === 'rejected' ? 'warn' : 'bad'}>{p.status}</Badge>
                  <span>{p.peer}</span>
                  <span className="font-mono text-faint">{ms(p.duration_ms)}</span>
                  <span className="text-dim">{p.detail}</span>
                </li>
              ))}
              {after.revoke.propagation.length === 0 && <li className="text-xs text-dim">No peers are registered to notify.</li>}
            </ul>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg outline-none focus:border-bad" placeholder="Reason (optional)" aria-label="Revocation reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="danger" onClick={() => run.mutate()} disabled={run.isPending}>
              <Ban size={15} /> {run.isPending ? 'Revoking…' : `Revoke at ${DOMAINS[domain].label}`}
            </Button>
          </div>
        )}
        {run.isError && <p className="text-sm text-bad">{describeError(run.error)}</p>}
      </div>
    </Panel>
  )
}
