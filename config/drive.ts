import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { S3Client } from '@aws-sdk/client-s3'
import { defineConfig, services } from '@adonisjs/drive'

/*
 * One S3 client per process for the two buckets of docs/03 §3.5 (ADR-0013
 * decision 7): `private` (originals, presigned uploads) and `public` (the
 * derived WebP images). Path-style addressing, so a presigned URL's origin
 * is S3_ENDPOINT's and the CSP's `connect-src` can list it (docs/07 §7.3).
 * Credentials are always given, empty when unset, so the SDK never falls
 * back to its default chain (environment, files, instance metadata); the
 * `ObjectStorage` binding refuses to use an unconfigured store
 * (`objectStorageConfigured`, providers/ports_provider.ts). Requests time
 * out after 10 s, connections after 3 s (docs/03 §11.1).
 */
export const objectStorageConfigured = Boolean(
  env.get('S3_ENDPOINT') &&
  env.get('S3_REGION') &&
  env.get('S3_ACCESS_KEY_ID') &&
  env.get('S3_SECRET_ACCESS_KEY') &&
  env.get('S3_BUCKET_PRIVATE') &&
  env.get('S3_BUCKET_PUBLIC')
)

export const s3Client = new S3Client({
  endpoint: env.get('S3_ENDPOINT') || undefined,
  region: env.get('S3_REGION') || 'auto',
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.get('S3_ACCESS_KEY_ID') ?? '',
    secretAccessKey: env.get('S3_SECRET_ACCESS_KEY')?.release() ?? '',
  },
  requestHandler: { requestTimeout: 10_000, connectionTimeout: 3_000 },
})

export const s3Buckets = {
  private: env.get('S3_BUCKET_PRIVATE') ?? '',
  public: env.get('S3_BUCKET_PUBLIC') ?? '',
}

const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK'),

  /**
   * The services object can be used to configure multiple file system
   * services each using the same or a different driver.
   */
  services: {
    fs: services.fs({
      location: app.makePath('storage'),
      serveFiles: true,
      routeBasePath: '/uploads',
      visibility: 'public',
    }),
    private: services.s3({
      client: s3Client,
      bucket: s3Buckets.private,
      visibility: 'private',
      supportsACL: false,
    }),
    public: services.s3({
      client: s3Client,
      bucket: s3Buckets.public,
      visibility: 'public',
      supportsACL: false,
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
