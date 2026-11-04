import { currentYear } from '~/lib/format'

export function Footer() {
  return (
    <footer className="border-t px-4 py-3">
      <p className="text-center text-xs text-muted-foreground">
        &copy; {currentYear()} Drip Nepal. All rights reserved.
      </p>
    </footer>
  )
}
