import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Fingerprint, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import { DOMAIN_KEYS, DOMAINS, describeError } from '../../api/client'
import type { DomainKey } from '../../api/client'
import { resyncPeers, useTrustDomains } from '../../api/tokens'
import type { ResyncResponse } from '../../api/tokens'
import { usePeers, useSelfDomain } from '../../api/queries'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'

function Fingerprint2({ value }: { value: string }) {
  return <code className="block break-all rounded-md bg-raised px-2 py-1 font-mono text-xs text-fg">{value}</code>
}

function DomainCard({ d }: { d: DomainKey }) {
  const other: DomainKey = d === 'a' ? 'b' : 'a'
  const self = useSelfDomain(d)
  const otherSelf = useSelfDomain(other)
  const known = useTrustDomains(d)
  const peers = usePeers(d)
  const qc = useQueryClient()
  const resync = useMutation<ResyncResponse, unknown>({
    mutationFn: () => resyncPeers(d),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['peers', d] }),
  })

  const peerKey = known.data?.find(
    (t) => !t.is_self && (t.name === DOMAINS[other].id || t.trust_domain_id === otherSelf.data?.trust_domain_id),
  )
  const match = peerKey && otherSelf.data ? peerKey.fingerprint === otherSelf.data.fingerprint : null
  const peerStatus = peers.data?.[0]

  return (
    <Panel title={DOMAINS[d].label} icon={<KeyRound size={16} />} color={DOMAINS[d].color}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-xs text-dim">Signs its own tokens with this key</p>
          {self.data ? <Fingerprint2 value={self.data.fingerprint} /> : <p className="text-sm text-faint">Loading…</p>}
        </div>
        <div>
          <p className="mb-1 text-xs text-dim">Trusts this key for {DOMAINS[other].label}</p>
          {known.isError ? (
            <p className="text-sm text-bad">{describeError(known.error)}</p>
          ) : peerKey ? (
            <>
              <Fingerprint2 value={peerKey.fingerprint} />
              <div className="mt-2">
                {match === null ? null : match ? (
                  <Badge tone="ok">
                    <ShieldCheck size={12} /> Same key {DOMAINS[other].label} reports for itself
                  </Badge>
                ) : (
                  <Badge tone="bad">Differs from the key {DOMAINS[other].label} reports</Badge>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-warn">No key registered for {DOMAINS[other].label}. Its tokens will be refused.</p>
          )}
        </div>
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs text-dim">Revocation sync to {DOMAINS[other].label}</p>
          <div className="flex flex-wrap items-center gap-2">
            {peers.isError ? (
              <Badge tone="bad">Status unavailable</Badge>
            ) : peerStatus ? (
              <>
                <Badge tone={peerStatus.key_registered ? 'ok' : 'bad'}>
                  {peerStatus.key_registered ? 'Key registered' : 'No key'}
                </Badge>
                <Badge tone={peerStatus.reachable ? 'ok' : 'bad'}>
                  {peerStatus.reachable ? 'Reachable' : 'Unreachable'}
                </Badge>
              </>
            ) : (
              <Badge>Checking…</Badge>
            )}
            <Button
              variant="ghost"
              className="ml-auto !px-3 !py-1.5"
              onClick={() => resync.mutate()}
              disabled={resync.isPending}
              title="Send every revocation again to the other domain"
            >
              <RefreshCw size={14} className={resync.isPending ? 'animate-spin' : ''} /> Resync
            </Button>
          </div>
          {peerStatus && <p className="mt-2 break-all font-mono text-xs text-faint">{peerStatus.endpoint}</p>}
          {resync.isSuccess && (
            <p className="mt-2 text-xs text-dim">
              Sent {resync.data.notices_sent} notice{resync.data.notices_sent === 1 ? '' : 's'}:{' '}
              <span className="text-ok">{resync.data.delivered} delivered</span>
              {resync.data.failed > 0 && <span className="text-bad">, {resync.data.failed} failed</span>}
              {resync.data.notices_sent === 0 && ' (nothing has been revoked yet)'}
            </p>
          )}
          {resync.isError && <p className="mt-2 text-xs text-bad">{describeError(resync.error)}</p>}
        </div>
      </div>
    </Panel>
  )
}

export function TrustPanel() {
  return (
    <section aria-label="Trust domains" className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-dim">
        <Fingerprint size={16} className="text-accent" />
        Each domain verifies the other's tokens against the public key it holds. The fingerprints must agree.
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {DOMAIN_KEYS.map((d) => (
          <DomainCard key={d} d={d} />
        ))}
      </div>
    </section>
  )
}
