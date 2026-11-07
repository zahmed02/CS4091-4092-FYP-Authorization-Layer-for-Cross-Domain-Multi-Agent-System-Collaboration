import { AnimatePresence, motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { Header } from './Header'
import { NAV } from './nav'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const location = useLocation()
  const outlet = useOutlet()
  const item = NAV.find((n) => n.path === location.pathname) ?? NAV[0]

  return (
    <div className="flex min-h-full" style={{ '--accent': item.color } as CSSProperties}>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header item={item} />
        <main className="flex-1 px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
