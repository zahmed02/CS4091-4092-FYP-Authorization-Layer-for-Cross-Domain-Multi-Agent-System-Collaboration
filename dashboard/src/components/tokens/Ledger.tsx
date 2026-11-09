import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DOMAIN_KEYS, DOMAINS, describeError } from '../../api/client'
import type { DomainKey } from '../../api/client'
import { revokeToken, useTokenLedger } from '../../api/tokens'
import type { RevokeResponse, TokenSummary } from '../../api/tokens'
import { clock, countdown, ms, shortId } from '../../lib/format'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'

type Row = TokenSummary & { domain: DomainKey }

export function Ledger() {
  const a = useTokenLedger('a')
  const b = useTokenLedger('b')
  const qc = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [
      ...(a.data ?? []).map((t) => ({ ...t, domain: 'a' as const })),
      ...(b.data ?? []).map((t) => ({ ...t, domain: 'b' as const })),
    ]
    return all.sort((x, y) => y.issued_at.localeCompare(x.issued_at))
  }, [a.data, b.data])

  const revoke = useMutation<RevokeResponse, unknown, Row>({
    mutationFn: (row) => revokeToken(row.domain, row.jti, 'Revoked from the ledger'),
    onSuccess: (res, row) => {
      const p = res.propagation.map((x) => `${x.peer} ${x.status} in ${ms(x.duration_ms)}`).join(', ')
      setNote(`Revoked ${shortId(res.jti)} at ${DOMAINS[row.domain].label}. ${p || 'No peers to notify.'}`)
      void qc.invalidateQueries({ queryKey: ['token-ledger'] })
    },
  })

  const status = (r: Row) =>
    r.revoked ? (
      <Badge tone="bad">Revoked</Badge>
    ) : new Date(r.expires_at).getTime() <= now ? (
      <Badge>Expired</Badge>
    ) : (
      <Badge tone="ok">Active</Badge>
    )

  const failed = DOMAIN_KEYS.filter((k) => (k === 'a' ? a : b).isError)

  return (
    <Panel title="Tokens issued by both domains" icon={<ScrollText size={16} />} aside={<span className="text-xs text-dim">{rows.length} shown</span>}>
      {failed.length > 0 && (
        <p className="mb-3 text-sm text-warn">
          Could not read the ledger of {failed.map((k) => DOMAINS[k].label).join(' and ')}.
        </p>
      )}
      {note && <p className="mb-3 text-sm text-dim">{note}</p>}
      {revoke.isError && <p className="mb-3 text-sm text-bad">{describeError(revoke.error)}</p>}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-dim">No tokens yet. Issue one above or run a scenario.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-dim">
              <tr>
                <th className="pb-2 pr-3 font-semibold">Issuer</th>
                <th className="pb-2 pr-3 font-semibold">Role</th>
                <th className="pb-2 pr-3 font-semibold">Token</th>
                <th className="pb-2 pr-3 font-semibold">Actions</th>
                <th className="pb-2 pr-3 font-semibold">Issued</th>
                <th className="pb-2 pr-3 font-semibold">Status</th>
                <th className="pb-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 40).map((r) => (
                <tr key={`${r.domain}-${r.jti}`} className="border-t border-line/60">
                  <td className="py-2 pr-3 font-semibold" style={{ color: DOMAINS[r.domain].color }}>
                    {DOMAINS[r.domain].label}
                  </td>
                  <td className="py-2 pr-3">{r.role}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-dim">{shortId(r.jti)}</td>
                  <td className="py-2 pr-3 text-xs text-dim">{r.permitted_actions.join(', ')}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-dim">{clock(r.issued_at)}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {status(r)}
                      {!r.revoked && new Date(r.expires_at).getTime() > now && (
                        <span className="text-xs text-faint">{countdown(r.expires_at, now)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    {!r.revoked && new Date(r.expires_at).getTime() > now && (
                      <Button variant="danger" className="!px-3 !py-1" disabled={revoke.isPending} onClick={() => revoke.mutate(r)}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
