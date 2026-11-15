import { ESLint } from 'eslint'

/*
 * Lints `code` with the repository's eslint.config.js as if it were the file
 * at `filePath` (it need not exist), and returns `<line>:<rule>` for every
 * message of the given rules. The lint fixture tests (T-ARCH-014,
 * T-ARCH-021, T-SEC-016, T-UI-029) use it, so a rule whose selector or
 * `files` glob matches nothing fails there (docs/09 §11.2).
 */
let eslint: ESLint | undefined

export async function lintMessages(code: string, filePath: string, rules: string[]) {
  eslint ??= new ESLint()
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
    .filter((message) => message.ruleId !== null && rules.includes(message.ruleId))
    .map((message) => `${message.line}:${message.ruleId}`)
}
