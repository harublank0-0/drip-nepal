import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { LucideEye, LucideEyeOff } from 'lucide-react'
import { Input } from '~/components/ui/input'

type PasswordInputProps = React.ComponentProps<'input'> & {
  onValueChange?: (value: string) => void
}

export function PasswordInput({ onValueChange, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  const toggle = useCallback(() => setVisible((v) => !v), [])

  return (
    <div className="relative">
      <Input
        {...props}
        className={className ?? 'h-11 pr-11'}
        type={visible ? 'text' : 'password'}
      />
      <button
        type="button"
        onClick={toggle}
        className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        <motion.div
          key={visible ? 'visible' : 'hidden'}
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          exit={{ rotateY: -90, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        >
          {visible ? <LucideEyeOff size={18} /> : <LucideEye size={18} />}
        </motion.div>
      </button>
    </div>
  )
}
