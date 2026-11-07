import { motion } from 'framer-motion'
import { Cpu, ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useScenarioConfig } from '../api/queries'
import { cn } from '../lib/cn'
import { NAV } from './nav'

function Models() {
  const { data } = useScenarioConfig()
  if (!data) return null
  return (
    <div className="border-t border-line p-3">
      <p className="mb-2 hidden items-center gap-1.5 px-1 text-[11px] font-bold text-faint lg:flex">
        <Cpu size={12} /> Language models
      </p>
      <div
        className="flex items-center gap-2 rounded-lg border border-line bg-raised/60 px-2.5 py-2"
        title={data.llm_enabled ? `Agents call ${data.llm_model} through Groq` : 'No Groq key: agents use built-in text'}
      >
        <Cpu size={15} className={cn('shrink-0', data.llm_enabled ? 'text-accent' : 'text-faint')} />
        <div className="hidden min-w-0 leading-tight lg:block">
          <p className="truncate font-mono text-[11px] font-semibold">{data.llm_model}</p>
          <p className="text-[10px] text-dim">
            {data.llm_enabled ? 'Groq, all four agents' : 'No key, template mode'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-line bg-panel/85 backdrop-blur lg:w-60">
      <div className="flex items-center gap-3 border-b border-line px-4 py-5">
        <ShieldCheck className="shrink-0 text-overview drop-shadow-[0_0_10px_var(--color-overview)]" size={26} />
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
                    className="absolute inset-0 rounded-xl border shadow-[0_0_22px_-10px_var(--accent)]"
                    style={{
                      borderColor: `color-mix(in srgb, ${item.color} 50%, transparent)`,
                      background: `color-mix(in srgb, ${item.color} 13%, transparent)`,
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
      <Models />
    </aside>
  )
}
