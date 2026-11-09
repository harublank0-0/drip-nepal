import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { HttpError, StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = app.inProduction

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  // The v1 status pages were removed with the v1 store on the E4 baseline
  // branch; E5 rewrites this handler (docs/09 §5, docs/12 §4.1).
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {}

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    return super.handle(error, ctx)
  }

  /*
   * Without debug, the base handler still sends error.message as JSON. For an
   * unexpected error that can be a database or library message, so only
   * expected errors (4xx) keep their message (RF-36).
   */
  async renderErrorAsJSON(error: HttpError, ctx: HttpContext) {
    if (!this.debug && error.status >= 500) {
      ctx.response.status(error.status).send({ message: 'Something went wrong. Please try again.' })
      return
    }
    return super.renderErrorAsJSON(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
