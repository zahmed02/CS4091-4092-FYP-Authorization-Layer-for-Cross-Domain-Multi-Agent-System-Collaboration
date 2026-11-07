import { motion } from 'framer-motion'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

type Variant = 'solid' | 'ghost'

export function Button({
  variant = 'solid',
  className,
  ...props
}: ComponentProps<typeof motion.button> & { variant?: Variant }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'solid'
          ? 'bg-accent text-bg hover:brightness-110'
          : 'border border-line bg-raised text-fg hover:border-accent/50',
        className,
      )}
      {...props}
    />
  )
}
