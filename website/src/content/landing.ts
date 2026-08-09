export type FeatureCard = {
  title: string;
  text: string;
  iconImage?: string;
};

export type Pet = {
  name: string;
  level: number;
  rarity: 'Legendary' | 'Epic' | 'Rare';
  image: string;
};

export type CommunityCard = {
  name: string;
  blurb: string;
  color: 'discord' | 'twitter' | 'telegram' | 'youtube';
  href?: string;
};

export type Step = {
  number: string;
  title: string;
  text: string;
};

export type RoadmapItem = {
  /** Build-order label, not a date. The project ships in phases, not quarters. */
  phase: string;
  title: string;
  status: 'shipped' | 'in-progress' | 'planned';
  bullets: string[];
};

export type RarityTier = {
  name: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  share: string;
  blurb: string;
  tone: 'silver' | 'cyan' | 'violet' | 'gold';
};

export type Faq = {
  question: string;
  answer: string;
};

export type ProofPoint = {
  step: string;
  title: string;
  text: string;
};

export type Backer = { name: string };

export type NavLink = { label: string; href: string; external?: boolean };

export type SectionCopy = {
  title: string;
  subtitle: string;
};

export type Stat = {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
};

/**
 * Icons are the interaction glyphs, not item art: each one names the action the
 * card describes. Item renders were tried here and read as inventory loot rather
 * than as a capability.
 */
export const FEATURES: FeatureCard[] = [
  { title: 'Breed and Marry', text: 'Pair two pets to pass traits down a bloodline, or marry a partner pet and unlock a private thread only the two owners can read.', iconImage: '/images/icons/interaction/breed.png' },
  { title: 'Battle for Rank', text: 'Both owners sign in before a fight. It settles from a seed committed in advance, and the result is signed and anchored on chain.', iconImage: '/images/icons/interaction/battle.png' },
  { title: 'Train and Equip', text: 'Level up, train stats, rename, and equip ERC-1155 gear that is escrowed on chain for as long as your pet wears it.', iconImage: '/images/icons/interaction/levelup.png' },
  { title: 'Own and Trade', text: 'Pets are NFTs in your own wallet on Ethereum or Solana. Transfer them, trade them, or walk away with them.', iconImage: '/images/icons/interaction/trading.png' },
];

/**
 * Real output from `services/image-generator`, not stock art: each render was
 * produced by the same pipeline that draws a player's pet from its DNA. The
 * showcase therefore shows the actual house style rather than approximating it.
 *
 * Species and element come from each render's manifest (body archetype and
 * element wheel in `image-generator/src/traits.ts`). The rarity labels are
 * ordered so the badge matches the aura tier baked into the art — the generator
 * draws rarity 3 with a glowing aura, 2 with a rim light and 1 matte.
 */
export const PETS: Pet[] = [
  { name: 'Nova Brute', level: 94, rarity: 'Legendary', image: '/images/pets/nova-brute.png' },
  { name: 'Starlit Prowler', level: 88, rarity: 'Legendary', image: '/images/pets/starlit-prowler.png' },
  { name: 'Ember Oracle', level: 71, rarity: 'Epic', image: '/images/pets/ember-oracle.png' },
  { name: 'Tidefang', level: 66, rarity: 'Epic', image: '/images/pets/tidefang.png' },
  { name: 'Cinder Streak', level: 42, rarity: 'Rare', image: '/images/pets/cinder-streak.png' },
  { name: 'Umbral Bulwark', level: 37, rarity: 'Rare', image: '/images/pets/umbral-bulwark.png' },
];

/* Channel URLs are intentionally absent rather than guessed — see README. */
export const COMMUNITIES: CommunityCard[] = [
  { name: 'Discord', blurb: 'Strategy and tournaments', color: 'discord' },
  { name: 'Twitter', blurb: 'Drops and patch notes', color: 'twitter' },
  { name: 'Telegram', blurb: 'Trades and quick calls', color: 'telegram' },
  { name: 'YouTube', blurb: 'Guides and battle replays', color: 'youtube' },
];

