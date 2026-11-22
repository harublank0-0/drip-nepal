import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { parseLegalText } from '#modules/platform/domain/legal_text'
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_SLUGS } from '#modules/platform/legal_documents'

/*
 * T-UI-036, the text part (docs/08 §2.2): a legal document's versioned
 * file becomes a title and plain blocks (headings, paragraphs, lists), so
 * the page renders no HTML from it; a file without a title is refused; and
 * each registered version has its file, which parses, under
 * resources/legal/<slug>/<version>.md (docs/09 §1.2).
 */
test.group('T-UI-036 legal document text', () => {
  test('T-UI-036 the title, headings, paragraphs and lists of a file', ({ assert }) => {
    const text = parseLegalText(
      [
        '# Terms of use',
        '',
        '## This is a draft',
        '',
        'First line of a paragraph',
        'and its second line.',
        '',
        'Another paragraph.',
        '',
        '### Smaller heading',
        '- One item',
        '- Another item',
        '  that wraps.',
        '',
        'After the list.',
      ].join('\n')
    )
    assert.equal(text.title, 'Terms of use')
    assert.deepEqual(text.blocks, [
      { type: 'heading', level: 2, text: 'This is a draft' },
      { type: 'paragraph', text: 'First line of a paragraph and its second line.' },
      { type: 'paragraph', text: 'Another paragraph.' },
      { type: 'heading', level: 3, text: 'Smaller heading' },
      { type: 'list', items: ['One item', 'Another item that wraps.'] },
      { type: 'paragraph', text: 'After the list.' },
    ])
  })

  test('T-UI-036 markup is kept as text, never interpreted', ({ assert }) => {
    const text = parseLegalText('# Title\r\n\r\n<b>bold</b> and [a link](https://example.com)\r\n')
    assert.deepEqual(text.blocks, [
      { type: 'paragraph', text: '<b>bold</b> and [a link](https://example.com)' },
    ])
  })

  test('T-UI-036 a file without a title, or with two, is refused', ({ assert }) => {
    assert.throws(() => parseLegalText('## Heading\n\nText.'), /title/)
    assert.throws(() => parseLegalText('# One\n\n# Two'), /title/)
  })

  test('T-UI-036 every registered version has its file, and it parses', ({ assert }) => {
    for (const slug of LEGAL_DOCUMENT_SLUGS) {
      const { version } = LEGAL_DOCUMENTS[slug]
      const path = join(process.cwd(), 'resources', 'legal', slug, `${version}.md`)
      const text = parseLegalText(readFileSync(path, 'utf8'))
      assert.isNotEmpty(text.title, slug)
      assert.isAbove(text.blocks.length, 0, slug)
    }
  })
})
