import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { SearchIcon, XIcon } from 'lucide-react'
import { SEARCH_TERM_MAX, SEARCH_TERM_MIN, searchedTerm } from '@shared/ui/listing_url'
import { t } from '~/lib/i18n'

/*
 * The search field of `/search`'s toolbar (docs/08 §11.1, §7.2; R1-S part
 * 3d-i-b). It has no submit button: typing commits 300 ms after the last
 * key [Assumption], Enter and the clear button at once, and each cancels
 * the timer still waiting. It sends the term as the server reads it
 * (`searchedTerm`: no hyphen meaning NOT), and only with 2 to 100 code
 * points, so a term the server would refuse is never sent (06 §6.3). An
 * input method's composition pauses it until the composition ends (08
 * §11.8). What is typed is a draft; the searched term comes from the URL.
 * While the field has focus the answer never rewrites what is typed; a
 * search the URL brings another way (a link) replaces the draft, and Back
 * or Forward cancel the timer and restore the field even while it has
 * focus. Without JavaScript the field belongs to the filter form (`form`),
 * so Enter submits it.
 *
 * The recent searches of the header's search modal, which 08 §11.1 has
 * this field feed, come with that modal (R1-S part 3d-iii).
 */
const SEARCH_DELAY_MS = 300

// The term to send for what is typed: null for none, undefined for one the server would refuse.
function termOf(value: string): string | null | undefined {
  if (value.trim() === '') return null
  const searched = searchedTerm(value)
  const length = [...searched].length
  return length < SEARCH_TERM_MIN || length > SEARCH_TERM_MAX ? undefined : searched
}

export function SearchField({
  id,
  form,
  q,
  onCommit,
}: {
  id: string
  form: string
  q: string | null
  onCommit: (q: string | null) => void
}) {
  const [draft, setDraft] = useState(q ?? '')
  // The term this field last sent, and the URL's term as last rendered.
  const [sent, setSent] = useState(q)
  const [seen, setSeen] = useState(q)
  const [focused, setFocused] = useState(false)
  if (q !== seen) {
    setSeen(q)
    if (q !== sent) {
      setSent(q)
      if (!focused) setDraft(q ?? '')
    }
  }
  const timer = useRef<number | null>(null)
  const composing = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  function cancel() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  function commit(value: string) {
    cancel()
    const next = termOf(value)
    if (next === undefined) return
    setSent(next)
    onCommit(next)
  }

  function schedule(value: string) {
    cancel()
    if (termOf(value) === undefined) return
    timer.current = window.setTimeout(() => commit(value), SEARCH_DELAY_MS)
  }

  useEffect(() => {
    let fromHistory = false
    const onPopState = () => {
      fromHistory = true
      cancel()
    }
    window.addEventListener('popstate', onPopState)
    // A visit of its own means the history step brought no page.
    const stopStart = router.on('start', () => {
      fromHistory = false
    })
    const stop = router.on('navigate', (event) => {
      if (!fromHistory) return
      fromHistory = false
      const query = event.detail.page.props.query as { q: string | null } | undefined
      setSent(query?.q ?? null)
      setDraft(query?.q ?? '')
    })
    return () => {
      window.removeEventListener('popstate', onPopState)
      stopStart()
      stop()
      cancel()
    }
  }, [])

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {t('storefront.search.label')}
      </label>
      <SearchIcon
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <input
        ref={input}
        id={id}
        name="q"
        form={form}
        type="search"
        value={draft}
        maxLength={SEARCH_TERM_MAX}
        autoComplete="off"
        enterKeyHint="search"
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-11 w-full rounded-md border pr-11 pl-9 text-base outline-none focus-visible:ring-3 md:text-sm [&::-webkit-search-cancel-button]:hidden"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setDraft(event.target.value)
          if (!composing.current) schedule(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
          event.preventDefault()
          commit(event.currentTarget.value)
        }}
        onCompositionStart={() => {
          composing.current = true
          cancel()
        }}
        onCompositionEnd={(event) => {
          composing.current = false
          schedule(event.currentTarget.value)
        }}
      />
      {draft === '' ? null : (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md outline-none focus-visible:ring-3"
          onClick={() => {
            setDraft('')
            commit('')
            input.current?.focus()
          }}
        >
          <XIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">{t('storefront.search.clear')}</span>
        </button>
      )}
    </div>
  )
}
