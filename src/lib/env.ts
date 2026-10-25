/**
 * Environment access that works identically on two runtimes:
 *
 *  1. Self-hosted Node (Windows/Linux/Docker): plain `process.env`.
 *  2. Cloudflare Workers: secrets and vars live on the worker `env`
 *     binding; OpenNext exposes it through getCloudflareContext().env
 *     (process.env is only populated for build-time values there).
 *
 * Everything that reads configuration at request time goes through here,
 * so the same code serves both deployments.
 */

type CfEnv = Record<string, string | undefined>

let cachedCfEnv: CfEnv | null = null
let cfEnvTried = false

function cfEnv(): CfEnv | null {
  if (cfEnvTried) return cachedCfEnv
  cfEnvTried = true
  try {
    // Throws on plain Node — that is expected and fine.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@opennextjs/cloudflare') as {
      getCloudflareContext?: () => { env?: CfEnv }
    }
    cachedCfEnv = mod.getCloudflareContext?.().env ?? null
  } catch {
    cachedCfEnv = null
  }
  return cachedCfEnv
}

/** Read one variable from either runtime. */
export function env(key: string): string | undefined {
  const fromProcess = process.env[key]
  if (fromProcess !== undefined && fromProcess !== '') return fromProcess
  return cfEnv()?.[key]
}

/** True when running on Cloudflare Workers (a D1 binding exists). */
export function onCloudflare(): boolean {
  return !!cfEnv()?.DB
}
