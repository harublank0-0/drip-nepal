import { Badge } from '~/components/ui/badge'
import { t } from '~/lib/i18n'
import { cn } from '~/lib/utils'
import { toneOf, type StatusEntity, type Tone } from '@shared/ui/status_tones'

/*
 * A lifecycle state as a label and a tone (docs/08 §4.3, §7.5). The label
 * is always text; the tone only reinforces it, in the border on a tinted
 * background with `--foreground` text (§5.2, SC 1.4.1). A state the map does
 * not know renders its raw name in the neutral tone.
 */
const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-foreground',
  info: 'border-info bg-info-subtle text-foreground',
  warning: 'border-warning bg-warning-subtle text-foreground',
  success: 'border-success bg-success-subtle text-foreground',
  destructive: 'border-destructive bg-destructive/10 text-foreground',
}

export function StatusBadge({ entity, state }: { entity: StatusEntity; state: string }) {
  const tone = toneOf(entity, state)
  const label = tone ? t(`status.${entity}.${state}` as Parameters<typeof t>[0]) : state
  return (
    <Badge variant="outline" className={cn(TONE_CLASS[tone ?? 'neutral'])}>
      {label}
    </Badge>
  )
}
