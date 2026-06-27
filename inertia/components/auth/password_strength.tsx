import { useMemo } from 'react'
import { motion } from 'framer-motion'

type Strength = 0 | 1 | 2 | 3 | 4

function getStrength(password: string): Strength {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  if (score >= 4) return 4
  return score as Strength
}

const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500']

export function PasswordStrength({ value }: { value: string }) {
  const strength = useMemo(() => getStrength(value), [value])

  if (!value) return null

  return (
    <motion.div
      className="mt-1.5 flex flex-col gap-1"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="flex h-1 gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-full flex-1 rounded-full transition-all duration-300 ${
              strength >= level ? colors[strength] : 'bg-border'
            }`}
          />
        ))}
      </div>
      {strength > 0 && <p className="text-xs text-muted-foreground">{labels[strength]} password</p>}
    </motion.div>
  )
}
