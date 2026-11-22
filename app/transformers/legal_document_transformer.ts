import type { LegalDocument, LegalDocumentSlug } from '#modules/platform/legal_documents'

/*
 * The customer legal documents as pages read them (docs/08 §2.2, §2.3;
 * 01 AC-FR-IAM-001-6). A link carries the version, so the sign-up page
 * shows the versions `signUp` records; a document carries its text as
 * plain blocks, never HTML (app/modules/platform/domain/legal_text.ts).
 */
export function legalDocumentLinkJson(
  slug: LegalDocumentSlug,
  entry: { version: string; isFinal: boolean }
) {
  return { slug, version: entry.version, is_final: entry.isFinal }
}

export function legalDocumentJson(document: LegalDocument) {
  return {
    slug: document.slug,
    version: document.version,
    is_final: document.isFinal,
    title: document.title,
    blocks: document.blocks,
  }
}
