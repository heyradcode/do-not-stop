import { ImageResponse } from 'next/og';

export const alt = 'Crypto Pets — collect, battle and breed on-chain pets';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Generated at build time rather than checked in as a binary, so the card cannot
 * drift out of sync with the copy it quotes.
 *
 * Satori (which renders this) supports only a subset of CSS: flexbox but not
 * grid, and no `background-clip: text`. The neon gradient the page uses on its
 * headline is therefore approximated here with solid accent colours and a
 * gradient rule, rather than gradient-filled type.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          backgroundColor: '#050812',
          backgroundImage:
            'radial-gradient(900px circle at 15% 0%, rgba(155,100,255,0.30), transparent 55%), radial-gradient(760px circle at 92% 96%, rgba(41,168,255,0.24), transparent 55%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              backgroundColor: '#6cf6c5',
            }}
          />
          <div
            style={{
              fontSize: 24,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: '#b6e2ff',
            }}
          >
            On-Chain Pet Battler
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1,
              color: '#f6f3ff',
            }}
          >
            Collect, Battle &amp; Breed
          </div>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1,
              color: '#b58cff',
            }}
          >
            Your Dream Pets
          </div>
          <div
            style={{
              width: 220,
              height: 5,
              marginTop: 28,
              borderRadius: 4,
              backgroundImage: 'linear-gradient(90deg, #7dd6ff, #b58cff 60%, #ff7bcb)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ fontSize: 30, color: 'rgba(195,210,255,0.82)', maxWidth: 720 }}>
            Every battle settles from a committed seed, with a receipt anyone can replay.
          </div>
          <div style={{ fontSize: 26, color: '#7dd6ff', letterSpacing: 2 }}>
            Ethereum · Solana
          </div>
        </div>
      </div>
    ),
    size,
  );
}
