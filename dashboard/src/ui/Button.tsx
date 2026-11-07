import { motion } from 'framer-motion'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

type Variant = 'solid' | 'ghost' | 'danger'

export function Button({
  variant = 'solid',
  className,
  ...props
}: ComponentProps<typeof motion.button> & { variant?: Variant }) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'solid' &&
          'bg-accent text-bg shadow-[0_0_22px_-6px_var(--accent)] hover:brightness-110',
        variant === 'ghost' && 'border border-line bg-raised text-fg hover:border-accent/60',
        variant === 'danger' &&
          'border border-bad/50 bg-bad/10 text-bad hover:bg-bad/20 hover:shadow-[0_0_18px_-6px_var(--color-bad)]',
        className,
      )}
      {...props}
    />
  )
}
