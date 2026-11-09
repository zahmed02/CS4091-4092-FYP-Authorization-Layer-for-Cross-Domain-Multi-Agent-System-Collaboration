import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Check, RefreshCw, X } from 'lucide-react'
import { DOMAINS, describeError } from '../../api/client'
import type { DomainKey } from '../../api/client'
import { resyncPeers, useTrustDomains } from '../../api/tokens'
import type { ResyncResponse } from '../../api/tokens'
import { usePeers, useSelfDomain } from '../../api/queries'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'

function useSide(d: DomainKey) {
  const other: DomainKey = d === 'a' ? 'b' : 'a'
  const self = useSelfDomain(d)
  const otherSelf = useSelfDomain(other)
  const known = useTrustDomains(d)
  const peers = usePeers(d)
  const held = known.data?.find(
    (t) => !t.is_self && (t.name === DOMAINS[other].id || t.trust_domain_id === otherSelf.data?.trust_domain_id),
  )
  return {
    d,
    other,
    own: self.data?.fingerprint,
    held: held?.fingerprint,
    heldError: known.isError ? describeError(known.error) : null,
    // Does the key this domain holds for the peer equal what the peer reports for itself?
    match: held && otherSelf.data ? held.fingerprint === otherSelf.data.fingerprint : null,
    peer: peers.data?.find((p) => p.peer === DOMAINS[other].id) ?? peers.data?.[0],
    peerError: peers.isError,
  }
}
type Side = ReturnType<typeof useSide>

const short = (fp: string | undefined) => (fp ? `${fp.slice(0, 7)}${fp.slice(7, 27)}…` : 'reading…')
const PX: Record<DomainKey, number> = { a: 20, b: 640 }
const PW = 340

function Pill({ x, y, ok, label }: { x: number; y: number; ok: boolean | undefined; label: string }) {
  const col = ok === undefined ? 'var(--color-faint)' : ok ? 'var(--color-ok)' : 'var(--color-bad)'
  return (
    <g>
      <rect x={x} y={y} width={150} height={26} rx={13} fill={`color-mix(in srgb, ${col} 12%, transparent)`} stroke={col} strokeOpacity={0.5} />
      <circle cx={x + 16} cy={y + 13} r={4} fill={col} />
      <text x={x + 28} y={y + 17.5} fontSize={12} fontWeight={600} fill={col}>
        {label}
      </text>
    </g>
  )
}

function Node({ s }: { s: Side }) {
  const x = PX[s.d]
  const col = DOMAINS[s.d].color
  return (
    <g>
      <rect x={x} y={18} width={PW} height={210} rx={20} fill="var(--color-panel)" stroke={col} strokeOpacity={0.55} strokeWidth={2} style={{ filter: `drop-shadow(0 0 14px color-mix(in srgb, ${col} 45%, transparent))` }} />
      <text x={x + 22} y={46} fontSize={17} fontWeight={800} fill={col}>
        {DOMAINS[s.d].label}
      </text>
      <text x={x + 22} y={74} fontSize={11} fill="var(--color-dim)">
        Signs its own tokens with
      </text>
      <rect x={x + 18} y={82} width={PW - 36} height={30} rx={8} fill="var(--color-raised)" />
      <text x={x + 28} y={102} fontSize={12} fontFamily="ui-monospace, monospace" fill="var(--color-fg)">
        {short(s.own)}
        <title>{s.own}</title>
      </text>
      <text x={x + 22} y={142} fontSize={11} fill="var(--color-dim)">
        {`Trusts this key for ${DOMAINS[s.other].label}`}
      </text>
      <rect x={x + 18} y={150} width={PW - 36} height={30} rx={8} fill="var(--color-raised)" stroke={DOMAINS[s.other].color} strokeOpacity={0.4} />
      <text x={x + 28} y={170} fontSize={12} fontFamily="ui-monospace, monospace" fill="var(--color-fg)">
        {s.heldError ? 'unavailable' : s.held ? short(s.held) : 'no key registered'}
        <title>{s.held}</title>
      </text>
      <Pill x={x + 18} y={192} ok={s.peerError ? false : s.peer?.key_registered} label={s.peer?.key_registered === false ? 'No key' : 'Key registered'} />
      <Pill x={x + 176} y={192} ok={s.peerError ? false : s.peer?.reachable} label={s.peer?.reachable === false ? 'Unreachable' : 'Reachable'} />
    </g>
  )
}

