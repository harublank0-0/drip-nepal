import { type Data } from '@generated/data'
import { Head, usePage } from '@inertiajs/react'
import { type ReactNode } from 'react'

/*
 * The frame of the full-page error screens of docs/08 §8.3. Help is the
 * support contact the operator configured (config/storefront.ts); none is
 * shown when none is set.
 */
export function ErrorScreen({
  title,
  heading,
  children,
}: {
  title: string
  heading: string
  children: ReactNode
}) {
  const { support } = usePage<Data.SharedProps>().props
  const help = support.email ? `mailto:${support.email}` : support.whatsapp

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <Head title={title} />
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{heading}</h1>
      {children}
      {help ? (
        <p className="text-sm text-muted-foreground">
          Need help?{' '}
          <a className="underline underline-offset-4" href={help}>
            Contact support
          </a>
        </p>
      ) : null}
    </main>
  )
}
