import { test } from '@japa/runner'
import { nepalShopPhoneNational, toNepalShopPhoneE164 } from '#shared/format/phone'

/*
 * T-UI-040, the settings form's numbers (docs/08 §2.5; R1-S part 1b): a
 * saved shop number starts the field in the form people write it in Nepal,
 * and reads back through the shared rule (`toNepalShopPhoneE164`) to the
 * same E.164, so a save without an edit sends no phone member.
 */
test.group('T-UI-040 shop numbers in the settings form', () => {
  test('T-UI-040 {e164} is shown as {national} and reads back unchanged')
    .with([
      { e164: '+9779841234567', national: '9841234567' },
      { e164: '+9779612345678', national: '9612345678' },
      { e164: '+97714123456', national: '014123456' },
      { e164: '+97761123456', national: '061123456' },
    ])
    .run(({ assert }, { e164, national }) => {
      assert.equal(nepalShopPhoneNational(e164), national)
      assert.equal(toNepalShopPhoneE164(national), e164)
    })

  test('T-UI-040 a value that is not a stored number is shown as given', ({ assert }) => {
    for (const value of ['', '9841234567', '+9779841234', '+1 555 0100']) {
      assert.equal(nepalShopPhoneNational(value), value)
    }
  })
})
