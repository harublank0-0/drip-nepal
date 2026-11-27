/* eslint-disable react/no-unknown-property -- Inertia's <Head> replaces tags by their head-key */
import { Head } from '@inertiajs/react'

/*
 * The canonical link and robots tag every storefront page carries
 * (ADR-0017 decision 8, AC-FR-SRCH-005-2): the server decides both, so the
 * server-rendered HTML names the preferred URL before any JavaScript runs.
 */
export function PageSeo({ canonical, noindex }: { canonical: string; noindex: boolean }) {
  return (
    <Head>
      <link head-key="canonical" rel="canonical" href={canonical} />
      {noindex ? <meta head-key="robots" name="robots" content="noindex" /> : null}
    </Head>
  )
}
