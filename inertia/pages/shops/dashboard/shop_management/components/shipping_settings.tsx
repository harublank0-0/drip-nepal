import { PlusIcon, TruckIcon, Trash2Icon } from 'lucide-react'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/components/ui/input-group'
import { Textarea } from '~/components/ui/textarea'
import { Switch } from '~/components/ui/switch'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { SectionCard } from './shared/section_card'
import { courierOptions, processingTimeOptions } from '../constants'
import type { ShippingSettings as ShippingSettingsType } from '../types'

type ShippingSettingsProps = {
  value: ShippingSettingsType
  onChange: (next: ShippingSettingsType) => void
}

let regionCounter = 0

export function ShippingSettings({ value, onChange }: ShippingSettingsProps) {
  const setField = <K extends keyof ShippingSettingsType>(
    key: K,
    fieldValue: ShippingSettingsType[K]
  ) => onChange({ ...value, [key]: fieldValue })

  const updateRegion = (id: string, patch: Partial<ShippingSettingsType['regions'][number]>) => {
    setField(
      'regions',
      value.regions.map((region) => (region.id === id ? { ...region, ...patch } : region))
    )
  }

  const addRegion = () => {
    regionCounter += 1
    setField('regions', [
      ...value.regions,
      { id: `reg_new_${regionCounter}`, name: 'New Region', flatRate: 0, enabled: true },
    ])
  }

  const removeRegion = (id: string) => {
    setField(
      'regions',
      value.regions.filter((region) => region.id !== id)
    )
  }

  return (
    <SectionCard
      id="shipping"
      icon={TruckIcon}
      title="Shipping Settings"
      description="Configure delivery regions, rates, and fulfillment expectations."
    >
      <FieldGroup>
        <div className="flex items-center justify-between">
          <FieldLabel>Shipping Regions</FieldLabel>
          <Button type="button" variant="outline" size="sm" onClick={addRegion}>
            <PlusIcon data-icon="inline-start" />
            Add Region
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {value.regions.map((region) => (
            <div
              key={region.id}
              className="grid grid-cols-1 items-center gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_160px_auto_auto]"
            >
              <Input
                value={region.name}
                onChange={(event) => updateRegion(region.id, { name: event.target.value })}
                aria-label="Region name"
              />
              <InputGroup>
                <InputGroupAddon>NPR</InputGroupAddon>
                <InputGroupInput
                  type="number"
                  min={0}
                  value={region.flatRate}
                  onChange={(event) =>
                    updateRegion(region.id, { flatRate: Number(event.target.value) })
                  }
                  aria-label="Flat rate"
                />
              </InputGroup>
              <label className="flex items-center gap-2 justify-self-start text-sm text-muted-foreground sm:justify-self-center">
                <Switch
                  size="sm"
                  checked={region.enabled}
                  onCheckedChange={(checked) => updateRegion(region.id, { enabled: checked })}
                />
                Enabled
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRegion(region.id)}
                aria-label={`Remove ${region.name}`}
                className="justify-self-end"
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="freeShippingThreshold">Free Shipping Threshold</FieldLabel>
            <InputGroup>
              <InputGroupAddon>NPR</InputGroupAddon>
              <InputGroupInput
                id="freeShippingThreshold"
                type="number"
                min={0}
                value={value.freeShippingThreshold}
                onChange={(event) => setField('freeShippingThreshold', Number(event.target.value))}
              />
            </InputGroup>
            <FieldDescription>Orders above this amount ship for free.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="handlingFee">Handling Fee</FieldLabel>
            <InputGroup>
              <InputGroupAddon>NPR</InputGroupAddon>
              <InputGroupInput
                id="handlingFee"
                type="number"
                min={0}
                value={value.handlingFee}
                onChange={(event) => setField('handlingFee', Number(event.target.value))}
              />
            </InputGroup>
          </Field>

          <Field>
            <FieldLabel htmlFor="processingTime">Estimated Processing Time</FieldLabel>
            <Select
              value={value.processingTime}
              onValueChange={(next) => setField('processingTime', next)}
            >
              <SelectTrigger id="processingTime" className="w-full">
                <SelectValue placeholder="Select processing time" />
              </SelectTrigger>
              <SelectContent>
                {processingTimeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="defaultCourier">Default Courier</FieldLabel>
            <Select
              value={value.defaultCourier}
              onValueChange={(next) => setField('defaultCourier', next)}
            >
              <SelectTrigger id="defaultCourier" className="w-full">
                <SelectValue placeholder="Select courier" />
              </SelectTrigger>
              <SelectContent>
                {courierOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="shippingNotes">Shipping Notes</FieldLabel>
          <Textarea
            id="shippingNotes"
            rows={3}
            value={value.notes ?? ''}
            onChange={(event) => setField('notes', event.target.value)}
            placeholder="Any special delivery instructions customers should know about."
          />
        </Field>
      </FieldGroup>
    </SectionCard>
  )
}
