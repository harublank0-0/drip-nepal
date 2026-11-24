import env from '#start/env'

/*
 * Object storage (docs/03 §3.5, docs/09 §6.1, ADR-0013; R1-S part 2d-i): an
 * S3-compatible store with a private bucket (originals, presigned uploads)
 * and a public one (derived WebP images). The `ObjectStorage` adapter builds
 * its client from these values (`s3ClientFor`,
 * app/modules/platform/providers/s3_object_storage.ts); while any of them
 * is unset, the binding refuses every call (providers/ports_provider.ts).
 * Staging and production cannot start without them (start/env_policy.ts).
 */
const endpoint = env.get('S3_ENDPOINT')
const region = env.get('S3_REGION')
const accessKeyId = env.get('S3_ACCESS_KEY_ID')
const secretAccessKey = env.get('S3_SECRET_ACCESS_KEY')
const privateBucket = env.get('S3_BUCKET_PRIVATE')
const publicBucket = env.get('S3_BUCKET_PUBLIC')

export const objectStorage =
  endpoint && region && accessKeyId && secretAccessKey && privateBucket && publicBucket
    ? {
        endpoint,
        region,
        accessKeyId,
        secretAccessKey,
        buckets: { private: privateBucket, public: publicBucket },
      }
    : null
