import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Orbitron } from 'next/font/google';

import { SITE_URL } from '@/lib/siteUrl';
import '../styles/globals.css';

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700', '800', '900'],
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const TITLE = 'Crypto Pets — Collect, Battle & Breed On-Chain Pets';
const DESCRIPTION =
  'Collect, breed and battle NFT pets on Ethereum and Solana. Every battle settles from a committed seed and ships with a receipt anyone can replay.';

export const metadata: Metadata = {
  // Required for Next to resolve the relative URLs below into absolute ones.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · Crypto Pets',
  },
  description: DESCRIPTION,
  applicationName: 'Crypto Pets',
  keywords: [
    'NFT game',
    'on-chain game',
    'pet battler',
    'Ethereum',
    'Solana',
    'provably fair',
    'blockchain gaming',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Crypto Pets',
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

/* Runs before first paint. Reveal targets start hidden only once this class is
   present, so a blocked or failed bundle degrades to a fully visible page
   instead of a blank one below the fold. */
const REVEAL_GUARD = "document.documentElement.classList.add('js-reveal')";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${inter.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: REVEAL_GUARD }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
