import { motion } from 'framer-motion'
import { Check, Database, Fingerprint, KeyRound, MemoryStick, Server, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { DOMAINS } from '../api/client'
import type { DomainKey } from '../api/client'
import { useAuditEvents, useHealth, useProcessMetrics, useSelfDomain } from '../api/queries'
import { megabytes } from '../lib/format'

function Status({ ok, label, icon }: { ok: boolean | undefined; label: string; icon: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-dim">
        {icon}
        {label}
      </span>
      {ok === undefined ? (
        <span className="text-faint">checking</span>
      ) : ok ? (
        <span className="flex items-center gap-1 font-semibold text-ok">
          <Check size={15} /> Healthy
        </span>
      ) : (
        <span className="flex items-center gap-1 font-semibold text-bad">
          <X size={15} /> Down
        </span>
      )}
    </li>
  )
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-line bg-raised/60 px-3 py-2">
      <motion.p
        key={value}
        initial={{ opacity: 0.4, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xl font-extrabold tabular-nums"
        style={{ color }}
      >
        {value}
      </motion.p>
      <p className="text-xs text-dim">{label}</p>
    </div>
  )
}

export function DomainCard({ d }: { d: DomainKey }) {
  const meta = DOMAINS[d]
  const health = useHealth(d)
  const self = useSelfDomain(d)
  const metrics = useProcessMetrics(d)
  const audit = useAuditEvents(d, 200)
  const h = health.data

  const counts = (type: string) => audit.data?.filter((e) => e.event_type === type).length ?? 0

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: d === 'a' ? 0 : 0.1 }}
      className="rounded-2xl border bg-panel/85 p-5 backdrop-blur"
      style={{ borderColor: `color-mix(in srgb, ${meta.color} 40%, var(--color-line))` }}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: meta.color }}>
            {self.data?.name ?? meta.label}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-dim">
            <Fingerprint size={13} />
            <span className="font-mono">{self.data?.fingerprint ?? 'reading identity'}</span>
          </p>
        </div>
        <Server size={22} style={{ color: meta.color }} />
      </header>

      <ul className="divide-y divide-line border-y border-line">
        <Status ok={h?.reachable} label="API" icon={<Server size={15} />} />
        <Status ok={h?.db} label="PostgreSQL" icon={<Database size={15} />} />
        <Status ok={h?.redis} label="Redis revocation registry" icon={<MemoryStick size={15} />} />
        <Status ok={h?.keys} label="Signing keys" icon={<KeyRound size={15} />} />
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label="Issued" value={counts('token_issued')} color="var(--color-tokens)" />
        <Count label="Accepted" value={counts('token_verified')} color="var(--color-ok)" />
        <Count label="Rejected" value={counts('token_rejected')} color="var(--color-bad)" />
        <Count label="Revoked" value={counts('token_revoked')} color="var(--color-bad)" />
      </div>
      <p className="mt-2 text-xs text-faint">Counted from this domain's last 200 audit events.</p>

      {metrics.data && (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-dim">Backend memory</dt>
            <dd className="font-mono text-sm">{megabytes(metrics.data.rss_bytes)}</dd>
          </div>
          <div>
            <dt className="text-dim">Revoked in Redis</dt>
            <dd className="font-mono text-sm">{metrics.data.redis_keys}</dd>
          </div>
          <div>
            <dt className="text-dim">Audit on verify</dt>
            <dd className="font-mono text-sm">{metrics.data.audit_verifications ? 'on' : 'off'}</dd>
          </div>
        </dl>
      )}
    </motion.article>
  )
}
