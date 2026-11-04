import { TanStackDevtools } from '@tanstack/react-devtools'
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools'

/*
 * Development-only devtools, mounted by inertia/app.tsx in a separate root
 * only when import.meta.env.DEV is true, so they are not in the production
 * bundle (RF-30).
 */
export default function Devtools() {
  return <TanStackDevtools plugins={[formDevtoolsPlugin()]} />
}
