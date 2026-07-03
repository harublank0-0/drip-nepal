import { ClockIcon, PalmtreeIcon, PauseCircleIcon } from 'lucide-react'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Separator } from '~/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Show } from '~/components/ui/show'
import { cn } from '~/lib/utils'
import { SectionCard } from '../components/section-card'
import { WeekDays, type BusinessHours as BusinessHoursType, type WeekDay } from '../types'

type BusinessHoursProps = {
  value: BusinessHoursType
  onChange: (next: BusinessHoursType) => void
}

const dayLabels: Record<WeekDay, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export function BusinessHours({ value, onChange }: BusinessHoursProps) {
  const updateDay = (day: WeekDay, patch: Partial<BusinessHoursType['schedule'][WeekDay]>) => {
    onChange({
      ...value,
      schedule: {
        ...value.schedule,
        [day]: { ...value.schedule[day], ...patch },
      },
    })
  }

  return (
    <SectionCard
      icon={ClockIcon}
      title="Business Hours"
      description="Set your weekly operating schedule and manage temporary closures."
    >
      <div className="flex flex-col gap-1">
        {WeekDays.map((day) => {
          const schedule = value.schedule[day]
          return (
            <div
              key={day}
              className={cn(
                'grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2 py-2.5 sm:grid-cols-[120px_1fr_1fr_auto]',
                schedule.closed && 'opacity-60'
              )}
            >
              <span className="text-sm font-medium">{dayLabels[day]}</span>

              <div className="col-span-2 grid grid-cols-2 gap-2 sm:contents">
                <Input
                  type="time"
                  aria-label={`${dayLabels[day]} opening time`}
                  value={schedule.open}
                  disabled={schedule.closed}
                  onChange={(event) => updateDay(day, { open: event.target.value })}
                />
                <Input
                  type="time"
                  aria-label={`${dayLabels[day]} closing time`}
                  value={schedule.close}
                  disabled={schedule.closed}
                  onChange={(event) => updateDay(day, { close: event.target.value })}
                />
              </div>

              <label className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                <span className="hidden sm:inline">Closed</span>
                <Switch
                  size="sm"
                  checked={schedule.closed}
                  onCheckedChange={(checked) => updateDay(day, { closed: checked })}
                  aria-label={`Mark ${dayLabels[day]} as closed`}
                />
              </label>
            </div>
          )
        })}
      </div>

      <Separator className="my-5" />

      <div className="flex flex-col gap-4">
        <label className="flex items-start justify-between gap-4 rounded-lg border p-3.5">
          <span className="flex items-start gap-2.5">
            <PalmtreeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium">Holiday Mode</span>
              <span className="block text-sm text-muted-foreground">
                Show a holiday banner while keeping the store open for browsing.
              </span>
            </span>
          </span>
          <Switch
            checked={value.holidayMode}
            onCheckedChange={(checked) => onChange({ ...value, holidayMode: checked })}
          />
        </label>

        <label className="flex items-start justify-between gap-4 rounded-lg border p-3.5">
          <span className="flex items-start gap-2.5">
            <PalmtreeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium">Vacation Mode</span>
              <span className="block text-sm text-muted-foreground">
                Pause new orders while you&apos;re away, browsing stays enabled.
              </span>
            </span>
          </span>
          <Switch
            checked={value.vacationMode}
            onCheckedChange={(checked) => onChange({ ...value, vacationMode: checked })}
          />
        </label>

        <label className="flex items-start justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5">
          <span className="flex items-start gap-2.5">
            <PauseCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              <span className="block text-sm font-medium text-destructive">
                Temporarily Close Store
              </span>
              <span className="block text-sm text-muted-foreground">
                Hides your storefront entirely and blocks new orders until re-enabled.
              </span>
            </span>
          </span>
          <Switch
            checked={value.temporarilyClosed}
            onCheckedChange={(checked) => onChange({ ...value, temporarilyClosed: checked })}
          />
        </label>

        <Show when={value.temporarilyClosed}>
          <Alert variant="destructive">
            <PauseCircleIcon />
            <AlertTitle>Your store is currently closed to customers</AlertTitle>
            <AlertDescription>
              Turn this off once you&apos;re ready to start accepting orders again.
            </AlertDescription>
          </Alert>
        </Show>
      </div>
    </SectionCard>
  )
}
