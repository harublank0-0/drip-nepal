# ADR-0013: Media: direct-to-object-storage uploads, async processing, CDN delivery

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.3 (2026-09-25)

## Status

| Field              | Value                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted.** The pattern is provider-neutral (S3 API). The storage provider and region follow ADR-0016 (Proposed; VX-09, OD-09).     |
| Date               | 2026-09-25                                                                                                                            |
| Deciders           | Lead developer                                                                                                                        |
| Supersedes         | —                                                                                                                                     |
| Superseded by      | —                                                                                                                                     |
| Related open items | VX-09 (data location, especially KYC documents), VX-15 (storage and CDN prices), OD-16 (which KYC documents are required), A-31, R-20 |

## Context

**Repository findings** [Verified-repo, [00](../00-context-assumptions-and-questions.md)]:

- RF-18: the vendor `ImageUpload` reads files as base64 data URLs, accepts any `image/*` including SVG with no size limit, and `product_media` stores a 255-character URL with a text sort order and no storage key (audit F15, A3-14).
- RF-35: multipart bodies up to 20 MB are parsed on every route before authentication.
- RF-30: committed demo images reach 2.8 MB, and about 5 MB of images load on a first visit.

**Operating constraints.** Vendors photograph products on phones and upload over slow mobile links. A 5–10 MB upload through the single VPS (ADR-0016) would hold a web connection and memory for the whole transfer. Buyers pay for mobile data (NFR-PERF-001).

**Image-processing facts** [Verified-doc, accessed 2026-09-25]:

