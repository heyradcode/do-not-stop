/**
 * Canonical origin of this marketing site.
 *
 * Deliberately separate from `NEXT_PUBLIC_APP_URL`, which points at the playable
 * app on a different domain. Using that one here would emit canonical, sitemap
 * and Open Graph URLs pointing at the app, telling crawlers the landing page
 * lives somewhere it does not.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002';
