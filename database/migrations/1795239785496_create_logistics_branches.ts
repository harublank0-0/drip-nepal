import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * M6 (docs/04a §9.12, OD-56): a courier's branches, written only by the
 * `logistics.sync_branches` job. A shipment names its origin and destination
 * branches (the next migration), and a branch is never deleted.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)
    this.schema.raw(String.raw`
      CREATE TABLE logistics_branches (
        id uuid NOT NULL DEFAULT uuidv7(),
        provider_code text NOT NULL,
        name text NOT NULL,
        external_branch_id text,
        code text,
        courier_district text,
        district_code text,
        covered_areas text,
        phone text,
        is_active boolean NOT NULL DEFAULT true,
        synced_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT logistics_branches_pkey PRIMARY KEY (id),
        CONSTRAINT logistics_branches_name_key UNIQUE (provider_code, name),
        CONSTRAINT logistics_branches_external_id_key UNIQUE (provider_code, external_branch_id),
        CONSTRAINT logistics_branches_code_key UNIQUE (provider_code, code),
        CONSTRAINT logistics_branches_provider_fkey FOREIGN KEY (provider_code)
          REFERENCES logistics_providers (code) ON DELETE RESTRICT,
        CONSTRAINT logistics_branches_district_fkey FOREIGN KEY (district_code)
          REFERENCES districts (code) ON DELETE RESTRICT,
        CONSTRAINT logistics_branches_name_check CHECK (char_length(name) BETWEEN 2 AND 80),
        CONSTRAINT logistics_branches_external_id_check
          CHECK (external_branch_id IS NULL OR char_length(external_branch_id) BETWEEN 1 AND 40),
        CONSTRAINT logistics_branches_code_check CHECK (code IS NULL OR char_length(code) BETWEEN 1 AND 20),
        CONSTRAINT logistics_branches_courier_district_check
          CHECK (courier_district IS NULL OR char_length(courier_district) BETWEEN 1 AND 80),
        CONSTRAINT logistics_branches_covered_areas_check
          CHECK (covered_areas IS NULL OR char_length(covered_areas) <= 2000),
        CONSTRAINT logistics_branches_phone_check CHECK (phone IS NULL OR char_length(phone) BETWEEN 3 AND 40)
      );
      CREATE INDEX logistics_branches_district_idx ON logistics_branches (provider_code, district_code)
        WHERE is_active;
      CREATE TRIGGER logistics_branches_set_updated_at BEFORE UPDATE ON logistics_branches
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS logistics_branches`)
  }
}
