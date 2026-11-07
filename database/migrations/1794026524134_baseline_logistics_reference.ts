import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 2 of 14 (docs/04 §20.2.2): the logistics reference tables.
 * They come before identity because `user_addresses` references them. The
 * rows come from reference seeders, never from a migration (docs/04 §20.3).
 * Tables and constraints are those of docs/04a §9.1 to §9.5 and §9.8.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §9.1
    this.schema.raw(String.raw`
      CREATE TABLE provinces (
        code text NOT NULL,
        name_en text NOT NULL,
        name_ne text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT provinces_pkey PRIMARY KEY (code),
        CONSTRAINT provinces_code_check CHECK (code ~ '^[1-7]$'),
        CONSTRAINT provinces_name_check
          CHECK (char_length(name_en) BETWEEN 2 AND 60 AND char_length(name_ne) BETWEEN 1 AND 60)
      )
    `)

    // docs/04a §9.2
    this.schema.raw(String.raw`
      CREATE TABLE districts (
        code text NOT NULL,
        province_code text NOT NULL,
        name_en text NOT NULL,
        name_ne text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT districts_pkey PRIMARY KEY (code),
        CONSTRAINT districts_code_check CHECK (code ~ '^[1-7][0-9]{2}$'),
        CONSTRAINT districts_code_prefix_check CHECK (left(code, 1) = province_code),
        CONSTRAINT districts_province_fkey FOREIGN KEY (province_code) REFERENCES provinces (code) ON DELETE RESTRICT,
        CONSTRAINT districts_code_province_code_key UNIQUE (code, province_code)
      )
    `)

    // docs/04a §9.3
    this.schema.raw(String.raw`
      CREATE TABLE local_levels (
        code text NOT NULL,
        district_code text NOT NULL,
        name_en text NOT NULL,
        name_ne text NOT NULL,
        type text NOT NULL,
        ward_count smallint NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT local_levels_pkey PRIMARY KEY (code),
        CONSTRAINT local_levels_code_check CHECK (code ~ '^[1-7][0-9]{4}$'),
        CONSTRAINT local_levels_code_prefix_check CHECK (left(code, 3) = district_code),
        CONSTRAINT local_levels_type_check
          CHECK (type IN ('metropolitan', 'sub_metropolitan', 'municipality', 'rural_municipality')),
        CONSTRAINT local_levels_ward_count_check CHECK (ward_count BETWEEN 1 AND 40),
        CONSTRAINT local_levels_district_fkey FOREIGN KEY (district_code) REFERENCES districts (code) ON DELETE RESTRICT,
        CONSTRAINT local_levels_code_district_code_key UNIQUE (code, district_code)
      )
    `)

    // docs/04a §9.4
    this.schema.raw(String.raw`
      CREATE TABLE delivery_zones (
        code text NOT NULL,
        name_en text NOT NULL,
        name_ne text,
        position smallint NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT delivery_zones_pkey PRIMARY KEY (code),
        CONSTRAINT delivery_zones_code_check CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$')
      )
    `)

    // docs/04a §9.5
    this.schema.raw(String.raw`
      CREATE TABLE delivery_zone_districts (
        zone_code text NOT NULL,
        district_code text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT delivery_zone_districts_pkey PRIMARY KEY (zone_code, district_code),
        CONSTRAINT delivery_zone_districts_district_key UNIQUE (district_code),
        CONSTRAINT delivery_zone_districts_zone_fkey FOREIGN KEY (zone_code)
          REFERENCES delivery_zones (code) ON DELETE RESTRICT,
        CONSTRAINT delivery_zone_districts_district_fkey FOREIGN KEY (district_code)
          REFERENCES districts (code) ON DELETE RESTRICT
      )
    `)

    // docs/04a §9.8 (OD-56). Nepal Can Move is a reference-seeder row (A-53).
    this.schema.raw(String.raw`
      CREATE TABLE logistics_providers (
        code text NOT NULL,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        capabilities jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT logistics_providers_pkey PRIMARY KEY (code),
        CONSTRAINT logistics_providers_code_check CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$'),
        CONSTRAINT logistics_providers_name_check CHECK (char_length(name) BETWEEN 2 AND 80),
        CONSTRAINT logistics_providers_capabilities_check CHECK (jsonb_typeof(capabilities) = 'object')
      )
    `)

    // docs/04 §2.2: one updated_at trigger per table that has the column.
    this.schema.raw(String.raw`
      CREATE TRIGGER provinces_set_updated_at BEFORE UPDATE ON provinces
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER districts_set_updated_at BEFORE UPDATE ON districts
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER local_levels_set_updated_at BEFORE UPDATE ON local_levels
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER delivery_zones_set_updated_at BEFORE UPDATE ON delivery_zones
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER logistics_providers_set_updated_at BEFORE UPDATE ON logistics_providers
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS logistics_providers`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS delivery_zone_districts`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS delivery_zones`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS local_levels`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS districts`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS provinces`)
  }
}
