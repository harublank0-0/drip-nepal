import { InfoIcon } from 'lucide-react'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'

/*
 * A customer legal document (docs/08 §2.2): its title, its version, a
 * draft notice until the final text is published (gate G4, M7), then its
 * blocks as plain elements. The server parses the versioned file into
 * headings, paragraphs and lists (app/modules/platform/domain/legal_text.ts),
 * so nothing here renders HTML from the file (docs/07 §7.4). One column at
 * reading width (08 §6.2 "Account and legal pages").
 */
export type LegalBlockView =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

export type LegalDocumentView = {
  slug: string
  version: string
  is_final: boolean
  title: string
  blocks: LegalBlockView[]
}

function Block({ block }: { block: LegalBlockView }) {
  if (block.type === 'heading') {
    return block.level === 2 ? (
      <h2 className="font-heading pt-2 text-xl font-semibold">{block.text}</h2>
    ) : (
      <h3 className="pt-1 text-base font-semibold">{block.text}</h3>
    )
  }
  if (block.type === 'list') {
    return (
      <ul className="ml-5 list-disc space-y-1">
        {block.items.map((item, index) => (
          // Items are text without ids; the list never reorders.
          <li key={index}>{item}</li>
        ))}
      </ul>
    )
  }
  return <p>{block.text}</p>
}

export function LegalDocumentArticle({ view }: { view: LegalDocumentView }) {
  return (
    <article className="mx-auto max-w-prose space-y-6 py-4 md:py-8">
      <header className="space-y-3">
        <h1
          tabIndex={-1}
          className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
        >
          {view.title}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('storefront.legal_document.version', { version: view.version })}
        </p>
        {view.is_final ? null : (
          <Alert role="note" className="border-primary/40">
            <InfoIcon aria-hidden="true" />
            <AlertTitle>{t('storefront.legal_document.draft_title')}</AlertTitle>
            <AlertDescription>{t('storefront.legal_document.draft_body')}</AlertDescription>
          </Alert>
        )}
      </header>
      <div className="space-y-4 leading-relaxed">
        {view.blocks.map((block, index) => (
          // Blocks are the file's text in order, without ids; they never reorder.
          <Block key={index} block={block} />
        ))}
      </div>
    </article>
  )
}
