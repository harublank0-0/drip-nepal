# ADR-0013: Media: direct-to-object-storage uploads, async processing, CDN delivery

Status: Draft v1 (2026-09-25)

## Status

| Field              | Value                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted.** The pattern is provider-neutral (S3 API). The storage provider and region follow ADR-0016 (Proposed; VX-09). |
| Date               | 2026-09-25                                                                                                                 |
| Deciders           | Lead developer                                                                                                             |
| Supersedes         | —                                                                                                                          |
| Superseded by      | —                                                                                                                          |
| Related open items | VX-09 (data location, especially KYC documents), VX-15 (storage and CDN prices), OD-16 (which KYC documents are required)  |

## Context

**Repository findings** [Verified-repo]:

- The vendor `ImageUpload` reads files with `FileReader.readAsDataURL`, accepts `image/*` including SVG, and has no size limit (`image-upload.tsx:28-36,74`). The server validator allows 2 MB and has an `'jped'` typo (RF-18, audit A3-14).
- `product_media` stores a 255-char URL, a text `sort_order` (so "10" sorts before "2") and no storage key or owner (audit F15).
- Multipart parsing runs on every route with a 20 MB limit before authentication (RF-35).
- Committed demo images are up to 6000×3376 px (2.8 MB), and no `<img>` sets width/height or `srcset` (RF-30).

**Operating constraints.** Vendors photograph products on phones and upload over mobile connections. A 5–10 MB upload through the single VPS (ADR-0016) ties up a web connection and memory for the whole transfer.

**Image-processing security** [Verified-doc, accessed 2026-09-25]:

