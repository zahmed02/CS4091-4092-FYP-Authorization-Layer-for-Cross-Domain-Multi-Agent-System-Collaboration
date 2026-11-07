import * as Tabs from '@radix-ui/react-tabs'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { DOMAIN_KEYS, DOMAINS, domainById } from '../api/client'
import type { DomainKey } from '../api/client'
import { verifyToken } from '../api/queries'
import { cn } from '../lib/cn'
import { ms, shortId } from '../lib/format'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import type { TokenInfo } from '../utils/derive'
import { StepList } from './StepList'

function Result({ token, domain, nonce }: { token: TokenInfo; domain: DomainKey; nonce: number }) {
  const q = useQuery({
    queryKey: ['verify', token.jti, domain, nonce],
    queryFn: () => verifyToken(domain, token.token),
    gcTime: 0,
    staleTime: 0,
    retry: 0,
  })
  if (q.isPending) return <p className="py-6 text-center text-sm text-dim">Verifying at {DOMAINS[domain].label}…</p>
  if (q.isError) {
    return <p className="py-6 text-center text-sm text-bad">{DOMAINS[domain].label} did not answer the verify request.</p>
  }
  const r = q.data
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={r.valid ? 'ok' : 'bad'}>{r.valid ? 'Valid' : 'Rejected'}</Badge>
        {r.reason_code && <Badge tone="bad">{r.reason_code}</Badge>}
        <span className="text-xs text-dim">
          Checked by {r.verified_by} in <span className="font-mono">{ms(r.duration_ms)}</span>
        </span>
      </div>
      <StepList steps={r.steps} />
    </div>
  )
}

function Body({ token }: { token: TokenInfo }) {
  const [domain, setDomain] = useState<DomainKey>(domainById(token.audience[0])?.key ?? 'b')
  const [nonce, setNonce] = useState(0)
  return (
    <Tabs.Root value={domain} onValueChange={(v) => setDomain(v as DomainKey)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Tabs.List className="flex gap-1 rounded-lg border border-line bg-raised p-1" aria-label="Verifying domain">
          {DOMAIN_KEYS.map((k) => (
            <Tabs.Trigger
              key={k}
              value={k}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-semibold transition',
                domain === k ? 'bg-panel text-fg' : 'text-dim hover:text-fg',
              )}
              style={domain === k ? { color: DOMAINS[k].color } : undefined}
            >
              Verify at {DOMAINS[k].label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Button variant="ghost" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw size={15} /> Verify again
        </Button>
      </div>
      {DOMAIN_KEYS.map((k) => (
        <Tabs.Content key={k} value={k}>
          <Result token={token} domain={k} nonce={nonce} />
        </Tabs.Content>
      ))}
    </Tabs.Root>
  )
}

export function TokenDialog({ token, onClose }: { token: TokenInfo | null; onClose: () => void }) {
  // Keep the last token on screen while the close animation runs.
  const [shown, setShown] = useState<TokenInfo | null>(token)
  if (token && token !== shown) setShown(token)

  return (
    <Modal
      open={token !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Verify this token"
      description={
        shown
          ? `${shown.role} token ${shortId(shown.jti)}, issued by ${DOMAINS[shown.issuer].label}. Each domain runs its own seven checks.`
          : undefined
      }
    >
      {shown && <Body key={shown.jti} token={shown} />}
    </Modal>
  )
}
