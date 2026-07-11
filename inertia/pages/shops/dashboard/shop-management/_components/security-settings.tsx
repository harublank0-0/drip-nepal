import { toast } from 'sonner'
import {
  CopyIcon,
  HistoryIcon,
  KeyIcon,
  LaptopIcon,
  LogOutIcon,
  PlugIcon,
  ShieldIcon,
  SmartphoneIcon,
} from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { Separator } from '~/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { SectionCard } from '../components/section-card'
import { formatDateTime } from '../format'
import type { SecuritySettingsState } from '../types'

type SecuritySettingsProps = {
  value: SecuritySettingsState
  onChange: (next: SecuritySettingsState) => void
}

export function SecuritySettings({ value, onChange }: SecuritySettingsProps) {
  const revokeDevice = (id: string) => {
    onChange({ ...value, devices: value.devices.filter((device) => device.id !== id) })
    toast.success('Device signed out')
  }

  const disconnectApp = (id: string) => {
    onChange({ ...value, connectedApps: value.connectedApps.filter((app) => app.id !== id) })
    toast.success('App disconnected')
  }

  const revokeKey = (id: string) => {
    onChange({ ...value, apiKeys: value.apiKeys.filter((key) => key.id !== id) })
    toast.success('API key revoked')
  }

  return (
    <SectionCard
      icon={ShieldIcon}
      title="Security"
      description="Protect your shop with two-factor authentication and manage active access."
    >
      <div className="flex flex-col gap-5">
        <label className="flex items-start justify-between gap-4 rounded-lg border p-3.5">
          <span className="flex items-start gap-2.5">
            <ShieldIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium">Two-Factor Authentication</span>
              <span className="block text-sm text-muted-foreground">
                Require a verification code in addition to your password.
              </span>
            </span>
          </span>
          <Switch
            checked={value.twoFactorEnabled}
            onCheckedChange={(checked) => onChange({ ...value, twoFactorEnabled: checked })}
          />
        </label>

        <Separator />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <KeyIcon className="size-4" />
              API Keys
            </p>
            <Button variant="outline" size="sm">
              Generate New Key
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {value.apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{key.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">{key.maskedKey}</p>
                  <p className="text-xs text-muted-foreground">
                    Last used {formatDateTime(key.lastUsed)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => toast.success('Key copied to clipboard')}
                        aria-label="Copy key"
                      >
                        <CopyIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy</TooltipContent>
                  </Tooltip>
                  <Button variant="destructive" size="sm" onClick={() => revokeKey(key.id)}>
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <PlugIcon className="size-4" />
            Connected Apps
          </p>
          <div className="flex flex-col gap-2">
            {value.connectedApps.map((app) => (
              <div
                key={app.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{app.name}</p>
                  <p className="text-sm text-muted-foreground">{app.description}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => disconnectApp(app.id)}>
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <HistoryIcon className="size-4" />
              Recent Login Devices
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.success('Signed out of all other sessions')}
            >
              <LogOutIcon data-icon="inline-start" />
              Sign out other sessions
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {value.devices.map((device) => (
              <div
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2.5">
                  {device.device.toLowerCase().includes('iphone') ? (
                    <SmartphoneIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <LaptopIcon className="size-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {device.device}
                      {device.current ? <Badge variant="secondary">This device</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {device.browser} · {device.location} · {formatDateTime(device.lastActive)}
                    </p>
                  </div>
                </div>
                {!device.current && (
                  <Button variant="ghost" size="sm" onClick={() => revokeDevice(device.id)}>
                    Sign out
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