- sharp before 0.35.4 has high-severity libheif and libvips advisories GHSA-rgj7-g3m4-5g8c and GHSA-f88m-g3jw-g9cj (<https://github.com/lovell/sharp/security/advisories>).
- `limitInputPixels` defaults to about 268 MP, and the docs advise keeping `failOn: 'warning'` for untrusted input (<https://sharp.pixelplumbing.com/api-constructor>). `VIPS_BLOCK_UNTRUSTED` blocks untrusted loaders, and sharp's concurrency defaults to 1 on glibc Linux (<https://sharp.pixelplumbing.com/api-utility>).
- The libvips checklist advises checking dimensions before decoding and warns that interlaced images "hugely increase memory use" (<https://www.libvips.org/API/8.17/developer-checklist.html>).

**Storage and delivery facts** [Verified-doc, accessed 2026-09-25]:

- @adonisjs/drive 4.0.0 supports S3-compatible services, including R2, with `getSignedUploadUrl` and `getSignedUrl` (<https://docs.adonisjs.com/guides/digging-deeper/drive>).
- R2 `r2.dev` access "is rate-limited and should only be used for development purposes"; a custom domain enables Cloudflare cache and WAF (<https://developers.cloudflare.com/r2/buckets/public-buckets/>).
- The Cloudflare Images free plan allows 5,000 unique transformations a month, as published on 2026-09-25 (<https://developers.cloudflare.com/images/pricing/>).

**Privacy.** Phone photos carry EXIF GPS, often the home address of a home-based vendor. KYC documents (FR-SHOP-014) are sensitive personal data [Verify-external VX-03].

## Decision

The flow and bucket layout are owned by [03 §7.5](../03-system-architecture.md#75-media-upload-pipeline-j-10-fr-med-001-adr-0013) and [03 §3.5](../03-system-architecture.md#35-object-storage-layout); the table by [04a §7.13](../04a-data-dictionary-tables.md#713-media_assets).

1. **Upload bytes never pass through the web process.** Multipart parsing is disabled globally in M0 (RF-35), and no R1 endpoint accepts file bytes.
2. **Presigned upload.**
   - `createMediaUpload` (`kind`, `mime`, `bytes`) checks `shop.products.edit`, the MIME allow-list (JPEG, PNG, WebP; PDF only for `kind = kyc_document`, A-31) and size ≤ 10 MB, and is rate-limited to 120 per hour per shop. It inserts `media_assets` with `status = pending_upload` and `original_key = originals/<shop_id>/<id>`.
   - It returns a presigned PUT URL for the **private** bucket, valid 10 minutes (03 §3.5).
   - The browser uploads directly. Client-side downscaling saves data but is not a security control.
   - `completeMediaUpload` runs `HEAD` on the object (presence and ≤ 10 MB, because binding `Content-Length` in the presigned URL is unverified), then compare-and-sets `pending_upload` → `processing` and sends `media.process_upload` in the same transaction (ADR-0010).
3. **Worker processing** (`media.process_upload`: one image at a time, `VIPS_BLOCK_UNTRUSTED=1`, sharp ≥ 0.35.4 pinned):
   - Read header metadata only. Reject if the magic bytes disagree with the allow-list (no SVG, no HEIC/HEIF in R1), if the image exceeds 40 MP, or if it is interlaced and over 12 MP [Assumption].
   - Decode with `limitInputPixels: 40_000_000` and `failOn: 'warning'`; auto-orient, convert to sRGB, strip all metadata (EXIF, GPS, XMP).
   - Write WebP derivatives at the widths in AC-FR-MED-001-2 to the **public** bucket under content-addressed keys `p/<media_asset_id>/<sha256-prefix>-<width>.webp`, never overwritten.
   - Store `derived_keys`, `width`, `height` and `sha256`, set `ready` and emit `media.ready` (which triggers `catalog.refresh_listing`). A rejection sets `rejected` with a `rejection_reason` shown to the vendor and deletes the original.
4. **Delivery.** The public bucket is served from `media.<domain>` behind Cloudflare with `Cache-Control: public, max-age=31536000, immutable`. Pages emit `srcset`/`sizes` and explicit dimensions. `r2.dev` is never used in production.
5. **KYC documents** get no derivatives (`media_assets_kyc_private_check`), stay in the private bucket, and are viewable only by staff with `platform.shops.review` through a 5-minute presigned GET; every issuance is audit-logged (AC-FR-SHOP-014-2).
6. **Housekeeping.** `media.cleanup_abandoned` (daily 02:45, 03 §9) deletes `pending_upload` assets older than 24 h and originals of rejected assets, marking them `deleted`. Derived public images are not deleted in R1, because order snapshots may point at them (04a §7.13).
7. **Storage access** goes only through @adonisjs/drive disks (`private`, `public`). Development and CI use MinIO, so changing provider (R2, Spaces, or a Nepal provider under VX-09) is configuration only.

## Alternatives considered

| Alternative                                            | Why rejected                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Upload through the app (multipart to `web`)            | Holds a web connection and memory for the whole slow upload on a 2 vCPU host. Re-opens RF-35's pre-auth parsing risk.                     |
| Process synchronously in the request                   | sharp CPU spikes would stall storefront SSR on the same `web` process.                                                                    |
| Store images in PostgreSQL (`bytea`)                   | Inflates the database, backups and restore time (NFR-AVAIL-002), and every image read goes through Node.                                  |
| Cloudflare Images as the primary store and transformer | Per-image pricing and one vendor's API; the free plan's 5,000 transformations a month is a hard ceiling (R-20). Kept as a revisit option. |
| Client-side resize as the only processing              | The client is untrusted. It cannot be relied on to strip EXIF or reject malformed files.                                                  |

## Consequences

**Positive**

- Web processes never handle upload bytes, so slow vendor uploads cannot degrade checkout.
- EXIF location data never becomes public, and malformed or oversized images are rejected in the worker by a pinned, patched sharp.
- Content-addressed keys need no CDN purges, and the fixed derivative set keeps storage predictable.

**Negative**

- Upload is two steps and the UI shows a "processing" state. Bucket CORS must allow the site origin for PUT.
- A new derivative width needs a backfill job.

**Risks**

- _Presigned URL abuse_ (junk or oversized uploads). Mitigation: the `HEAD` size check, per-shop rate limit, daily cleanup, and no public read on the private bucket.
- _libvips/libheif CVEs._ Mitigation: dependency alerts, the sharp version gate, and no HEIC in R1.
- _VX-09_ may require KYC documents, or all media, to be stored in Nepal. Mitigation: a Drive disk change.

## When to revisit

- Processing misses AC-FR-MED-001-3 (95 % ready within 60 s) for a week, or derivative storage exceeds 250 GB [Assumption]: consider edge transformation, with prices re-read under VX-15.
- More than 10 % of rejected uploads are HEIC [Assumption]: reconsider HEIC with a patched libheif.
- Video or social embeds (FR-MED-004, R3).
- VX-09 or OD-16 changes where KYC documents may live.

## Verification

- **T-MED-001 (proposed)**: an SVG or a polyglot renamed `.jpg` is rejected by magic bytes; a 50 MP decompression bomb is rejected before decode; derivatives carry no EXIF or GPS; oversized objects fail the `HEAD` check.
- **T-MED-103 (proposed)**: no code path produces a public key for a `kyc_document`; KYC signed URLs expire and each issuance writes an audit row.
- **Cleanup test (proposed)**: `pending_upload` assets older than 24 h are purged and marked `deleted`.
- **T-SEC-001**: referencing another shop's `mediaAssetId` in `replaceProductMedia` returns 404.
- **CI checks**: a route test proves a `multipart/form-data` body is refused on every route; the dependency audit fails if sharp is below 0.35.4.

## Related

- [03 §7.5 media upload pipeline](../03-system-architecture.md#75-media-upload-pipeline-j-10-fr-med-001-adr-0013), [03 §3.5 object storage layout](../03-system-architecture.md#35-object-storage-layout), [03 §9 jobs](../03-system-architecture.md#9-asynchronous-work)
- [04a §7.13 `media_assets`](../04a-data-dictionary-tables.md#713-media_assets)
- [01 FR-MED-001](../01-product-requirements.md#fr-med-001-direct-upload-validation-exif-stripping-and-derivatives)
- [Security and privacy](../07-security-threat-model-and-permissions.md), [Deployment and operations](../11-deployment-and-operations.md)
- [ADR-0006](0006-authorization-platform-roles-shop-memberships.md) (tenant checks), [ADR-0010](0010-postgres-jobs-pg-boss-transactional-send.md) (jobs), [ADR-0016](0016-hosting-single-region-portable.md) (hosting)
