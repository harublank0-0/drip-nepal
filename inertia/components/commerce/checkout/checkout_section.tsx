import type { ReactNode } from 'react'

type CheckoutSectionProps = {
  id: string
  step: number
  title: string
  description?: ReactNode
  children: ReactNode
}

export function CheckoutSection({ id, step, title, description, children }: CheckoutSectionProps) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="rounded-xl border border-border/60 bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="font-heading text-lg leading-6 font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}
