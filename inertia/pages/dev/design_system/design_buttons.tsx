import { Button } from '~/components/ui/button'

export function DesignButtons() {
  return (
    <div className="mt-8 flex flex-wrap gap-4">
      <Button>Primary</Button>

      <Button variant="secondary">Secondary</Button>

      <Button variant="outline">Outline</Button>

      <Button variant="ghost">Ghost</Button>
    </div>
  )
}
