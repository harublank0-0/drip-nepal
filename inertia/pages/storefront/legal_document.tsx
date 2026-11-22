import { Head } from '@inertiajs/react'
import type { InertiaProps } from '~/types'
import {
  LegalDocumentArticle,
  type LegalDocumentView,
} from '~/components/common/legal_document_article'

/*
 * `/legal/{documentSlug}` (docs/08 §2.2): the terms of use or the privacy
 * notice in its current version, server-rendered in the storefront layout.
 * In M1 both are drafts, marked as such; the final texts come with gate G4
 * (M7). The page title is the document's own.
 */
type Props = InertiaProps<{
  legal_document: LegalDocumentView
}>

export default function LegalDocument({ legal_document }: Props) {
  return (
    <>
      <Head title={legal_document.title} />
      <LegalDocumentArticle view={legal_document} />
    </>
  )
}
