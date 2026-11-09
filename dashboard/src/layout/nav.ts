import { KeyRound, LayoutDashboard, Network, ScrollText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  summary: string
  icon: LucideIcon
  color: string
}

export const NAV: NavItem[] = [
  {
    path: '/',
    label: 'Overview',
    summary: 'State of both trust domains and their link',
    icon: LayoutDashboard,
    color: 'var(--color-overview)',
  },
  {
    path: '/collaboration',
    label: 'Collaboration',
    summary: 'Agents from two domains working on one task',
    icon: Network,
    color: 'var(--color-collab)',
  },
  {
    path: '/tokens',
    label: 'Tokens & Trust',
    summary: 'Issue, revoke and verify tokens; keys and sync',
    icon: KeyRound,
    color: 'var(--color-tokens)',
  },
  {
    path: '/audit',
    label: 'Audit',
    summary: 'Every decision both domains recorded',
    icon: ScrollText,
    color: 'var(--color-audit)',
  },
]
