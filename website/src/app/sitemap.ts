import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/siteUrl';

/**
 * One entry: the landing page is a single document. Its sections are anchors on
 * that document, not separate URLs, and listing them would advertise pages that
 * do not exist.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
