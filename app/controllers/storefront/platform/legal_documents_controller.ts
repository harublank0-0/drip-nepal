import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { currentLegalDocument } from '#modules/platform/legal_documents'
import { legalDocumentJson } from '#transformers/legal_document_transformer'

/*
 * `/legal/{documentSlug}` (docs/08 §2.2): the current version of the terms
 * of use or the privacy notice, server-rendered (ADR-0003). In M1 both are
 * drafts, marked as such, until their final texts come with gate G4 (M7);
 * the return and refund policy joins then. Any other slug answers the 404
 * page. GET only.
 */
export default class LegalDocumentsController {
  async show(ctx: HttpContext) {
    const document = await currentLegalDocument(ctx.params.documentSlug)
    if (!document) throw new DomainError('NOT_FOUND')
    return ctx.inertia.render('storefront/legal_document', {
      legal_document: legalDocumentJson(document),
    })
  }
}
