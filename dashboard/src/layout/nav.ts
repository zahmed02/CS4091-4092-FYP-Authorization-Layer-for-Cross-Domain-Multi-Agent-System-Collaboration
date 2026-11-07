import { LayoutDashboard, Network } from 'lucide-react'
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
]
