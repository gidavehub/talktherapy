import "server-only";

/**
 * JSON replies for the payment routes, never cached.
 *
 * Same shape as `app/api/companion/validate.ts`'s `json` — a payment response
 * sitting in a CDN or a browser cache is a payment status that is quietly
 * wrong, so `no-store` is not optional here.
 */
export function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * The base URL the provider and the shopper's browser will come back to.
 *
 * `callback_url` has to be reachable from Modem Pay's servers, so it cannot be
 * derived from a request that arrived through a tunnel or an internal proxy
 * hostname — `APP_BASE_URL` is the deployment telling us its own public
 * address. The request's origin is only a convenience for `next dev`.
 */
export function appBaseUrl(req: Request): string {
  const configured = (process.env.APP_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(req.url).origin;
}
