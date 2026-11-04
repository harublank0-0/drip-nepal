import type { ReactNode } from 'react'
import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ContactOptions, hasContact, useSupport } from '~/components/support/contact_options'
import { cn } from '~/lib/utils'

const pages = [
  { route: 'legal.returns', label: 'Returns' },
  { route: 'legal.terms', label: 'Terms' },
  { route: 'legal.privacy', label: 'Privacy' },
] as const

type PolicyRoute = (typeof pages)[number]['route']

/*
 * Shared frame for the policy pages: a title, the date the text last
 * changed, the sections, and how to reach the store.
 */
export function LegalPage({
  title,
  updated,
  intro,
  current,
  children,
}: {
  title: string
  updated: string
  intro: ReactNode
  current: PolicyRoute
  children: ReactNode
}) {
  const support = useSupport()

  return (
    <>
      <Head title={title} />
      <article className="mx-auto max-w-2xl px-5 pt-8 pb-16 md:px-8 md:pt-14">
        <nav aria-label="Policies" className="mb-8 flex gap-2 overflow-x-auto">
          {pages.map((page) => (
            <Link
              key={page.route}
              route={page.route}
              aria-current={page.route === current ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-full border px-4 py-2 text-sm transition-colors',
                page.route === current
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {page.label}
            </Link>
          ))}
        </nav>

        <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-6 text-base leading-relaxed text-foreground/90">{intro}</div>

        <div className="mt-10 space-y-10">{children}</div>

        {hasContact(support) && (
          <section className="mt-12 rounded-2xl border border-border/60 bg-card p-5 md:p-6">
            <h2 className="font-heading text-xl font-bold">Questions?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Get in touch and we will help.</p>
            <ContactOptions className="mt-4" />
          </section>
        )}
      </article>
    </>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-xl font-bold md:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-foreground/85 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  )
}
