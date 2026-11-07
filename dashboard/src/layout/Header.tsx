import { motion } from 'framer-motion'
import { DOMAIN_KEYS, DOMAINS } from '../api/client'
import type { DomainKey } from '../api/client'
import { useHealth } from '../api/queries'
import type { NavItem } from './nav'

function DomainPill({ d }: { d: DomainKey }) {
  const { data, isPending } = useHealth(d)
  const up = data?.reachable ?? false
  const meta = DOMAINS[d]
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 text-xs font-semibold"
      title={up ? `${meta.label} is answering` : `${meta.label} is not answering`}
    >
      <span className="relative flex h-2 w-2">
        {up && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full bg-ok"
            animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: isPending ? 'var(--color-faint)' : up ? 'var(--color-ok)' : 'var(--color-bad)' }}
        />
      </span>
      <span style={{ color: meta.color }}>{meta.label}</span>
      <span className="text-dim">{isPending ? 'checking' : up ? 'online' : 'offline'}</span>
    </div>
  )
}

export function Header({ item }: { item: NavItem }) {
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/80 px-6 py-3.5 backdrop-blur">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg border"
          style={{
            color: item.color,
            borderColor: `color-mix(in srgb, ${item.color} 40%, transparent)`,
            background: `color-mix(in srgb, ${item.color} 10%, transparent)`,
          }}
        >
          <item.icon size={18} />
        </span>
        <div className="leading-tight">
          <h1 className="text-base font-extrabold tracking-tight">{item.label}</h1>
          <p className="text-xs text-dim">{item.summary}</p>
        </div>
      </div>
      <div className="flex gap-2">
        {DOMAIN_KEYS.map((k) => (
          <DomainPill key={k} d={k} />
        ))}
      </div>
    </header>
  )
}
