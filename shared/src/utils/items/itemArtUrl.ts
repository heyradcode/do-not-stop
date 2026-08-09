/**
 * URLs for an item's art on the image service (roadmap §4).
 *
 * `serviceUrl` is passed in rather than read from the environment, for the same reason
 * `petArtUrl` takes it: the web app reads `VITE_IMAGE_SERVICE_URL` from `import.meta.env`
 * and mobile reads `IMAGE_SERVICE_URL` from `@env`. Keeping the environment read at the edge
 * leaves these pure functions both platforms share, so the route shape is written down once.
 *
 * No chain segment, unlike a pet. An item's token id *is* its type and the catalog is the
 * same everywhere, so one id addresses it on every deployment.
 *
 * Decimal ids on purpose. The service also accepts the 64-character zero-padded hex an
 * ERC-1155 wallet substitutes into `uri()`, but nothing in the app has the id in that form —
 * the catalog, the database and the GraphQL layer all speak decimal.
 */

const base = (serviceUrl: string): string => serviceUrl.replace(/\/+$/, '');

/**
 * The painted art: generated once by Workers AI, then served from cache forever.
 *
 * Null when no service is configured, which is the deliberate "art is optional" state — the
 * same one that leaves pets showing their emoji avatar. A caller must handle it rather than
 * assume a string.
 */
export const itemArtUrl = (itemType: string, serviceUrl: string | undefined): string | null =>
    serviceUrl ? `${base(serviceUrl)}/items/${itemType}.png` : null;

/**
 * The deterministic fallback: drawn from the catalog entry alone, so it needs no model, no
 * store and no credentials, and cannot 404 for an item that exists.
 *
 * Worth having as a distinct URL because the painted art has a real cold state. The first
 * request for an unwarmed item triggers a generation and can take seconds, and a deployment
 * with no Cloudflare credentials never has one at all; in both cases this still draws
 * something recognisable rather than a broken tile.
 */
export const itemFallbackArtUrl = (itemType: string, serviceUrl: string | undefined): string | null =>
    serviceUrl ? `${base(serviceUrl)}/items/${itemType}.svg` : null;
