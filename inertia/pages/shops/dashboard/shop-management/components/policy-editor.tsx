import { useRef } from 'react'
import { BoldIcon, Heading2Icon, ItalicIcon, ListIcon } from 'lucide-react'
import { Textarea } from '~/components/ui/textarea'
import { Toggle } from '~/components/ui/toggle'
import { cn } from '~/lib/utils'

type PolicyEditorProps = {
  value: string
  onChange: (value: string) => void
  maxLength?: number
  placeholder?: string
}

export function PolicyEditor({
  value,
  onChange,
  maxLength = 5000,
  placeholder,
}: PolicyEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const wrapSelection = (before: string, after: string = before) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const { selectionStart, selectionEnd } = textarea
    const selected = value.slice(selectionStart, selectionEnd)
    const next =
      value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd)

    onChange(next)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(selectionStart + before.length, selectionEnd + before.length)
    })
  }

  const insertListItem = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    const { selectionStart } = textarea
    const prefix = value.slice(0, selectionStart)
    const needsNewline = prefix.length > 0 && !prefix.endsWith('\n')
    const insertion = `${needsNewline ? '\n' : ''}- `
    onChange(prefix + insertion + value.slice(selectionStart))
  }

  const remaining = maxLength - value.length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 rounded-t-lg border border-b-0 bg-muted/40 p-1">
        <Toggle size="sm" onClick={() => wrapSelection('**')} aria-label="Bold">
          <BoldIcon />
        </Toggle>
        <Toggle size="sm" onClick={() => wrapSelection('_')} aria-label="Italic">
          <ItalicIcon />
        </Toggle>
        <Toggle size="sm" onClick={() => wrapSelection('## ', '')} aria-label="Heading">
          <Heading2Icon />
        </Toggle>
        <Toggle size="sm" onClick={insertListItem} aria-label="Bullet list">
          <ListIcon />
        </Toggle>
      </div>
      <Textarea
        ref={textareaRef}
        rows={7}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        className="rounded-t-none"
      />
      <div className="flex items-center justify-end">
        <span
          className={cn(
            'text-xs text-muted-foreground',
            remaining < 200 && 'text-amber-600 dark:text-amber-400',
            remaining <= 0 && 'text-destructive'
          )}
        >
          {value.length.toLocaleString()}/{maxLength.toLocaleString()} characters
        </span>
      </div>
    </div>
  )
}
