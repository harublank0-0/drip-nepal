import { test } from '@japa/runner'
import { LEGAL_DOCUMENTS } from '#modules/platform/legal_documents'
import { testBrowser, type Browser } from '#tests/support/browser'

/*
 * The draft legal pages, `/legal/{documentSlug}` (docs/08 §2.2; docs/12
 * §5.1; 01 AC-FR-IAM-001-6; M1 part 2b):
 * - T-UI-036: the terms of use and the privacy notice render on the server
 *   in the version the registry names, marked as drafts, with their text as
 *   plain blocks; any other slug, an inherited property name included,
 *   answers the 404 page.
 * - T-SEC-036: the page's prop key set: the shared props and the document.
 */

const SHARED_PROPS = [
  'errors',
  'flash',
  'support',
  'appUrl',
  'theme',
  'user',
  'current_staff',
  'request_id',
]

type Page = { component: string; props: Record<string, unknown> }
type LegalDocument = {
  slug: string
  version: string
  is_final: boolean
  title: string
  blocks: { type: string }[]
}

// An HTML answer with its Inertia page object, whatever its status.
async function htmlPage(browser: Browser, path: string) {
  const response = await browser.request(path, { headers: { Accept: 'text/html' } })
  const html = await response.text()
  const json = /<script data-page="app" type="application\/json">([^<]*)<\/script>/.exec(html)?.[1]
  return { status: response.status, html, page: JSON.parse(json ?? 'null') as Page | null }
}

test.group('T-UI-036 /legal/{documentSlug}', () => {
  test('T-UI-036 {slug} renders its current draft on the server')
    .with([
      { slug: 'terms' as const, title: 'Terms of use' },
      { slug: 'privacy' as const, title: 'Privacy notice' },
    ])
    .run(async ({ assert }, { slug, title }) => {
      const { status, html, page } = await htmlPage(testBrowser(), `/legal/${slug}`)
      assert.equal(status, 200)
      assert.equal(page?.component, 'storefront/legal_document')
      const document = page?.props.legal_document as LegalDocument
      assert.include(document, {
        slug,
        version: LEGAL_DOCUMENTS[slug].version,
        is_final: false,
        title,
      })
      assert.isAbove(document.blocks.length, 0)
      for (const block of document.blocks) {
        assert.include(['heading', 'paragraph', 'list'], block.type)
      }
      // Server-rendered (ADR-0003): markup the page JSON does not hold. The title as the
      // heading, the version line, a block as its element, and the draft notice's catalog text.
      assert.match(html, new RegExp(`<h1[^>]*>${title}</h1>`))
      assert.include(html, `Version ${LEGAL_DOCUMENTS[slug].version}`)
      assert.match(html, /<h2[^>]*>This is a draft<\/h2>/)
      assert.include(html, 'The final text will replace it before DripNepal opens to the public.')
    })

  test('T-UI-036 an unknown slug answers the 404 page: {slug}')
    .with([
      { slug: 'returns' },
      { slug: 'constructor' },
      { slug: '__proto__' },
      { slug: 'TERMS' },
      { slug: '..%2F..%2Fpackage' },
    ])
    .run(async ({ assert }, { slug }) => {
      const { status, page } = await htmlPage(testBrowser(), `/legal/${slug}`)
      assert.equal(status, 404)
      assert.equal(page?.component, 'errors/not_found')
    })

  test('T-SEC-036 /legal/terms sends the shared props and the document, nothing else', async ({
    assert,
  }) => {
    const browser = testBrowser()
    await browser.open('/legal/terms')
    const props = await browser.props('/legal/terms')
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'legal_document'])
    assert.sameMembers(Object.keys(props.legal_document as object), [
      'slug',
      'version',
      'is_final',
      'title',
      'blocks',
    ])
  })
})
