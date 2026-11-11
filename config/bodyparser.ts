import { defineConfig } from '@adonisjs/core/bodyparser'

const bodyParserConfig = defineConfig({
  /**
   * Parse request bodies for these HTTP methods.
   * Keep this aligned with methods that receive payloads in your routes.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Config for the "application/x-www-form-urlencoded"
   * content-type parser.
   */
  form: {
    // The JSON limit: no body larger than the largest operation's is read (docs/06 §9.2).
    limit: '512kb',

    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Content types handled by the form parser.
     */
    types: ['application/x-www-form-urlencoded'],
  },

  /*
   * The text parser (`text/*`), with the same limit. The package default
   * would read 1 MB before request_body_middleware.ts could refuse it.
   */
  raw: {
    limit: '512kb',
    types: ['text/*'],
  },

  /**
   * Config for the JSON parser.
   */
  json: {
    /*
     * The largest JSON body any operation accepts (the catalog writes,
     * docs/06 §9.2). Most routes allow 256 KB, which
     * app/middleware/request_body_middleware.ts checks after parsing. The
     * form and text parsers have the same limit.
     */
    limit: '512kb',

    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Content types handled by the JSON parser.
     */
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  /*
   * Multipart is never parsed (RF-35, ADR-0013): images go straight to
   * object storage, and no R1 operation accepts file bytes. The parser only
   * marks the request as multipart; app/middleware/request_body_middleware.ts
   * then refuses it on every route (docs/06 §9.2, T-MED-002).
   */
  multipart: {
    autoProcess: false,
    convertEmptyStringsToNull: true,
    processManually: [],
    limit: '1mb',
    types: ['multipart/form-data'],
  },
})

export default bodyParserConfig
