import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import { NAV } from './nav'

export function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-line bg-panel/90 backdrop-blur lg:w-60">
      <div className="flex items-center gap-3 border-b border-line px-4 py-5">
        <ShieldCheck className="shrink-0 text-overview" size={26} />
        <div className="hidden leading-tight lg:block">
          <p className="text-sm font-extrabold tracking-tight">Agent Authorization</p>
          <p className="text-xs text-dim">Cross-domain console</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2.5" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} title={item.label}>
            {({ isActive }) => (
              <div
                className={cn(
                  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive ? 'text-fg' : 'text-dim hover:text-fg',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl border"
                    style={{
                      borderColor: `color-mix(in srgb, ${item.color} 45%, transparent)`,
                      background: `color-mix(in srgb, ${item.color} 12%, transparent)`,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <item.icon className="relative shrink-0" size={19} style={{ color: item.color }} />
                <span className="relative hidden lg:inline">{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
