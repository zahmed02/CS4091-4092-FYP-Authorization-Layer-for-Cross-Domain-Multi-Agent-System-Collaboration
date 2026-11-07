import { Ban, CheckCheck, KeyRound, Link2, ShieldCheck, ShieldX, UserCheck, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface EventMeta {
  label: string
  icon: LucideIcon
  color: string
}

export const EVENT_META: Record<string, EventMeta> = {
  token_issued: { label: 'Token issued', icon: KeyRound, color: 'var(--color-tokens)' },
  token_verified: { label: 'Token accepted', icon: ShieldCheck, color: 'var(--color-ok)' },
  token_rejected: { label: 'Token rejected', icon: ShieldX, color: 'var(--color-bad)' },
  token_revoked: { label: 'Token revoked', icon: Ban, color: 'var(--color-bad)' },
  task_join_requested: { label: 'Join requested', icon: UserPlus, color: 'var(--color-collab)' },
  task_assigned: { label: 'Agent assigned', icon: UserCheck, color: 'var(--color-collab)' },
  task_completed: { label: 'Task completed', icon: CheckCheck, color: 'var(--color-ok)' },
  trust_domain_configured: { label: 'Trust domain set', icon: Link2, color: 'var(--color-overview)' },
}

export const FALLBACK_META: EventMeta = {
  label: 'Event',
  icon: Link2,
  color: 'var(--color-dim)',
}
