/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  drive: {
    fs: {
      serve: typeof routes['drive.fs.serve']
    }
  }
  dev: {
    designSystem: typeof routes['dev.design_system']
    overlays: typeof routes['dev.overlays']
  }
}
