import { ClipboardCheck, Eye, LineChart, PenLine, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface RoleMeta {
  label: string
  color: string
  icon: LucideIcon
  job: string
}

export const ROLE_META: Record<string, RoleMeta> = {
  researcher: {
    label: 'Researcher',
    color: 'var(--color-researcher)',
    icon: Search,
    job: 'Gathers the facts',
  },
  analyst: {
    label: 'Analyst',
    color: 'var(--color-analyst)',
    icon: LineChart,
    job: 'Finds the pattern',
  },
  writer: {
    label: 'Writer',
    color: 'var(--color-writer)',
    icon: PenLine,
    job: 'Writes the summary',
  },
  reviewer: {
    label: 'Reviewer',
    color: 'var(--color-reviewer)',
    icon: ClipboardCheck,
    job: 'Checks the summary',
  },
  auditor: {
    label: 'Auditor',
    color: 'var(--color-auditor)',
    icon: Eye,
    job: 'Read-only access',
  },
}

export function roleMeta(role: string): RoleMeta {
  return ROLE_META[role] ?? { label: role, color: 'var(--color-dim)', icon: Search, job: '' }
}

export interface StageMeta {
  label: string
  tone: 'ok' | 'bad' | 'warn' | 'accent' | 'neutral'
}

export const STAGE_META: Record<string, StageMeta> = {
  issued: { label: 'Token issued', tone: 'neutral' },
  joined: { label: 'Joined the task', tone: 'ok' },
  researching: { label: 'Researching', tone: 'accent' },
  working: { label: 'Working', tone: 'accent' },
  reading: { label: 'Reading', tone: 'accent' },
  waiting: { label: 'Waiting', tone: 'neutral' },
  done: { label: 'Finished', tone: 'ok' },
  revoked: { label: 'Revoked', tone: 'bad' },
  refused: { label: 'Refused', tone: 'bad' },
  expired: { label: 'Token expired', tone: 'warn' },
}

export const stageMeta = (stage: string): StageMeta =>
  STAGE_META[stage] ?? { label: stage, tone: 'neutral' }
