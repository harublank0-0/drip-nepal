import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 6 of 14 (docs/04 §20.2.2): media. `media_assets` is
 * docs/04a §7.13. `shops` and `media_assets` reference each other (cycle 1),
 * so this file then adds the logo and banner keys of docs/04a §6.1 to
 * `shops`, which file 5 created without them.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §7.13
    this.schema.raw(String.raw`
      CREATE TABLE media_assets (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        kind text NOT NULL,
        document_type text,
        status text NOT NULL DEFAULT 'pending_upload',
        original_key text NOT NULL,
        derived_keys jsonb,
        mime text NOT NULL,
        bytes int NOT NULL,
        upload_etag text,
        upload_bytes int,
        width int,
        height int,
        sha256 bytea,
        rejection_reason text,
        uploaded_by uuid NOT NULL,
        processed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT media_assets_pkey PRIMARY KEY (id),
        CONSTRAINT media_assets_id_shop_id_key UNIQUE (id, shop_id),
        CONSTRAINT media_assets_id_shop_id_kind_key UNIQUE (id, shop_id, kind),
        CONSTRAINT media_assets_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT media_assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT media_assets_kind_check
          CHECK (kind IN ('product_image','shop_logo','shop_banner','kyc_document')),
        CONSTRAINT media_assets_status_check
          CHECK (status IN ('pending_upload','processing','ready','rejected','deleted')),
        CONSTRAINT media_assets_mime_check CHECK (mime IN ('image/jpeg','image/png','image/webp','application/pdf') AND (mime <> 'application/pdf' OR kind = 'kyc_document')),
        CONSTRAINT media_assets_bytes_check CHECK (bytes BETWEEN 1 AND 10485760),
        CONSTRAINT media_assets_upload_bytes_check
          CHECK (upload_bytes IS NULL OR upload_bytes BETWEEN 1 AND 10485760),
        CONSTRAINT media_assets_upload_etag_check
          CHECK (upload_etag IS NULL OR char_length(upload_etag) BETWEEN 1 AND 128),
        CONSTRAINT media_assets_upload_check CHECK (status NOT IN ('processing','ready') OR (upload_etag IS NOT NULL AND upload_bytes IS NOT NULL)),
        CONSTRAINT media_assets_document_type_check CHECK ((kind = 'kyc_document') = (document_type IS NOT NULL) AND (document_type IS NULL OR document_type IN ('business_registration_certificate','pan_vat_certificate','owner_identity_document','other'))),
        CONSTRAINT media_assets_kyc_private_check CHECK (kind <> 'kyc_document' OR derived_keys IS NULL),
        CONSTRAINT media_assets_ready_check CHECK (status <> 'ready' OR (sha256 IS NOT NULL AND processed_at IS NOT NULL AND (kind = 'kyc_document' OR (derived_keys IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL)))),
        CONSTRAINT media_assets_rejected_check CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
        CONSTRAINT media_assets_sha256_check CHECK (sha256 IS NULL OR octet_length(sha256) = 32),
        CONSTRAINT media_assets_derived_keys_check
          CHECK (derived_keys IS NULL OR jsonb_typeof(derived_keys) = 'object')
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX media_assets_shop_kind_idx ON media_assets (shop_id, kind, created_at DESC);
      CREATE INDEX media_assets_cleanup_idx ON media_assets (created_at) WHERE status IN ('pending_upload','rejected')
    `)

    // docs/04 §2.2
    this.schema.raw(String.raw`
      CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE ON media_assets
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)

    // docs/04a §6.1, cycle 1 of docs/04 §20.2.2: nullable composite keys
    // (docs/04 §2.5), so another shop's image is refused and no logo is fine.
    this.schema.raw(String.raw`
      ALTER TABLE shops
        ADD CONSTRAINT shops_logo_media_fkey FOREIGN KEY (logo_media_id, id)
          REFERENCES media_assets (id, shop_id) ON DELETE RESTRICT,
        ADD CONSTRAINT shops_banner_media_fkey FOREIGN KEY (banner_media_id, id)
          REFERENCES media_assets (id, shop_id) ON DELETE RESTRICT
    `)
  }

  async down() {
    this.schema.raw(String.raw`ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_banner_media_fkey`)
    this.schema.raw(String.raw`ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_logo_media_fkey`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS media_assets`)
  }
}