- sharp before 0.35.4 has high-severity libheif/libvips advisories (GHSA-rgj7-g3m4-5g8c, GHSA-f88m-g3jw-g9cj, https://github.com/lovell/sharp/security/advisories).
- `limitInputPixels` defaults to about 268 MP, far too large for a small VM. The docs advise keeping `failOn: 'warning'` for untrusted input (https://sharp.pixelplumbing.com/api-constructor).
- `VIPS_BLOCK_UNTRUSTED` blocks untrusted loaders (https://sharp.pixelplumbing.com/api-utility).
- The libvips checklist advises sanity-checking dimensions before decoding, and warns that interlaced images "hugely increase memory use" (https://www.libvips.org/API/8.17/developer-checklist.html).
- On glibc Linux, sharp's concurrency defaults to 1.

**Storage and delivery** [Verified-doc, accessed 2026-09-25]:

- @adonisjs/drive 4.0.0 supports S3-compatible services including R2 and Spaces, with `getSignedUploadUrl` and `getSignedUrl` (https://docs.adonisjs.com/guides/digging-deeper/drive).
- R2 egress is free. `r2.dev` public access "is rate-limited and should only be used for development purposes"; custom domains enable Cloudflare cache and WAF (https://developers.cloudflare.com/r2/buckets/public-buckets/).
- Cloudflare Images' free plan allows 5,000 unique transformations per month, as published on 2026-09-25 (https://developers.cloudflare.com/images/pricing/).

**Privacy.** Phone photos carry EXIF GPS coordinates, often of a home-based vendor's address. KYC documents (FR-SHOP-014) are sensitive personal data [Verify-external VX-03].

## Decision

1. **Uploads never pass through app servers.** Multipart auto-processing is disabled globally in M0 (RF-35). No R1 endpoint accepts file bytes.
2. **Upload flow** (seller API, [docs/06](../06-api-design.md)):
   1. `createMediaUpload` (`kind`, `mime`, `bytes`) checks permission, then validates the declared type (JPEG, PNG or WebP) and size (≤ 10 MB). It inserts `media_assets(status = pending_upload, original_key = originals/{shop_id}/{asset_id})`.
   2. It returns a presigned PUT URL for the **private** bucket, valid 10 minutes, bound to the content type (and length where the provider supports it). Rate limit: 120 per hour per shop.
   3. The browser uploads directly to storage. The client may downscale to at most 2560 px before upload to save mobile data (a UX optimisation, not a security control).
   4. `completeMediaUpload` sets `status = processing` and sends `media.process` transactionally (ADR-0010).
3. **Worker processing** (`media.process`, concurrency 1, `VIPS_BLOCK_UNTRUSTED=1` in the worker container, sharp ≥ 0.35.4 pinned):
   1. HEAD the object and reject it if it exceeds 10 MB.
   2. Read header metadata only. Reject if the magic-byte format is not JPEG, PNG or WebP (no SVG, no HEIC/HEIF in R1), if width × height exceeds 40 MP, or if the image is interlaced and over 12 MP [Assumption].
   3. Decode with `limitInputPixels: 40_000_000` and `failOn: 'warning'`. Auto-orient, convert to sRGB, then strip all metadata (EXIF, GPS, XMP, embedded profiles).
   4. Write fixed derivative widths **320, 640, 960, 1440** as WebP to the **public** bucket at `products/{asset_id}/{width}.webp`. Keys are immutable, so a replacement image gets a new asset ID.
   5. Store `derived_keys`, dimensions and `sha256`, then set `status = ready`. Any rejection sets `rejected` with a reason shown to the vendor.
4. **Delivery.** The public bucket sits behind the CDN on a custom domain (`media.<site-domain>`), with `Cache-Control: public, max-age=31536000, immutable`. Pages emit `srcset`/`sizes` and explicit width and height. `r2.dev` URLs are never used in production.
5. **KYC documents** (`kind = kyc_document`) stay in the private bucket. They are never derived or public, and are viewable only through short-lived (5 min) signed GET URLs issued to staff with `platform.shops.review`. Every view is audit-logged.
6. **Housekeeping.** Assets left in `pending_upload` for more than 24 h are deleted from storage and marked `deleted` by `platform.purge`. Deleting product media soft-deletes the row and removes the public derivatives after 30 days [Assumption].
7. **Storage access** goes only through @adonisjs/drive disks (`private`, `public`). Local development uses the `fs` driver or a MinIO container, so switching provider (R2, Spaces, S3, or a Nepal provider under VX-09) is configuration only.

## Alternatives considered

| Alternative                                            | Why rejected                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload through the app (multipart to `web`)            | Holds a web connection and memory for the whole slow upload on a 1–2 vCPU VPS. Re-opens RF-35's pre-auth parsing risk.                       |
| Process synchronously in the request                   | sharp CPU spikes would stall storefront SSR on the same `web` process.                                                                       |
| Store images in PostgreSQL (`bytea`)                   | Inflates the database, backups and restore time (ADR-0016 RTO), and every image read goes through Node.                                      |
| Cloudflare Images as the primary store and transformer | Per-image storage and delivery pricing, and lock-in to one vendor's API. On-the-fly transformation of R2 originals remains a revisit option. |
| Client-side resize as the only processing              | The client is untrusted. It cannot be relied on to strip EXIF or reject malformed files.                                                     |

## Consequences

**Positive**

- Web processes never handle upload bytes, so slow vendor uploads cannot degrade checkout.
- EXIF location data never becomes public. Malformed or oversized images are rejected in an isolated worker with a pinned, patched sharp.
- The fixed derivative set keeps storage and CDN behaviour predictable, and immutable keys make caching trivial.

**Negative**

- Upload is two steps and the UI shows a "processing" state. Bucket CORS must allow the site origin for PUT.
- New derivative widths need a backfill job.

**Risks**

- _Presigned URL abuse_ (uploading junk or large files). Mitigation: size-bound URLs, per-shop rate limit, orphan purge, and no public read on the private bucket.
- _libvips/libheif CVEs._ Mitigation: Renovate or Dependabot alerts; HEIC is not accepted in R1.
- _VX-09_ may require KYC documents or all media to be stored in Nepal. Mitigation: a Drive disk swap.

## When to revisit

- Processing queue p95 above 60 s, or derivative storage above 250 GB. Consider edge transformation (Cloudflare Images or Bunny Optimizer, prices to reconfirm under VX-15).
- Vendors need HEIC support: most requests arriving as rejected HEIC files.
- Video or social embeds (R3, FR-MED-004).
- VX-09 or OD-16 changes where KYC documents may live.

## Verification

- **T-MED suite** ([docs/10](../10-testing-and-quality-gates.md)):
  - an SVG or a polyglot file renamed `.jpg` is rejected by magic bytes;
  - a 50 MP "decompression bomb" is rejected before decode;
  - output derivatives contain no EXIF/GPS (checked with sharp metadata);
  - orphaned `pending_upload` assets are purged;
  - KYC signed URLs expire and every issuance writes an audit row.
- **T-SEC-001**: referencing another shop's `mediaAssetId` in `replaceProductMedia` returns 404.
- **Route check**: no route accepts `multipart/form-data`; a request with multipart content gets 415 or 413.
- **Dependency gate**: the CI audit fails if sharp is below 0.35.4.

## Related

- [Architecture (worker, storage)](../03-system-architecture.md)
- [Security and privacy (KYC, EXIF)](../07-security-threat-model-and-permissions.md)
- [Deployment and operations (buckets, CDN)](../11-deployment-and-operations.md)
- ADR-0010 (jobs), ADR-0016 (hosting), ADR-0006 (tenant checks)
