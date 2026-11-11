import env from '#start/env'

/*
 * Which deployment and which build this process is, for log lines, the
 * tracker's tags and /health/live (docs/09 §5.6, §7.1). Staging and
 * production both run NODE_ENV=production; APP_ENV tells them apart.
 */
export const runtime = {
  appEnv: env.get('APP_ENV'),
  release: env.get('APP_RELEASE') ?? null,
}
