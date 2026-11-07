import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export function Panel({
  title,
  icon,
  aside,
  children,
  className,
}: {
  title?: string
  icon?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-line bg-panel/85 backdrop-blur', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
            {icon && <span className="text-accent">{icon}</span>}
            {title}
          </h2>
          {aside}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}
