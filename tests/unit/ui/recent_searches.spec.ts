import { test } from '@japa/runner'
import {
  clearRecentSearches,
  readRecentSearches,
  RECENT_SEARCHES_KEY,
  rememberSearch,
  type TermStore,
} from '#shared/ui/recent_searches'

/*
 * T-UI-014 (the recent searches): the search modal's list (docs/08 §11.1;
 * R1-S part 3d-iii-b). At most five terms, the latest first, a term the
 * server reads as the same one (case ignored) kept once, a term it would
 * refuse never kept, and a broken store read as an empty list.
 */
function memoryStore(
  initial: Record<string, string> = {}
): TermStore & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
    removeItem: (key) => {
      delete data[key]
    },
  }
}

test.group('T-UI-014 the recent searches', () => {
  test('T-UI-014 the latest first, at most five, the same term once', ({ assert }) => {
    const store = memoryStore()
    for (const term of ['tee', 'kurta', 'sneakers', 'saree', 'jeans', 'hoodie']) {
      rememberSearch(store, term)
    }
    assert.deepEqual(readRecentSearches(store), ['hoodie', 'jeans', 'saree', 'sneakers', 'kurta'])
    // The store itself keeps five, not only what is read back.
    assert.lengthOf(JSON.parse(store.data[RECENT_SEARCHES_KEY]), 5)
    // The same term as the server reads it, in another case or with a hyphen meaning NOT.
    assert.deepEqual(rememberSearch(store, ' -SAREE '), [
      'SAREE',
      'hoodie',
      'jeans',
      'sneakers',
      'kurta',
    ])
  })

  test('T-UI-014 a term the server would refuse is not kept', ({ assert }) => {
    const store = memoryStore()
    rememberSearch(store, 'tee')
    for (const term of ['a', '-a', '', '   ', 'x'.repeat(101)]) {
      assert.deepEqual(rememberSearch(store, term), ['tee'], JSON.stringify(term))
    }
  })

  test('T-UI-014 a broken store reads as no list; clearing empties it', ({ assert }) => {
    assert.deepEqual(readRecentSearches(memoryStore({ [RECENT_SEARCHES_KEY]: '{oops' })), [])
    assert.deepEqual(readRecentSearches(memoryStore({ [RECENT_SEARCHES_KEY]: '{"a":1}' })), [])
    assert.deepEqual(readRecentSearches(memoryStore({ [RECENT_SEARCHES_KEY]: '["tee",3]' })), [
      'tee',
    ])
    const store = memoryStore()
    rememberSearch(store, 'tee')
    clearRecentSearches(store)
    assert.deepEqual(readRecentSearches(store), [])
    const failing: TermStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    assert.deepEqual(rememberSearch(failing, 'tee'), ['tee'])
    assert.doesNotThrow(() => clearRecentSearches(failing))
  })
})
