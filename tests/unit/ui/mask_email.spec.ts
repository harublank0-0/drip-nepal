import { test } from '@japa/runner'
import { maskEmail } from '#shared/format/email'

/*
 * T-UI-036, the masked address (docs/08 §2.3; 02 J-04 step 3): right after
 * `signUp`, `/verify-email` shows the address the user typed with only its
 * first character and its domain, masked in the browser by the same rule
 * `platform:create-admin` prints with (docs/09 §9.1).
 */
test.group('T-UI-036 the masked address', () => {
  test('T-UI-036 {email} reads {masked}')
    .with([
      { email: 'ram@example.com', masked: 'r•••@example.com' },
      { email: 'sita.shrestha@gmail.com', masked: 's•••@gmail.com' },
      { email: 'a@b.np', masked: 'a•••@b.np' },
      { email: 'odd@local@example.com', masked: 'o•••@example.com' },
      { email: '@example.com', masked: '•••' },
      { email: 'no-at-sign', masked: '•••' },
    ])
    .run(({ assert }, { email, masked }) => {
      assert.equal(maskEmail(email), masked)
    })
})
