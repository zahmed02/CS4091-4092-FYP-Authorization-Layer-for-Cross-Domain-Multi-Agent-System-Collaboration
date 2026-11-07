import { motion } from 'framer-motion'
import { Container, Database, MemoryStick, Server } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DOMAIN_KEYS, DOMAINS } from '../api/client'
import type { DomainKey } from '../api/client'
import { useHealth } from '../api/queries'
import { cn } from '../lib/cn'
import type { NavItem } from './nav'

// Host ports from docker-compose.yml and the uvicorn commands.
const PORTS: Record<DomainKey, { api: number; db: number; redis: number }> = {
  a: { api: 9001, db: 5432, redis: 6379 },
  b: { api: 9002, db: 5433, redis: 6380 },
}

type Light = 'up' | 'down' | 'wait'

function Dot({ state }: { state: Light }) {
  const color =
    state === 'up' ? 'var(--color-ok)' : state === 'down' ? 'var(--color-bad)' : 'var(--color-faint)'
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {state === 'up' && (
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full"
          style={{ background: color }}
          animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  )
}

function Chip({
  icon: Icon,
  label,
  state,
  title,
}: {
  icon: LucideIcon
  label: string
  state: Light
  title: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold',
        state === 'down' ? 'border-bad/40 bg-bad/10 text-bad' : 'border-line bg-raised/70 text-dim',
      )}
    >
      <Dot state={state} />
      <Icon size={12} />
      {label}
    </span>
  )
}

const light = (ok: boolean | undefined, pending: boolean): Light =>
  pending ? 'wait' : ok ? 'up' : 'down'

function DomainStatus({ d }: { d: DomainKey }) {
  const { data, isPending } = useHealth(d)
  const meta = DOMAINS[d]
  const p = PORTS[d]
  const state = (ok: boolean | undefined) => light(ok, isPending)
  return (
    <div
      className="flex items-center gap-1.5 rounded-xl border px-2 py-1.5"
      style={{ borderColor: `color-mix(in srgb, ${meta.color} 35%, var(--color-line))` }}
    >
      <span className="px-1 text-xs font-extrabold" style={{ color: meta.color }}>
        {meta.label}
      </span>
      <Chip icon={Server} label={`API :${p.api}`} state={state(data?.reachable)} title={`${meta.label} backend on port ${p.api}`} />
      <Chip icon={Database} label={`PostgreSQL :${p.db}`} state={state(data?.db)} title={`${meta.label} database connection`} />
      <Chip icon={MemoryStick} label={`Redis :${p.redis}`} state={state(data?.redis)} title={`${meta.label} revocation registry`} />
    </div>
  )
}

function DockerStatus() {
  const a = useHealth('a')
  const b = useHealth('b')
  const pending = a.isPending || b.isPending
  // The four compose services are two PostgreSQL and two Redis containers. A
  // database or Redis answering from the backend means its container is up.
  const running = [a.data?.db, a.data?.redis, b.data?.db, b.data?.redis].filter(Boolean).length
  const state: Light = pending ? 'wait' : running === 4 ? 'up' : 'down'
  return (
    <Chip
      icon={Container}
      label={pending ? 'Docker' : `Docker ${running}/4`}
      state={state}
      title="PostgreSQL and Redis containers for both domains, judged by the backends' health checks"
    />
  )
}

export function Header({ item }: { item: NavItem }) {
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/75 px-6 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg border shadow-[0_0_22px_-8px_var(--accent)]"
          style={{
            color: item.color,
            borderColor: `color-mix(in srgb, ${item.color} 45%, transparent)`,
            background: `color-mix(in srgb, ${item.color} 12%, transparent)`,
          }}
        >
          <item.icon size={18} />
        </span>
        <div className="leading-tight">
          <h1 className="text-base font-extrabold tracking-tight">{item.label}</h1>
          <p className="text-xs text-dim">{item.summary}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DockerStatus />
        {DOMAIN_KEYS.map((k) => (
          <DomainStatus key={k} d={k} />
        ))}
      </div>
    </header>
  )
}
