/**
 * Shared LIVE-PREVIEW OAuth client (server-only. NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL, which can't be pre-registered per app. The broker exposes one shared
 * preview client that accepts any
 * `https://*.grok-sandbox.com/api/auth/oauth2/callback/*`
 * (broker: `app-builder-deployer/auth/src/preview-oauth.ts`). When deployed, the
 * deployer injects a per-app `GROK_AUTH_*` that overrides these (see `server.ts`).
 *
 * The client id is public and matches the broker's `GROK_PREVIEW_CLIENT_ID`.
 * The client secret is not committed. Set `GROK_PREVIEW_CLIENT_SECRET` to the
 * broker's preview client secret. There is no fallback value in this repo.
 * The broker stores only that secret's `base64url(SHA-256)` hash.
 */
function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

export const PREVIEW_CLIENT_ID = "grok_preview";

/** From `GROK_PREVIEW_CLIENT_SECRET`. Undefined when that variable is unset. */
export const PREVIEW_CLIENT_SECRET = readEnv("GROK_PREVIEW_CLIENT_SECRET");

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
