import type { CSSProperties, ReactNode } from 'react'
import { cn } from '../lib/cn'

export function Panel({
  title,
  icon,
  aside,
  children,
  className,
  color,
  glow = false,
}: {
  title?: string
  icon?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
  /** Outline colour. Defaults to the section accent. */
  color?: string
  /** A soft halo, used for the one panel that is currently the focus. */
  glow?: boolean
}) {
  const c = color ?? 'var(--accent)'
  const style = {
    borderColor: `color-mix(in srgb, ${c} 28%, var(--color-line))`,
    boxShadow: glow
      ? `0 0 0 1px color-mix(in srgb, ${c} 40%, transparent), 0 0 34px -8px color-mix(in srgb, ${c} 60%, transparent)`
      : '0 1px 0 0 color-mix(in srgb, white 4%, transparent) inset',
  } as CSSProperties
  return (
    <section
      className={cn('rounded-2xl border bg-panel/80 backdrop-blur transition-shadow duration-500', className)}
      style={style}
    >
      {title && (
        <header
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5"
          style={{ borderColor: `color-mix(in srgb, ${c} 16%, var(--color-line))` }}
        >
          <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
            {icon && <span style={{ color: c }}>{icon}</span>}
            {title}
          </h2>
          {aside}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}
