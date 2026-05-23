import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Orbitron } from 'next/font/google';

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

export const metadata: Metadata = {
  title: 'Crypto Pets',
  description: 'Collect, battle and breed unique on-chain pets in the ultimate Crypto Pets adventure.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
