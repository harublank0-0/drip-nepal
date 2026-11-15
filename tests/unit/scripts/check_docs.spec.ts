import { test } from '@japa/runner'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * T-ARCH-029: the docs check of ADR-0001 (Verification). Relative links and
 * their #fragments resolve, every ADR has the eight sections of ADR-0001
 * decision 2, no number is used twice, and the index links every ADR.
 */

const SECTIONS = [
  'Status',
  'Context',
  'Decision',
  'Alternatives considered',
  'Consequences',
  'When to revisit',
  'Verification',
  'Related',
]

const adr = (number: string, sections = SECTIONS) =>
  [`# ADR-${number}: A decision`, '', 'Status: Draft v1 (2026-11-15)', '']
    .concat(sections.flatMap((section) => [`## ${section}`, '', 'Text.', '']))
    .join('\n')

const VALID = {
  'README.md':
    '# Read me\n\nSee [the guide](docs/guide.md#1-first-steps) and [twice](docs/guide.md#notes-1).\n',
  'docs/guide.md':
    '# Guide\n\n## 1. First steps\n\n## Notes\n\n## Notes\n\n<a id="kept"></a>\n\n[Self](#kept) and [ADRs](adr/README.md).\n\n```md\n[not a link](missing.md)\n```\n\nInline `[code](missing.md)` and [a site](https://example.com/x.md).\n',
  'docs/adr/README.md':
    '# ADRs\n\n| [0001](0001-first.md) | First |\n| [0002](0002-second.md) | Second |\n',
  'docs/adr/0001-first.md': adr('0001'),
  'docs/adr/0002-second.md': adr('0002'),
}

async function check(files: Record<string, string | undefined>) {
  const tree = await fixtureTree(files)
  try {
    return await runScript('check_docs.mjs', ['--root', tree.root])
  } finally {
    await tree.cleanup()
  }
}

test.group('T-ARCH-029 docs links, ADR sections, numbering and index', (group) => {
  group.each.timeout(30_000)

  test('T-ARCH-029 the repository passes', async ({ assert }) => {
    const result = await runScript('check_docs.mjs')
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /relative link\(s\) resolve; \d+ ADR\(s\)/)
  })

  test('T-ARCH-029 a valid fixture passes, including a repeated heading and an <a id>', async ({
    assert,
  }) => {
    const result = await check(VALID)
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-ARCH-029 fails on {case}')
    .with([
      {
        case: 'a link to a missing file',
        change: { 'README.md': '[x](docs/missing.md)\n' },
        expected: 'docs/missing.md does not exist',
      },
      {
        case: 'a fragment with no heading',
        change: { 'README.md': '[x](docs/guide.md#2-second-steps)\n' },
        expected: 'no heading #2-second-steps',
      },
      {
        case: 'a link that leaves the repository',
        change: { 'README.md': '[x](../outside.md)\n' },
        expected: 'leaves the repository',
      },
      {
        case: 'an ADR without a required section',
        change: { 'docs/adr/0002-second.md': adr('0002', SECTIONS.slice(0, 7)) },
        expected: '0002-second.md: the ## sections',
      },
      {
        case: 'an ADR whose title number differs from its file',
        change: { 'docs/adr/0002-second.md': adr('0003') },
        expected: 'the title is not "# ADR-0002',
      },
      {
        case: 'two ADRs with one number',
        change: { 'docs/adr/0002-other.md': adr('0002') },
        expected: 'ADR number 0002 is used by',
      },
      {
        case: 'an ADR missing from the index',
        change: { 'docs/adr/0003-third.md': adr('0003') },
        expected: 'the index does not link 0003-third.md',
      },
    ])
    .run(async ({ assert }, { change, expected }) => {
      const result = await check({ ...VALID, ...change })
      assert.equal(result.code, 1)
      assert.include(result.stderr, expected)
    })
})
