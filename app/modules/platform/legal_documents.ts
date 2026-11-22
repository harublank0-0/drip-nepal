import { readFile } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'
import { parseLegalText, type LegalBlock } from '#modules/platform/domain/legal_text'

/*
 * The customer legal documents and the version of each that is current
 * (01 AC-FR-IAM-001-6; docs/12 §5.1): the terms of use and the privacy
 * notice, served at `/legal/{documentSlug}` (docs/08 §2.2) as versioned
 * files in the repository [Assumption there]. `signUp` records the
 * current versions in its `user.signup` audit row, the versions the
 * sign-up page links. Both ship in M1 as drafts and their final texts
 * come with gate G4 (M7), so `isFinal` is false until then.
 *
 * M1 part 2a added this registry; part 2b reads the same versions for the
 * sign-up page and the legal pages, so the pages show what the audit row
 * records. Each version's text is the file
 * `resources/legal/<slug>/<version>.md` (docs/09 §1.2). A new version is a
 * new entry here and a new file; a published file is never edited.
 */
export const LEGAL_DOCUMENTS = {
  terms: { version: 'draft-2026-11-23', isFinal: false },
  privacy: { version: 'draft-2026-11-23', isFinal: false },
} as const

export type LegalDocumentSlug = keyof typeof LEGAL_DOCUMENTS

// The slugs in the order pages list them: the terms of use, then the privacy notice.
export const LEGAL_DOCUMENT_SLUGS = Object.keys(LEGAL_DOCUMENTS) as LegalDocumentSlug[]

// `{ terms: '<version>', privacy: '<version>' }`, as the audit row records it.
export function currentLegalVersions(): Record<LegalDocumentSlug, string> {
  return {
    terms: LEGAL_DOCUMENTS.terms.version,
    privacy: LEGAL_DOCUMENTS.privacy.version,
  }
}

/** Whether `value` names a registered document; an own key only, never `constructor`. */
export function isLegalDocumentSlug(value: unknown): value is LegalDocumentSlug {
  return typeof value === 'string' && Object.hasOwn(LEGAL_DOCUMENTS, value)
}

export type LegalDocument = {
  slug: LegalDocumentSlug
  version: string
  isFinal: boolean
  title: string
  blocks: LegalBlock[]
}

// A version's file never changes once published, so each is read and parsed once per process.
const loaded = new Map<string, Promise<LegalDocument>>()

async function load(slug: LegalDocumentSlug): Promise<LegalDocument> {
  const { version, isFinal } = LEGAL_DOCUMENTS[slug]
  // The path comes from the registry alone, never from the request.
  const source = await readFile(app.makePath('resources', 'legal', slug, `${version}.md`), 'utf8')
  return { slug, version, isFinal, ...parseLegalText(source) }
}

/*
 * The current version of a document, with its text, or null when `slug`
 * names no registered document (the page answers 404). A missing or
 * malformed file throws: the release is broken, not the request.
 */
export async function currentLegalDocument(slug: unknown): Promise<LegalDocument | null> {
  if (!isLegalDocumentSlug(slug)) return null
  const key = `${slug}@${LEGAL_DOCUMENTS[slug].version}`
  let document = loaded.get(key)
  if (!document) {
    document = load(slug)
    loaded.set(key, document)
    // A failed read is not kept, so the next request tries again.
    void document.catch(() => loaded.delete(key))
  }
  return document
}