export const STEPS: Step[] = [
  { number: '01', title: 'Connect', text: 'Bring the wallet you already have. MetaMask on Ethereum, Phantom on Solana — the same game runs on both.' },
  { number: '02', title: 'Hatch', text: 'Mint a starter pet. Its traits come from on-chain randomness, not a number we picked for you.' },
  { number: '03', title: 'Raise', text: 'Level up, train stats, equip gear, breed new bloodlines, and marry a partner pet.' },
  { number: '04', title: 'Battle', text: 'Both owners opt in, the fight settles from a public beacon round, and you keep the receipt.' },
];

export const ROADMAP: RoadmapItem[] = [
  { phase: '01', title: 'Foundation', status: 'shipped', bullets: ['Dual-chain pet minting', 'Breeding, bloodlines and marriage', 'Level up, train, rename, transfer'] },
  { phase: '02', title: 'Provable Arena', status: 'shipped', bullets: ['Beacon-seeded battles', 'Signed, chain-anchored receipts', 'Open-source public verifier'] },
  { phase: '03', title: 'Progression', status: 'in-progress', bullets: ['Leaderboard and seasons', 'CPET season rewards', 'Equipment and item NFTs'] },
  { phase: '04', title: 'Expansion', status: 'planned', bullets: ['Daily quests', 'Team battles', 'Pet and item marketplace'] },
];

export const ROADMAP_STATUS_LABEL: Record<RoadmapItem['status'], string> = {
  shipped: 'Shipped',
  'in-progress': 'In progress',
  planned: 'Planned',
};

export const RARITY_TIERS: RarityTier[] = [
  { name: 'Common', share: '55%', blurb: 'The everyday roster — solid stats and easy synergies.', tone: 'silver' },
  { name: 'Rare', share: '28%', blurb: 'Faster growth and access to mid-tier traits.', tone: 'cyan' },
  { name: 'Epic', share: '14%', blurb: 'Stronger move sets and exclusive cosmetics.', tone: 'violet' },
  { name: 'Legendary', share: '3%', blurb: 'Top-tier stats, unique abilities, full prestige.', tone: 'gold' },
];

export const FAQS: Faq[] = [
  { question: 'What is CryptoPets?', answer: 'A creature collection and battle game where the pets are NFTs. Mint one, train it, breed it, marry it off, and send it into the arena — on the web or on mobile.' },
  { question: 'Which chains are supported?', answer: 'Ethereum and Solana. Pets, breeding and battles run on both. Equipment and item NFTs are on Ethereum today.' },
  { question: 'Do I really own my pets?', answer: 'Yes. Pets are NFTs in your wallet. They are transferable and tradable, and they stay yours regardless of what happens to this app.' },
  { question: 'How do I know a battle was fair?', answer: 'The battle is seeded from a public randomness beacon round committed before the fight resolves, and the result is signed and folded into a Merkle batch anchored on chain. An open-source verifier replays any receipt and reports seven checks separately: seed derivation, the operator signature, the beacon signature, the combat replay, progression, equipment, and hash-chain continuity. It needs no account and no access to our servers.' },
  { question: 'Can someone battle my pet while I am offline?', answer: 'Not without your say-so. Defending takes a wallet-signed authorization that names the pet, the level band it will accept, the exact rule set, a validity window and a daily cap. Outside those bounds the battle is refused.' },
  { question: 'What does it cost to start?', answer: 'Connecting a wallet is free. Mint price varies per drop and is announced in advance on our community channels.' },
  { question: 'Can I earn from playing?', answer: 'Seasons pay CPET rewards to the top of the leaderboard, claimed against an on-chain Merkle root, and your pets and items are tradable assets. CPET has a fixed supply with no mint function. Treat it as a game you own a piece of, not as an income.' },
];

/**
 * The differentiator the site previously never mentioned. Each point maps to
 * checks the public verifier actually performs, so nothing here is a promise
 * that only we can evaluate.
 */
export const PROOF_POINTS: ProofPoint[] = [
  {
    step: '01',
    title: 'Committed before the fight',
    text: 'The randomness comes from a public beacon round chosen before the battle resolves. Nobody can grind it for a better roll — not you, not your opponent, not us.',
  },
  {
    step: '02',
    title: 'Signed, then anchored',
    text: 'Every result is a signed receipt over the exact inputs it used, and batches of receipts are committed to a Merkle root written on chain.',
  },
  {
    step: '03',
    title: 'Check it yourself',
    text: 'An open-source verifier replays any receipt and reports on the seed, the signature, the beacon, the combat replay, progression, gear and hash-chain continuity — independently, in public.',
  },
];

