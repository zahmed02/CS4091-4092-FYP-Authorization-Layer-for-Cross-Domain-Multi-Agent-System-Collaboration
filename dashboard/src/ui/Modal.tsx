import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}

export function Modal({ open, onOpenChange, title, description, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-2xl shadow-black/60"
                style={{ x: '-50%', y: '-50%' }}
                initial={{ opacity: 0, scale: 0.94, y: '-46%' }}
                animate={{ opacity: 1, scale: 1, y: '-50%' }}
                exit={{ opacity: 0, scale: 0.96, y: '-48%' }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="text-lg font-bold tracking-tight">{title}</Dialog.Title>
                    {description && (
                      <Dialog.Description className="mt-1 text-sm text-dim">
                        {description}
                      </Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close
                    aria-label="Close"
                    className="rounded-lg p-1.5 text-dim transition hover:bg-raised hover:text-fg"
                  >
                    <X size={18} />
                  </Dialog.Close>
                </div>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
