import { useEffect, useRef } from 'react'
import { t } from '~/lib/i18n'

/*
 * The error summary of docs/08 §7.1: form-level messages above the first
 * field, focused when they appear so screen readers read them and keyboard
 * users start from them.
 */
export function ErrorSummary({ messages }: { messages: string[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (messages.length > 0) box.current?.focus()
  }, [messages])
  if (messages.length === 0) return null
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="alert"
      className="border-destructive space-y-1 rounded-md border p-3 text-sm outline-none"
    >
      <p className="font-medium">{t('common.form.error_summary', { count: messages.length })}</p>
      <ul className="ml-4 list-disc">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  )
}
