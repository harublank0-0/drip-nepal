import { ExternalLinkIcon } from 'lucide-react'
import { urlFor } from '~/client'
import { t } from '~/lib/i18n'

/*
 * The terms of use and the privacy notice under the sign-up form (01
 * AC-FR-IAM-001-6; docs/08 §3.1): each linked with the version `signUp`
 * records, marked "draft" until the final texts come with gate G4 (M7).
 * They open in a new tab, which the link text says, so reading them never
 * loses what the user typed.
 */
export type LegalDocumentLink = { slug: 'terms' | 'privacy'; version: string; is_final: boolean }

const TITLES = {
  terms: () => t('auth.legal.terms'),
  privacy: () => t('auth.legal.privacy'),
} as const

export function LegalDocumentLinks({ documents }: { documents: LegalDocumentLink[] }) {
  return (
    <div className="text-muted-foreground space-y-2 text-sm">
      <p>{t('auth.signup.legal_intro')}</p>
      <ul className="space-y-1">
        {documents.map((entry) => (
          <li key={entry.slug} className="flex flex-wrap items-baseline gap-x-2">
            <a
              className="text-link inline-flex items-center gap-1 font-medium underline underline-offset-4"
              href={urlFor('legal.document', { documentSlug: entry.slug })}
              target="_blank"
              rel="noopener noreferrer"
            >
              {TITLES[entry.slug]()}
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              <span className="sr-only">{t('common.new_tab')}</span>
            </a>
            <span>
              {t('auth.legal.version', { version: entry.version })}
              {entry.is_final ? null : (
                <>
                  {' '}
                  <span className="bg-muted text-foreground rounded-sm px-1.5 py-0.5 text-xs">
                    {t('auth.legal.draft')}
                  </span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
