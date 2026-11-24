import type { ApplicationService } from '@adonisjs/core/types'
import { objectStorageConfigured, s3Buckets, s3Client } from '#config/drive'
import { runtime } from '#config/runtime'
import { EmailSender } from '#modules/platform/ports/email_sender'
import { ObjectStorage } from '#modules/platform/ports/object_storage'
import {
  DriveObjectStorage,
  UnconfiguredObjectStorage,
} from '#modules/platform/providers/drive_object_storage'
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
    // The drive disks of config/drive.ts, or a store that refuses every call while S3_* is unset.
    this.app.container.bind(ObjectStorage, async (resolver) => {
      const logger = await resolver.make('logger')
      if (!objectStorageConfigured) return new UnconfiguredObjectStorage(logger)
      const drive = await resolver.make('drive.manager')
      return new DriveObjectStorage(
        {
          private: { driver: drive.use('private').driver, bucket: s3Buckets.private },
          public: { driver: drive.use('public').driver, bucket: s3Buckets.public },
        },
        s3Client,
        logger
      )
    })
  }
}