/** The key one domain holds for the other, drawn from the owner's own key to the holder's copy. */
function KeyArrow({ from, to, match, delay }: { from: Side; to: Side; match: boolean | null; delay: number }) {
  const x1 = from.d === 'a' ? PX.a + PW - 18 : PX.b + 18
  const x2 = to.d === 'a' ? PX.a + PW - 18 : PX.b + 18
  const col = match === null ? 'var(--color-faint)' : match ? 'var(--color-ok)' : 'var(--color-bad)'
  const mid = { x: x1 + (x2 - x1) * 0.3, y: 97 + (165 - 97) * 0.3 }
  return (
    <g>
      <motion.path
        d={`M ${x1} 97 C ${x1 + (x2 - x1) * 0.45} 97, ${x1 + (x2 - x1) * 0.55} 165, ${x2} 165`}
        fill="none"
        stroke={col}
        strokeWidth={2.4}
        markerEnd={`url(#key-${match === null ? 'dim' : match ? 'ok' : 'bad'})`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay }}
      />
      <circle cx={mid.x} cy={mid.y} r={13} fill="var(--color-bg)" stroke={col} strokeWidth={2} />
      {match === false ? <X x={mid.x - 8} y={mid.y - 8} size={16} color={col} /> : <Check x={mid.x - 8} y={mid.y - 8} size={16} color={col} />}
    </g>
  )
}

function Resync({ d }: { d: DomainKey }) {
  const qc = useQueryClient()
  const m = useMutation<ResyncResponse, unknown>({
    mutationFn: () => resyncPeers(d),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['peers', d] }),
  })
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <Button variant="ghost" className="!px-3 !py-1.5" onClick={() => m.mutate()} disabled={m.isPending} title="Send every revocation again to the other domain">
        <RefreshCw size={14} className={m.isPending ? 'animate-spin' : ''} /> Resync {DOMAINS[d].label} to {DOMAINS[d === 'a' ? 'b' : 'a'].label}
      </Button>
      {m.isSuccess && (
        <p className="text-xs text-dim">
          Sent {m.data.notices_sent} notice{m.data.notices_sent === 1 ? '' : 's'}: <span className="text-ok">{m.data.delivered} delivered</span>
          {m.data.failed > 0 && <span className="text-bad">, {m.data.failed} failed</span>}
          {m.data.notices_sent === 0 && ' (nothing revoked yet)'}
        </p>
      )}
      {m.isError && <p className="text-xs text-bad">{describeError(m.error)}</p>}
    </div>
  )
}

export function TrustPanel() {
  const a = useSide('a')
  const b = useSide('b')
  return (
    <Panel title="Who trusts whose key" aside={<span className="text-xs text-dim">Each arrow checks that a held key equals the key its owner reports.</span>}>
      <svg viewBox="0 0 1000 246" className="h-auto w-full" role="img" aria-label="Each domain's own key fingerprint and the fingerprint it holds for the other domain">
        <defs>
          {[
            ['ok', 'var(--color-ok)'],
            ['bad', 'var(--color-bad)'],
            ['dim', 'var(--color-faint)'],
          ].map(([id, c]) => (
            <marker key={id} id={`key-${id}`} viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
            </marker>
          ))}
        </defs>
        <KeyArrow from={a} to={b} match={b.match} delay={0.1} />
        <KeyArrow from={b} to={a} match={a.match} delay={0.3} />
        <Node s={a} />
        <Node s={b} />
      </svg>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Resync d="a" />
        <Resync d="b" />
      </div>
    </Panel>
  )
}
