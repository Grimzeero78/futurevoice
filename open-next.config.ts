import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Future Voices on Cloudflare.
 *
 * No incremental cache is configured on purpose: every route is dynamic
 * (auth, database, media gateway) and the app uses no ISR — so the default
 * no-op cache is exactly right, and no extra KV/R2 binding is needed for
 * caching. Media bytes live in the UPLOADS R2 bucket, not the cache.
 */
export default defineCloudflareConfig();
