import { test } from '@japa/runner'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { PROBLEM_CODES, problemType, type ProblemCode } from '#exceptions/problem_codes'

/*
 * T-API-011: the problem-code registry equals the `ProblemCode` enum of
 * docs/openapi.yaml and the code table of docs/06 §5.2, with the same
 * statuses and the same (proposed) marks (docs/09 §4.5, §5.2). Titles match
 * every problem example of openapi.yaml and 06, and no application code
 * throws a proposed code before the product owner adopts it.
 */

const root = process.cwd()
const registry = Object.keys(PROBLEM_CODES).sort()

async function specTable() {
  const text = await readFile(join(root, 'docs/06-api-design.md'), 'utf8')
  const section = text.slice(text.indexOf('### 5.2 Codes'), text.indexOf('### 5.3 '))
  const rows = [...section.matchAll(/^\| (\d{3}) +\| `([A-Z_]+)`( \(proposed\))? +\|/gm)]
  return rows.map(([, status, code, proposed]) => ({
    code,
    status: Number(status),
    proposed: Boolean(proposed),
  }))
}

async function openapiEnum() {
  const text = await readFile(join(root, 'docs/openapi.yaml'), 'utf8')
  const start = text.indexOf('\n    ProblemCode:\n')
  const enumStart = text.indexOf('      enum:\n', start)
  const codes: string[] = []
  for (const line of text.slice(enumStart).split('\n').slice(1)) {
    const match = /^ {8}- ([A-Z_]+)$/.exec(line)
    if (!match) break
    codes.push(match[1])
  }
  return codes
}

// Every (type, title) pair of a problem example, in YAML or in JSON.
async function exampleTitles() {
  const pairs: { file: string; type: string; title: string }[] = []
  const yaml = await readFile(join(root, 'docs/openapi.yaml'), 'utf8')
  for (const match of yaml.matchAll(
    /type: (https:\/\/dripnepal\.com\/problems\/[a-z-]+)\n\s+title: (.+)\n/g
  )) {
    pairs.push({ file: 'openapi.yaml', type: match[1], title: match[2].trim() })
  }
  const markdown = await readFile(join(root, 'docs/06-api-design.md'), 'utf8')
  for (const match of markdown.matchAll(
    /"type": "(https:\/\/dripnepal\.com\/problems\/[a-z-]+)",\s*"title": "([^"]+)"/g
  )) {
    pairs.push({ file: '06-api-design.md', type: match[1], title: match[2] })
  }
  return pairs
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return Promise.resolve(/\.tsx?$/.test(entry.name) ? [path] : [])
    })
  )
  return files.flat()
}

test.group('T-API-011 problem-code registry', () => {
  test('the registry lists exactly the codes of docs/06 §5.2', async ({ assert }) => {
    const table = await specTable()
    assert.isAbove(table.length, 20)
    assert.deepEqual(registry, table.map((row) => row.code).sort())
  })

  test('statuses and proposed marks match docs/06 §5.2', async ({ assert }) => {
    for (const row of await specTable()) {
      const entry = PROBLEM_CODES[row.code as ProblemCode]
      assert.equal(entry.status, row.status, row.code)
      assert.equal('proposed' in entry, row.proposed, `${row.code} proposed mark`)
    }
  })

  test('the registry lists exactly the ProblemCode enum of openapi.yaml', async ({ assert }) => {
    const codes = await openapiEnum()
    assert.isAbove(codes.length, 20)
    assert.deepEqual(registry, codes.sort())
  })

  test('every problem example carries its code type and registry title', async ({ assert }) => {
    const types = new Map(registry.map((code) => [problemType(code as ProblemCode), code]))
    const pairs = await exampleTitles()
    assert.isAbove(pairs.length, 5)
    for (const { file, type, title } of pairs) {
      const code = types.get(type) as ProblemCode | undefined
      assert.isDefined(code, `${file}: unknown problem type ${type}`)
      assert.equal(title, PROBLEM_CODES[code!].title, `${file}: title of ${type}`)
    }
  })

  test('no application code throws a proposed code', async ({ assert }) => {
    const proposed = registry.filter((code) => 'proposed' in PROBLEM_CODES[code as ProblemCode])
    assert.deepEqual(proposed, ['CHECKOUT_DISABLED', 'MALFORMED_REQUEST', 'SERVICE_BUSY'])
    const pattern = new RegExp(`['"\`](${proposed.join('|')})['"\`]`)
    const offenders: string[] = []
    for (const file of await sourceFiles(join(root, 'app'))) {
      const path = relative(root, file)
      if (path === join('app', 'exceptions', 'problem_codes.ts')) continue
      if (pattern.test(await readFile(file, 'utf8'))) offenders.push(path)
    }
    assert.deepEqual(offenders, [])
  })
})
