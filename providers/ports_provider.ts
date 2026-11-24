import type { ApplicationService } from '@adonisjs/core/types'
import { objectStorage } from '#config/object_storage'
import { runtime } from '#config/runtime'
import { EmailSender } from '#modules/platform/ports/email_sender'
import { ObjectStorage } from '#modules/platform/ports/object_storage'
import {
  S3ObjectStorage,
  UnconfiguredObjectStorage,
  s3ClientFor,
} from '#modules/platform/providers/s3_object_storage'
import { emailSenderFor } from '#modules/platform/providers/mail_email_sender'

/*
 * Binds each port to its adapter from configuration (docs/03 §11.1, docs/09
 * §1.2): code resolves the port from the container, and a test swaps the
 * binding (`app.container.swap`) for a fake without a code branch. A new
 * adapter per resolution, never a global singleton (docs/09 §3.13).
 */
export default class PortsProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.bind(EmailSender, async (resolver) => {
      const mail = await resolver.make('mail.manager')
      const logger = await resolver.make('logger')
      return emailSenderFor(mail.use(), runtime.appEnv, logger)
    })
    // One S3 client per process (config/object_storage.ts), or a store that refuses every call.
    const settings = objectStorage
    const client = settings
      ? s3ClientFor({
          endpoint: settings.endpoint,
          region: settings.region,
          accessKeyId: settings.accessKeyId,
          secretAccessKey: settings.secretAccessKey.release(),
        })
      : null
    this.app.container.bind(ObjectStorage, async (resolver) => {
      const logger = await resolver.make('logger')
      if (!settings || !client) return new UnconfiguredObjectStorage(logger)
      return new S3ObjectStorage(client, settings.buckets, logger)
    })
  }
}
