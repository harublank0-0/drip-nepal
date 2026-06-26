import { motion } from 'framer-motion'

type PasswordStrengthProps = {
  password: string
}

function getStrength(password: string): { score: number; label: string; color: string } {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-destructive' }
  if (score <= 3) return { score: 2, label: 'Medium', color: 'bg-amber-500' }
  if (score <= 5) return { score: 3, label: 'Strong', color: 'bg-emerald-500' }
  return { score: 4, label: 'Very Strong', color: 'bg-emerald-500' }
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  if (!password) return null

  const { score, label, color } = getStrength(password)
  const segments = 4

  return (
    <div
      className="mt-1.5 space-y-1"
      role="status"
      aria-live="polite"
      aria-label={`Password strength: ${label}`}
    >
      <div className="flex gap-1">
        {Array.from({ length: segments }).map((_, i) => (
          <motion.div
            key={i}
            className={`h-1 flex-1 rounded-full ${i < score ? color : 'bg-muted'}`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            style={{ transformOrigin: 'left' }}
          />
        ))}
      </div>
      <p
        className={`text-xs font-medium ${score <= 1 ? 'text-destructive' : score <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}
      >
        {label}
      </p>
    </div>
  )
}