export const BACKERS: Backer[] = [
  { name: 'Ethereum' },
  { name: 'Solana' },
  { name: 'Base' },
  { name: 'Pyth Entropy' },
  { name: 'Switchboard' },
  { name: 'drand' },
  { name: 'Metaplex' },
  { name: 'The Graph' },
];

/* =============================================================================
   Site chrome
   ============================================================================= */
export const SITE = {
  name: 'Crypto Pets',
  playCta: 'Play Now',
};

/* =============================================================================
   Section copy. Every string the landing page renders lives in this file — a
   wording change should never require opening a component.
   ============================================================================= */
export const HERO = {
  eyebrow: 'On-Chain Pet Battler',
  titleLead: 'Collect, Battle & Breed',
  titleAccent: 'Your Dream Pets',
  body: '10,000 neon companions you actually own, on Ethereum and Solana. Every battle settles from a committed seed and ships with a receipt anyone can replay.',
  primaryCta: 'Play Now',
  secondaryCta: 'Explore Features',
  scrollLabel: 'Scroll to features',
};

export const SECTION_COPY = {
  how: {
    title: 'How It Works',
    subtitle: 'From wallet to first win in four steps.',
  },
  features: {
    title: 'What You Can Do',
    subtitle: 'Every pet and item is an NFT in your wallet, not a row in our database.',
  },
  pets: {
    title: 'Meet the Companions',
    subtitle: 'Four rarity tiers, ten thousand creatures, one shot at the legendary roster.',
  },
  roadmap: {
    title: 'Roadmap',
    subtitle: 'Built in phases, not to a calendar. Here is where each one stands.',
  },
  proof: {
    title: 'Provably Fair',
    subtitle: 'A game that decides your battles has to be checkable by someone other than itself.',
  },
  faq: {
    title: 'Questions, Answered',
    subtitle: 'Everything worth knowing before you mint your first pet.',
  },
  community: {
    title: 'Join the Pack',
    subtitle: 'Strategy, drops, and battle talk — pick your channel.',
  },
} satisfies Record<string, SectionCopy>;

/**
 * Verifiable figures only. The previous band claimed holder counts, battles
 * fought and dollars earned, none of which anyone outside the project could
 * check. These four are readable off the game's own design and source.
 */
export const STATS: Stat[] = [
  { value: 2, label: 'Chains Live' },
  { value: 4, label: 'Rarity Tiers' },
  { value: 7, label: 'Verifier Checks' },
  { value: 100, suffix: '%', label: 'Replayable Battles' },
];

export const CTA_BAND = {
  eyebrow: 'Free To Start',
  title: 'Hatch your first pet.',
  body: 'Connect a wallet and you are in. No account, no email, no waiting list.',
  action: 'Connect Wallet',
};

export const BACKERS_LABEL = 'Powered by & built with';

export const FOOTER = {
  brand: 'CryptoPets',
  blurb: 'Build your roster, rule the arena, and keep every pet in a wallet you control.',
  exploreHeading: 'Explore',
  resourcesHeading: 'Resources',
  copyrightHolder: 'CryptoPets',
  rights: 'All rights reserved.',
  tag: 'Built on-chain.',
};

export const RESOURCE_LINKS: NavLink[] = [
  { label: 'Source Code', href: 'https://github.com/radcrew/do-not-stop', external: true },
  { label: 'Receipt Verifier', href: 'https://github.com/radcrew/do-not-stop/tree/main/verifier', external: true },
  { label: 'Provably Fair', href: '#proof' },
  { label: 'FAQ', href: '#faq' },
];

/** Shared by the header nav and the footer's Explore column. */
export const NAV_LINKS: NavLink[] = [
  { label: 'How It Works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Pets', href: '#pets' },
  { label: 'Roadmap', href: '#roadmap' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Community', href: '#community' },
];
