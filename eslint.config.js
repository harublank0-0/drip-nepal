import { configApp } from '@adonisjs/eslint-config'
import { react } from '@adonisjs/eslint-config/react'

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
    // Claude Code puts agent worktrees here: full copies of the repository.
    ignores: ['.claude/worktrees/**'],
  }
)
