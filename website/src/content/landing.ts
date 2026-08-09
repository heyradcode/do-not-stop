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
  quarter: string;
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

export const FEATURES: FeatureCard[] = [
  { title: 'Breed New Bloodlines', text: 'Pair two pets and pass their traits down. Every hatch rolls against the same published rules.', iconImage: '/images/icons/interaction/breed.png' },
  { title: 'Battle for Rank', text: 'Tactical fights settled from a seed committed before the match, then signed. Climb the season leaderboard.', iconImage: '/images/icons/interaction/battle.png' },
  { title: 'Train and Gear Up', text: 'Level up, tune stats, and equip items that are held in escrow on chain for as long as they are worn.', iconImage: '/images/icons/interaction/levelup.png' },
  { title: 'Own and Trade', text: 'Pets and items are NFTs in your own wallet. Move them, trade them, or walk away with them.', iconImage: '/images/icons/interaction/trading.png' },
];

export const PETS: Pet[] = [
  { name: 'Golden Lion', level: 99, rarity: 'Legendary', image: '/images/pets/lion.png' },
  { name: 'Frost Dragon', level: 37, rarity: 'Epic', image: '/images/pets/dinosaur.png' },
  { name: 'Thunder Pup', level: 96, rarity: 'Rare', image: '/images/pets/dog.png' },
  { name: 'Crystal Trunk', level: 62, rarity: 'Epic', image: '/images/pets/elephant.png' },
  { name: 'Shadow Cat', level: 83, rarity: 'Rare', image: '/images/pets/cat.png' },
  { name: 'Mystic Owl', level: 71, rarity: 'Legendary', image: '/images/pets/owl.png' },
];

/* Channel URLs are intentionally absent rather than guessed — see README. */
export const COMMUNITIES: CommunityCard[] = [
  { name: 'Discord', blurb: 'Strategy and tournaments', color: 'discord' },
  { name: 'Twitter', blurb: 'Drops and patch notes', color: 'twitter' },
  { name: 'Telegram', blurb: 'Trades and quick calls', color: 'telegram' },
  { name: 'YouTube', blurb: 'Guides and battle replays', color: 'youtube' },
];

export const STEPS: Step[] = [
  { number: '01', title: 'Connect', text: 'Bring the wallet you already have — MetaMask on Ethereum, Phantom on Solana.' },
  { number: '02', title: 'Mint', text: 'Hatch your first pet and roll its traits from a committed random seed.' },
  { number: '03', title: 'Train', text: 'Level up, breed new bloodlines, and equip gear that stays with the pet.' },
  { number: '04', title: 'Battle', text: 'Enter the arena, climb the leaderboard, and keep a receipt for every fight.' },
];

export const ROADMAP: RoadmapItem[] = [
  { quarter: 'Q1', title: 'Genesis', status: 'shipped', bullets: ['Dual-chain pet minting', 'On-chain breeding', 'Four-tier rarity system'] },
  { quarter: 'Q2', title: 'Arena', status: 'shipped', bullets: ['Tactical battle engine', 'Global leaderboard', 'Seasonal rewards'] },
  { quarter: 'Q3', title: 'Provable Play', status: 'in-progress', bullets: ['Beacon-seeded battles', 'Signed battle receipts', 'Open-source verifier'] },
  { quarter: 'Q4', title: 'Loadouts', status: 'planned', bullets: ['Equipment and consumables', 'Guilds and rivalries', 'Native marketplace'] },
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
  { question: 'What is CryptoPets?', answer: 'A creature collection and battle game where the pets are NFTs. Mint one, train it, breed it, and send it into the arena — on the web or on mobile.' },
  { question: 'Which chains are supported?', answer: 'Ethereum and Solana. The same game runs on both, and you use whichever wallet you already have.' },
  { question: 'Do I really own my pets?', answer: 'Yes. Pets and items live in your wallet as NFTs. They are transferable and tradable, and they stay yours regardless of what happens to this app.' },
  { question: 'How do I know a battle was fair?', answer: 'Each battle is seeded from a public randomness beacon round committed before the fight resolves, and the result is signed. An open-source verifier replays any receipt independently and checks the seed, the signature, the beacon, the combat maths, the progression and the gear — no account and no access to our servers required.' },
  { question: 'What does it cost to start?', answer: 'Connecting a wallet is free. Mint price varies per drop and is announced in advance on our community channels.' },
  { question: 'Can I earn from playing?', answer: 'Pets and items are tradable assets, and seasons pay out rewards to the top of the leaderboard. Treat it as a game you own a piece of, not as an income.' },
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
    subtitle: "What's shipped, and what's coming next.",
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
  { value: 10000, label: 'Genesis Supply' },
  { value: 2, label: 'Chains Live' },
  { value: 4, label: 'Rarity Tiers' },
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
