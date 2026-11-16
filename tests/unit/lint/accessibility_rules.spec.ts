import { test } from '@japa/runner'
import { lintMessages } from '#tests/support/lint'

/*
 * T-UI-029: the accessibility lint of docs/09 §13.9, eslint-plugin-jsx-a11y's
 * recommended set on inertia/**\/*.tsx outside inertia/components/ui/, with
 * the five raised rules, each with a failing and a passing fixture. The
 * component mapping makes the rules reach Button, Input and Link.
 */

const FILE = 'inertia/pages/catalog/show.tsx'

const cases = [
  {
    rule: 'jsx-a11y/alt-text',
    failing: '<img src="/a.jpg" />',
    passing: '<img src="/a.jpg" alt="Red kurta, front" />',
  },
  {
    rule: 'jsx-a11y/anchor-is-valid',
    failing: '<a href="#">Details</a>',
    passing: '<a href="/p/kurta-ab12cd34">Details</a>',
  },
  {
    rule: 'jsx-a11y/label-has-associated-control',
    failing: '<label>Email</label>',
    passing: '<label htmlFor="email">Email</label>',
  },
  {
    rule: 'jsx-a11y/no-autofocus',
    failing: '<input name="q" autoFocus />',
    passing: '<input name="q" />',
  },
  {
    rule: 'jsx-a11y/click-events-have-key-events',
    failing: '<li onClick={open}>Open</li>',
    passing: '<li><button type="button" onClick={open}>Open</button></li>',
  },
]

const component = (jsx: string) =>
  `declare const open: () => void\nexport function Fixture() {\n  return (\n    ${jsx}\n  )\n}\n`

test.group('T-UI-029 accessibility lint rules', (group) => {
  group.each.timeout(30_000)

  test('T-UI-029 {rule} fails')
    .with(cases)
    .run(async ({ assert }, { rule, failing }) => {
      assert.include(await lintMessages(component(failing), FILE, [rule]), `4:${rule}`)
    })

  test('T-UI-029 {rule} passes on the accessible form')
    .with(cases)
    .run(async ({ assert }, { rule, passing }) => {
      assert.deepEqual(await lintMessages(component(passing), FILE, [rule]), [])
    })

  test('T-UI-029 the component mapping reaches Link and Input', async ({ assert }) => {
    const code = component(
      '<>\n      <Link href="#">Back</Link>\n      <Input autoFocus />\n    </>'
    ).replace(
      'declare const open',
      "import { Link } from '@inertiajs/react'\ndeclare const Input: (props: object) => null\ndeclare const open"
    )
    assert.deepEqual(
      await lintMessages(code, FILE, ['jsx-a11y/anchor-is-valid', 'jsx-a11y/no-autofocus']),
      ['7:jsx-a11y/anchor-is-valid', '8:jsx-a11y/no-autofocus']
    )
  })

  test('T-UI-029 inertia/components/ui/ is left to axe', async ({ assert }) => {
    const rules = cases.map((entry) => entry.rule)
    assert.deepEqual(
      await lintMessages(component(cases[0].failing), 'inertia/components/ui/avatar.tsx', rules),
      []
    )
  })
})
