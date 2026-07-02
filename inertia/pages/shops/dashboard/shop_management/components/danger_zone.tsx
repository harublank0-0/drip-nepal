import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowRightLeftIcon, PowerIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field, FieldLabel } from '~/components/ui/field'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card'
import { ConfirmDialog } from './shared/confirm_dialog'

type DangerZoneProps = {
  storeName: string
}

export function DangerZone({ storeName }: DangerZoneProps) {
  const [dialog, setDialog] = useState<'delete' | 'deactivate' | 'transfer' | null>(null)
  const [transferEmail, setTransferEmail] = useState('')

  return (
    <Card id="danger" className="scroll-mt-24 border-destructive/30">
      <CardHeader className="flex flex-row items-start gap-3 border-b border-destructive/20 pb-4">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <TriangleAlertIcon className="size-4" />
        </span>
        <div>
          <CardTitle className="text-base font-heading font-medium text-destructive">
            Danger Zone
          </CardTitle>
          <CardDescription>
            These actions are destructive and, in most cases, cannot be undone.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <DangerRow
          icon={PowerIcon}
          title="Deactivate Shop"
          description="Temporarily hide your storefront. You can reactivate anytime."
          actionLabel="Deactivate"
          onClick={() => setDialog('deactivate')}
        />
        <DangerRow
          icon={ArrowRightLeftIcon}
          title="Transfer Ownership"
          description="Transfer this shop and all its data to another account."
          actionLabel="Transfer"
          onClick={() => setDialog('transfer')}
        />
        <DangerRow
          icon={Trash2Icon}
          title="Delete Shop"
          description="Permanently delete this shop, its products, and order history."
          actionLabel="Delete"
          onClick={() => setDialog('delete')}
        />
      </CardContent>

      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        title="Delete this shop?"
        description="This permanently deletes your storefront, products, and order history. This cannot be undone."
        confirmLabel="Delete Shop"
        confirmationValue={storeName}
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 700))
          toast.success('Shop deletion scheduled')
        }}
      />

      <ConfirmDialog
        open={dialog === 'deactivate'}
        onOpenChange={(open) => setDialog(open ? 'deactivate' : null)}
        title="Deactivate this shop?"
        description="Your storefront will be hidden from customers until you reactivate it."
        confirmLabel="Deactivate Shop"
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 700))
          toast.success('Shop deactivated')
        }}
      />

      <ConfirmDialog
        open={dialog === 'transfer'}
        onOpenChange={(open) => setDialog(open ? 'transfer' : null)}
        title="Transfer ownership"
        description="The new owner will gain full control of this shop, including billing and staff access."
        confirmLabel="Send Transfer Request"
        destructive={false}
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 700))
          toast.success(`Transfer request sent to ${transferEmail || 'the new owner'}`)
          setTransferEmail('')
        }}
      >
        <Field>
          <FieldLabel htmlFor="transfer-email">New owner&apos;s email</FieldLabel>
          <Input
            id="transfer-email"
            type="email"
            value={transferEmail}
            onChange={(event) => setTransferEmail(event.target.value)}
            placeholder="owner@example.com"
          />
        </Field>
      </ConfirmDialog>
    </Card>
  )
}

function DangerRow({
  icon: Icon,
  title,
  description,
  actionLabel,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  actionLabel: string
  onClick: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button variant="destructive" size="sm" onClick={onClick}>
        {actionLabel}
      </Button>
    </div>
  )
}
