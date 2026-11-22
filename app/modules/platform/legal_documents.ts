/*
 * The customer legal documents and the version of each that is current
 * (01 AC-FR-IAM-001-6; docs/12 §5.1): the terms of use and the privacy
 * notice, served at `/legal/{documentSlug}` (docs/08 §2.2) as versioned
 * files in the repository [Assumption there]. `signUp` records the
 * current versions in its `user.signup` audit row, the versions the
 * sign-up page links. Both ship in M1 as drafts and their final texts
 * come with gate G4 (M7), so `isFinal` is false until then.
 *
 * M1 part 2a adds this registry only; the pages and their texts come with
 * part 2b, which reads the same versions, so the page shows what the
 * audit row records. A new version is a new entry here and a new file.
 */
export const LEGAL_DOCUMENTS = {
  terms: { version: 'draft-2026-11-23', isFinal: false },
  privacy: { version: 'draft-2026-11-23', isFinal: false },
} as const

export type LegalDocumentSlug = keyof typeof LEGAL_DOCUMENTS

// `{ terms: '<version>', privacy: '<version>' }`, as the audit row records it.
export function currentLegalVersions(): Record<LegalDocumentSlug, string> {
  return {
    terms: LEGAL_DOCUMENTS.terms.version,
    privacy: LEGAL_DOCUMENTS.privacy.version,
  }
}
