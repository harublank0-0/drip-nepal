import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 1 of 14 (docs/04 §20.2.2, ADR-0011): the extensions and the
 * three trigger functions every later file uses. Functions use CREATE OR
 * REPLACE and extensions IF NOT EXISTS, because `migration:fresh` drops
 * tables but not functions or extensions (docs/04 §20.2.2).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    this.schema.raw(String.raw`CREATE EXTENSION IF NOT EXISTS citext`)
    this.schema.raw(String.raw`CREATE EXTENSION IF NOT EXISTS pg_trgm`)

    // docs/04 §2.2: keeps updated_at right for query-builder updates too.
    this.schema.raw(String.raw`
      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at := now();
        RETURN NEW;
      END $$
    `)

    // docs/04 §2.12: append-only tables. The retention exemption is proposed
    // (docs/07 §4.10, OD-51); the triggers that use it are in file 14.
    this.schema.raw(String.raw`
      CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        -- Retention exemption (proposed, 07 §4.10): only the migrator, only inside a data:retention batch
        IF TG_LEVEL = 'ROW' AND current_user = 'dripnepal_migrator'
           AND current_setting('dripnepal.retention_purge', true) = 'on' THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'support_case_messages'
                AND (to_jsonb(NEW) - 'body') = (to_jsonb(OLD) - 'body') THEN
            RETURN NEW;   -- the complaint redaction of §19.3 changes only body
          END IF;
        END IF;
        RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
      END $$
    `)

    // docs/04 §16.3 (INV-08): rejects an UPDATE that changes any column not
    // named in the trigger arguments.
    this.schema.raw(String.raw`
      CREATE OR REPLACE FUNCTION allow_only_columns() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
          RAISE EXCEPTION 'on % only % may change', TG_TABLE_NAME, TG_ARGV USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP FUNCTION IF EXISTS allow_only_columns()`)
    this.schema.raw(String.raw`DROP FUNCTION IF EXISTS forbid_mutation()`)
    this.schema.raw(String.raw`DROP FUNCTION IF EXISTS set_updated_at()`)
  }
}
