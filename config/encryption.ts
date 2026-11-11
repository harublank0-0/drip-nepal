import env from '#start/env'
import { defineConfig, drivers } from '@adonisjs/core/encryption'

const encryptionConfig = defineConfig({
  /**
   * Default encryption driver used by the application.
   */
  default: 'gcm',

  list: {
    gcm: drivers.aes256gcm({
      /**
       * The first key encrypts and every key decrypts. APP_KEY_PREVIOUS is set
       * only for the 7 days of a yearly rotation; after an exposure the list
       * holds the new key alone (docs/09 §6.3, docs/07 §5.5).
       */
      keys: [env.get('APP_KEY'), env.get('APP_KEY_PREVIOUS')].filter((key) => key !== undefined),

      /**
       * Stable identifier for this driver.
       */
      id: 'gcm',
    }),
  },
})

export default encryptionConfig

/**
 * Inferring types for the list of encryptors you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface EncryptorsList extends InferEncryptors<typeof encryptionConfig> {}
}
