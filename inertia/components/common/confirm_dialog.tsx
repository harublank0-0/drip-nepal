import { useId, useState, type ReactNode } from 'react'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field, FieldLabel } from '~/components/ui/field'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'

/*
 * `ConfirmDialog` (docs/08 §4.3, §7.3) on the `alert-dialog` primitive.
 * Tier 1 states the consequence in one sentence and focuses Cancel, the
 * primitive's default (rule 2). Tier 2 adds type-to-confirm: pass
 * `identifier`, and the confirm button stays disabled until it is typed,
 * trimmed and in any case (rule 6), and that field takes focus. Fields the
 * server requires (a reason) come as `children` (rule 3). The dialog cannot
 * be closed while its request runs, and the confirm button keeps focus with
 * its pending label. A dialog opened from a menu has no
 * trigger of its own, so the caller passes `onCloseAutoFocus` to say where
 * focus goes back to (rule 1).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel,
  pendingLabel,
  destructive = true,
  identifier,
  identifierLabel,
  pending,
  onConfirm,
  onCloseAutoFocus,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  consequence: string
  confirmLabel: string
  pendingLabel: string
  destructive?: boolean
  identifier?: string
  identifierLabel?: string
  pending: boolean
  onConfirm: () => void
  onCloseAutoFocus?: (event: Event) => void
  children?: ReactNode
}) {
  const typedId = useId()
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          if (identifier === undefined) return
          event.preventDefault()
          document.getElementById(typedId)?.focus()
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Mounted only while open, so the typed identifier starts empty each time. */}
        <ConfirmBody
          typedId={typedId}
          identifier={identifier}
          identifierLabel={identifierLabel}
          confirmLabel={confirmLabel}
          pendingLabel={pendingLabel}
          destructive={destructive}
          pending={pending}
          onConfirm={onConfirm}
        >
          {children}
        </ConfirmBody>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ConfirmBody({
  typedId,
  identifier,
  identifierLabel,
  confirmLabel,
  pendingLabel,
  destructive,
  pending,
  onConfirm,
  children,
}: {
  typedId: string
  identifier?: string
  identifierLabel?: string
  confirmLabel: string
  pendingLabel: string
  destructive: boolean
  pending: boolean
  onConfirm: () => void
  children?: ReactNode
}) {
  const [typed, setTyped] = useState('')
  const matches =
    identifier === undefined || typed.trim().toLowerCase() === identifier.trim().toLowerCase()
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (matches) onConfirm()
      }}
    >
      {children}
      {identifier !== undefined && (
        <Field>
          <FieldLabel htmlFor={typedId}>{identifierLabel}</FieldLabel>
          <Input
            id={typedId}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>
      )}
      <AlertDialogFooter>
        {/* The dialog refuses to close while the request runs (see onOpenChange above). */}
        <AlertDialogCancel type="button">{t('common.form.cancel')}</AlertDialogCancel>
        {/* Not disabled while pending: a disabled button drops focus to the page, and
            useApiMutation already ignores further presses (08 §7.1 "One submit in flight"). */}
        <Button
          type="submit"
          variant={destructive ? 'destructive' : 'default'}
          disabled={!matches}
          aria-disabled={pending || undefined}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </AlertDialogFooter>
    </form>
  )
}
