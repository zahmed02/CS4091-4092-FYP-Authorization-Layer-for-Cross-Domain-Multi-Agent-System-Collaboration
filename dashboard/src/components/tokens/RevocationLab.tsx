import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, Copy, FlaskConical } from 'lucide-react'
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
import { StepList } from '../StepList'
import type { IssuedHere } from './IssueForm'

type Outcome = { result: VerificationResult } | { error: string }

interface After {
  revoke: RevokeResponse
  revokeMs: number
  outcomes: Record<DomainKey, Outcome & { at: number }>
}

const NO_ACTION = ''
const OUTSIDE = 'admin:delete'

function VerifyCard({ d, token, action, outcome }: { d: DomainKey; token: string; action: string; outcome?: Outcome }) {
  const q = useQuery({
    queryKey: ['lab-verify', token, d, action],
    queryFn: () => checkToken(d, token, action || null),
    staleTime: Infinity,
    gcTime: 0,
    retry: 0,
    enabled: !outcome,
  })
  const result = outcome ? ('result' in outcome ? outcome.result : null) : q.data
  const failed = outcome ? ('error' in outcome ? outcome.error : null) : q.isError ? describeError(q.error) : null
  return (
    <div className="rounded-xl border border-line bg-raised/50 p-4" style={{ borderColor: `color-mix(in srgb, ${DOMAINS[d].color} 35%, var(--color-line))` }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold" style={{ color: DOMAINS[d].color }}>
          {DOMAINS[d].label}
        </span>
        {result ? (
          <>
            <Badge tone={result.valid ? 'ok' : 'bad'}>{result.valid ? 'Accepts' : 'Refuses'}</Badge>
            {result.reason_code && <Badge tone="bad">{result.reason_code}</Badge>}
            <span className="ml-auto font-mono text-xs text-faint">{ms(result.duration_ms)}</span>
          </>
        ) : failed ? (
          <Badge tone="warn">No answer</Badge>
        ) : (
          <span className="text-xs text-dim">Verifying…</span>
        )}
      </div>
      {result && <StepList steps={result.steps} />}
      {failed && <p className="text-xs text-bad">{failed}</p>}
    </div>
  )
}

export function RevocationLab({ issued }: { issued: IssuedHere | null }) {
  if (!issued) {
    return (
      <Panel title="Revocation lab" icon={<FlaskConical size={16} />}>
        <p className="py-10 text-center text-sm text-dim">
          Issue a token first. Both domains will check it here, and you can revoke it and watch them refuse it.
        </p>
      </Panel>
    )
  }
  return <Lab key={issued.token.jti} issued={issued} />
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
    onSuccess: (a) => {
      setAfter(a)
      void qc.invalidateQueries({ queryKey: ['token-ledger'] })
    },
  })

  const peer: DomainKey = domain === 'a' ? 'b' : 'a'
  const peerOutcome = after?.outcomes[peer]
  const refusedAt = peerOutcome && 'result' in peerOutcome && peerOutcome.result.reason_code === 'TOKEN_REVOKED' ? peerOutcome.at : null

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
    <Panel title="Revocation lab" icon={<FlaskConical size={16} />} glow={!after}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="accent">{issued.role}</Badge>
          <span className="text-dim">
            from <b style={{ color: DOMAINS[domain].color }}>{DOMAINS[domain].label}</b> for{' '}
            {token.audience.join(', ')}
          </span>
          <span className="font-mono text-xs text-faint">{shortId(token.jti)}</span>
          <span className="text-xs text-dim">{countdown(token.expires_at, now)}</span>
          <Button variant="ghost" className="ml-auto !px-3 !py-1.5" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy token'}
          </Button>
        </div>
        <details className="text-xs text-dim">
          <summary className="cursor-pointer">Claims</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-raised p-3 font-mono text-xs text-fg">
            {JSON.stringify({ header: token.header, claims: token.claims }, null, 2)}
          </pre>
        </details>
        <label className="flex flex-wrap items-center gap-2 text-xs text-dim">
          Ask both domains to allow
          <select
            className="rounded-lg border border-line bg-raised px-2 py-1.5 text-sm text-fg"
            value={action}
            disabled={run.isPending || after !== null}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value={NO_ACTION}>no particular action</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a} (granted)
              </option>
            ))}
            <option value={OUTSIDE}>{OUTSIDE} (not granted)</option>
          </select>
        </label>

        <div className="grid gap-4 xl:grid-cols-2">
          {DOMAIN_KEYS.map((k) => (
            <VerifyCard key={k} d={k} token={token.token} action={action} outcome={after?.outcomes[k]} />
          ))}
        </div>

        {after ? (
          <div className="space-y-3 rounded-xl border border-bad/30 bg-bad/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-bad">
              <Ban size={16} /> Revoked at {DOMAINS[domain].label}
              {after.revoke.already_revoked && <span className="text-xs font-normal text-dim">(it was already revoked)</span>}
            </p>
            {refusedAt !== null ? (
              <p className="text-fg">
                {DOMAINS[peer].label} refused the token <span className="font-mono">{ms(refusedAt)}</span> after you pressed
                Revoke. The revoke call itself took <span className="font-mono">{ms(after.revokeMs)}</span>.
              </p>
            ) : (
              <p className="text-warn">
                {DOMAINS[peer].label} did not report TOKEN_REVOKED. It may be unreachable, or the token was never accepted there.
              </p>
            )}
            <ul className="space-y-1">
              {after.revoke.propagation.map((p) => (
                <li key={p.peer} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={p.status === 'delivered' ? 'ok' : p.status === 'rejected' ? 'warn' : 'bad'}>{p.status}</Badge>
                  <span className="text-fg">{p.peer}</span>
                  <span className="font-mono text-faint">{ms(p.duration_ms)}</span>
                  <span className="text-dim">{p.detail}</span>
                </li>
              ))}
              {after.revoke.propagation.length === 0 && <li className="text-xs text-dim">No peers are registered to notify.</li>}
            </ul>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg outline-none focus:border-bad"
              placeholder="Reason (optional)"
              aria-label="Revocation reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
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
