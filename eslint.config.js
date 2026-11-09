import { configApp } from '@adonisjs/eslint-config'
import { react } from '@adonisjs/eslint-config/react'

// Money code (docs/09 §11.2, ADR-0007): money is integer paisa, formatted
// only by shared/format/money.ts. T-ARCH-014 lints fixtures against these.
const MONEY_CODE = ['app/modules/**', 'shared/format/**', 'inertia/**']
const MONEY_GLOBALS = [{ name: 'parseFloat', message: 'Money is integer paisa (ADR-0007)' }]
const MONEY_PROPERTIES = [
  { object: 'Number', property: 'parseFloat', message: 'Money is integer paisa (ADR-0007)' },
  { property: 'toFixed', message: 'Format money only with formatNPR (shared/format/money.ts)' },
  { property: 'toLocaleString', message: 'Use formatNPR / formatDateTime (08 §11)' },
]

export default configApp(
  ...react,
  {
    // shadcn copies keep their upstream registry names (docs/09 §1.1 principle 5, §11.2)
    files: ['inertia/components/ui/**'],
    rules: {
      '@unicorn/filename-case': 'off',
    },
  },
  {
    // A later block that sets one of these rules for the same files replaces
    // this list (docs/09 §11.2, notes), so such a block adds these arrays.
    files: MONEY_CODE,
    ignores: ['shared/format/money.ts'],
    rules: {
      'no-restricted-globals': ['error', ...MONEY_GLOBALS],
      'no-restricted-properties': ['error', ...MONEY_PROPERTIES],
    },
  },
  {
    // Claude Code puts agent worktrees here: full copies of the repository.
    ignores: ['.claude/worktrees/**'],
  }
)
