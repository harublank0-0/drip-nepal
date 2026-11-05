import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme, type Theme } from '~/components/providers/theme_provider'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { cn } from '~/lib/utils'

const OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
]

const labelFor = (theme: Theme) => OPTIONS.find((option) => option.value === theme)!.label

/*
 * An icon button that opens Light, Dark and System. The icon shows the
 * current choice.
 */
export function ThemeMenu({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const Icon = OPTIONS.find((option) => option.value === theme)!.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('cursor-pointer', className)}
          aria-label={`Theme: ${labelFor(theme)}`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          {OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon className="size-4" aria-hidden="true" />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/*
 * The same choice as three buttons side by side, for the phone menu.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <div role="group" aria-label="Theme" className={cn('grid grid-cols-3 gap-1', className)}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          onClick={() => setTheme(option.value)}
          className={cn(
            'flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm transition-colors',
            theme === option.value
              ? 'bg-white text-black'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          <option.icon className="size-4" aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  )
}
