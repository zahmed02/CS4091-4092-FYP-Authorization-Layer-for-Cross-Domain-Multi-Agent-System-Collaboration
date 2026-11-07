import { motion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'
import { DOMAINS } from '../api/client'
import type { DomainKey } from '../api/client'
import { usePeers } from '../api/queries'
import { cn } from '../lib/cn'

function Direction({ from, to }: { from: DomainKey; to: DomainKey }) {
  const { data } = usePeers(from)
  const peer = data?.find((p) => p.peer === DOMAINS[to].id) ?? data?.[0]
  const ready = peer ? peer.key_registered && peer.reachable : false
  return (
    <div className="rounded-lg border border-line bg-raised/60 p-3 text-xs">
      <p className="font-bold">
        <span style={{ color: DOMAINS[from].color }}>{DOMAINS[from].label}</span> trusts{' '}
        <span style={{ color: DOMAINS[to].color }}>{DOMAINS[to].label}</span>
      </p>
      <ul className="mt-1.5 space-y-0.5 text-dim">
        <li className={cn(peer?.key_registered ? 'text-ok' : 'text-bad')}>
          {peer ? (peer.key_registered ? 'Public key registered' : 'Public key missing') : 'Reading peers'}
        </li>
        <li className={cn(peer?.reachable ? 'text-ok' : 'text-bad')}>
          {peer ? (peer.reachable ? 'Reachable for revocation notices' : 'Not reachable') : ''}
        </li>
      </ul>
      <motion.div
        className="mt-2 h-0.5 rounded-full"
        animate={{ opacity: ready ? 1 : 0.3 }}
        style={{ background: ready ? 'var(--color-ok)' : 'var(--color-bad)' }}
      />
    </div>
  )
}

export function PeerLink() {
  return (
    <div className="flex flex-col items-stretch justify-center gap-3 lg:w-56">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-overview/40 bg-overview/10 text-overview">
        <ArrowLeftRight size={18} />
      </div>
      <Direction from="a" to="b" />
      <Direction from="b" to="a" />
    </div>
  )
}
