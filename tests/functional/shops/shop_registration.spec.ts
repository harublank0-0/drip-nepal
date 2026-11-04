import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import { userSignupValidator } from '#modules/auth/validators/user'
import { shopSignupValidator } from '#modules/shops/validators/shop'
import { createShop } from '#tests/support/fixtures'

/*
 * Shop registration and customer signup refuse, on the field, what the
 * users and shops tables would refuse: a value too long for its column, a
 * name, email or phone already taken, a category that doesn't exist. The
 * insert would otherwise fail with a 500, after the form was filled in.
 */

// An email of the given length that passes the format check: a 60-letter
// name at a domain of `b`s.
function emailOfLength(length: number) {
  return `${'a'.repeat(60)}@${'b'.repeat(length - 66)}.test`
}

function registration(fields: Record<string, unknown> = {}) {
  const id = randomUUID().slice(0, 8)
  return {
    fullName: 'Asha Gurung',
    email: `owner-${id}@example.test`,
    phone: `98${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
    password: 'a-long-password',
    confirmPassword: 'a-long-password',
    shopName: `Asha Store ${id}`,
    shopSlug: `asha-store-${id}`,
    categories: ['mens-fashion'],
    description: 'Handmade dhaka tops',
    address: 'Lakeside Road',
    city: 'Pokhara',
    district: 'Kaski',
    province: 'Gandaki',
    ...fields,
  }
}

function signup(fields: Record<string, unknown> = {}) {
  return {
    fullName: 'Sita Sharma',
    email: `customer-${randomUUID().slice(0, 8)}@example.test`,
    password: 'a-long-password',
    passwordConfirmation: 'a-long-password',
    ...fields,
  }
}

async function refusedFields(validation: Promise<unknown>) {
  try {
    await validation
  } catch (error) {
    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      return (error.messages as { field: string }[]).map((message) => message.field)
    }
    throw error
  }
  return []
}

test.group('Shop registration checks [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('a complete registration passes', async ({ assert }) => {
    assert.deepEqual(await refusedFields(shopSignupValidator.validate(registration())), [])
  })

  test('a shop name already taken is refused', async ({ assert }) => {
    const taken = await createShop()

    const refused = await refusedFields(
      shopSignupValidator.validate(registration({ shopName: taken.name }))
    )

    assert.deepEqual(refused, ['shopName'])
  })

  test('a shop URL {slug} is refused')
    .with([
      { slug: 'asha store' },
      { slug: 'asha/store' },
      { slug: 'asha?store' },
      { slug: 'Asha-Store' },
      { slug: 'asha--store' },
      { slug: '-asha' },
      { slug: 'asha-' },
    ])
    .run(async ({ assert }, row) => {
      const refused = await refusedFields(
        shopSignupValidator.validate(registration({ shopSlug: row.slug }))
      )

      assert.deepEqual(refused, ['shopSlug'])
    })

  test('a category that does not exist is refused', async ({ assert }) => {
    const refused = await refusedFields(
      shopSignupValidator.validate(registration({ categories: ['mens-fashion', 'no-such'] }))
    )

    assert.deepEqual(refused, ['categories.1'])
  })

  test('no category, or the same one twice, is refused', async ({ assert }) => {
    for (const categories of [[], ['mens-fashion', 'mens-fashion']]) {
      const refused = await refusedFields(
        shopSignupValidator.validate(registration({ categories }))
      )
      assert.lengthOf(refused, 1, JSON.stringify(categories))
      assert.match(refused[0], /^categories/)
    }
  })

  test("another shop's email or phone is refused", async ({ assert }) => {
    const other = await createShop({
      email: `shop-${randomUUID()}@example.test`,
      phone: '9800000001',
    })

    const refused = await refusedFields(
      shopSignupValidator.validate(registration({ email: other.email, phone: other.phone }))
    )

    assert.sameMembers(refused, ['email', 'phone'])
  })

  test('an email longer than the 100-character column is refused', async ({ assert }) => {
    assert.lengthOf(emailOfLength(101), 101)
    assert.deepEqual(
      await refusedFields(
        shopSignupValidator.validate(registration({ email: emailOfLength(100) }))
      ),
      []
    )

    const refused = await refusedFields(
      shopSignupValidator.validate(registration({ email: emailOfLength(101) }))
    )

    assert.deepEqual(refused, ['email'])
  })
})

test.group('Customer signup checks [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('a complete signup passes', async ({ assert }) => {
    assert.deepEqual(await refusedFields(userSignupValidator.validate(signup())), [])
  })

  test('a name {label} is refused')
    .with([
      { label: 'longer than 100 characters', fullName: 'a'.repeat(101) },
      { label: 'of spaces only', fullName: '   ' },
    ])
    .run(async ({ assert }, row) => {
      const refused = await refusedFields(
        userSignupValidator.validate(signup({ fullName: row.fullName }))
      )

      assert.deepEqual(refused, ['fullName'])
    })

  test('an email longer than the 100-character column is refused', async ({ assert }) => {
    const refused = await refusedFields(
      userSignupValidator.validate(signup({ email: emailOfLength(101) }))
    )

    assert.deepEqual(refused, ['email'])
  })
})
