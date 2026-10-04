import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field, FieldLabel, FieldDescription } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { Show } from '~/components/ui/show'

type ConfirmDialogProps = React.PropsWithChildren<{
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  confirmationValue?: string
  destructive?: boolean
  onConfirm: () => Promise<void> | void
}>

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmationValue,
  destructive = true,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const requiresTyping = !!confirmationValue
  const isReady = !requiresTyping || typed.trim() === confirmationValue

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      await onConfirm()
      onOpenChange(false)
      setTyped('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setTyped('')
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {children}

        <Show when={requiresTyping}>
          <Field>
            <FieldLabel htmlFor="confirm-value">
              Type <span className="font-mono font-semibold">{confirmationValue}</span> to confirm
            </FieldLabel>
            <Input
              id="confirm-value"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
            <FieldDescription>This action cannot be undone.</FieldDescription>
          </Field>
        </Show>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={!isReady || isSubmitting}
            onClick={handleConfirm}
          >
            <Show when={isSubmitting}>
              <Spinner data-icon="inline-start" />
            </Show>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
