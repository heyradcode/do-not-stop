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
  members: string;
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

export type Testimonial = {
  quote: string;
  author: string;
  role: string;
};

export type Backer = { name: string };

export type NavLink = { label: string; href: string };

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
  eyebrow: 'On-Chain Pet Adventure',
  titleLead: 'Collect, Battle & Breed',
  titleAccent: 'Your Dream Pets',
  body: '10,000+ handcrafted neon companions, fully owned by you. Hatch them, train them, send them into the arena.',
  primaryCta: 'Play Now',
  secondaryCta: 'Explore Features',
  scrollLabel: 'Scroll to features',
};

export const SECTION_COPY = {
  how: {
    title: 'How It Works',
    subtitle: 'From wallet to first win in four short steps.',
  },
  features: {
    title: 'What You Can Do',
    subtitle: 'Every pet is a fully on-chain asset — yours to grow, fight, and trade.',
  },
  pets: {
    title: 'Meet the Companions',
    subtitle: 'Four rarity tiers, ten thousand creatures, one shot at the legendary roster.',
  },
  roadmap: {
    title: 'Roadmap',
    subtitle: "Where we've been, what's shipping next.",
  },
  testimonials: {
    title: 'From the Pack',
    subtitle: 'What players are saying after their first 100 battles.',
  },
  faq: {
    title: 'Questions, Answered',
    subtitle: 'Everything you need to know before you mint your first pet.',
  },
  community: {
    title: 'Join the Pack',
    subtitle: 'Strategy threads, alpha drops, and degen chatter — pick your channel.',
  },
} satisfies Record<string, SectionCopy>;

export const STATS: Stat[] = [
  { value: 10000, suffix: '+', label: 'Unique Pets' },
  { value: 5250, suffix: '+', label: 'Pet Holders' },
  { value: 1, suffix: 'M+', label: 'Battles Fought' },
  { value: 2.5, prefix: '$', suffix: 'M', decimals: 1, label: 'Rewards Earned' },
];

export const CTA_BAND = {
  eyebrow: 'Next Drop · Live Soon',
  title: "Don't miss the next mint.",
  body: 'Connect your wallet now and claim your spot on the whitelist.',
  action: 'Connect Wallet',
};

export const BACKERS_LABEL = 'Powered by & built with';

export const FOOTER = {
  brand: 'CryptoPet',
  blurb: 'Build your dream pet roster, rule the arena, and trade legendary companions.',
  exploreHeading: 'Explore',
  resourcesHeading: 'Resources',
  copyrightHolder: 'CryptoPet',
  rights: 'All rights reserved.',
  tag: 'Built on-chain.',
};

export const RESOURCE_LINKS: NavLink[] = [
  { label: 'About', href: '#' },
  { label: 'Roadmap', href: '#roadmap' },
  { label: 'Docs', href: '#' },
  { label: 'Support', href: '#' },
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

export const FEATURES: FeatureCard[] = [
  { title: 'Breed Unique Pets', text: 'Combine rare DNA traits and hatch powerful new companions.', iconImage: '/images/icons/interaction/breed.png' },
  { title: 'Epic Battles', text: 'Challenge rivals and climb the leaderboard with tactical fights.', iconImage: '/images/icons/interaction/battle.png' },
  { title: 'Power Growth', text: 'Level up, optimize stats, and unlock advanced abilities.', iconImage: '/images/icons/interaction/levelup.png' },
  { title: 'Trade & Earn', text: 'Collect, showcase, and trade your best CryptoPets.', iconImage: '/images/icons/interaction/trading.png' },
];

export const PETS: Pet[] = [
  { name: 'Golden Lion', level: 99, rarity: 'Legendary', image: '/images/pets/lion.png' },
  { name: 'Frost Dragon', level: 37, rarity: 'Epic', image: '/images/pets/dinosaur.png' },
  { name: 'Thunder Pup', level: 96, rarity: 'Rare', image: '/images/pets/dog.png' },
  { name: 'Crystal Trunk', level: 62, rarity: 'Epic', image: '/images/pets/elephant.png' },
  { name: 'Shadow Cat', level: 83, rarity: 'Rare', image: '/images/pets/cat.png' },
  { name: 'Mystic Owl', level: 71, rarity: 'Legendary', image: '/images/pets/owl.png' },
];

export const COMMUNITIES: CommunityCard[] = [
  { name: 'Discord', members: '150k+ Members', color: 'discord' },
  { name: 'Twitter', members: '250k+ Followers', color: 'twitter' },
  { name: 'Telegram', members: '120k+ Members', color: 'telegram' },
  { name: 'YouTube', members: '180k+ Members', color: 'youtube' },
];

export const STEPS: Step[] = [
  { number: '01', title: 'Connect', text: 'Plug in any wallet — MetaMask, Phantom or social login. Takes seconds.' },
  { number: '02', title: 'Mint', text: 'Hatch your first pet from the egg pool and roll for a rare trait.' },
  { number: '03', title: 'Train', text: 'Level up, breed new bloodlines, and unlock signature abilities.' },
  { number: '04', title: 'Battle', text: 'Take on rivals in the arena and climb the global leaderboard.' },
];

export const ROADMAP: RoadmapItem[] = [
  { quarter: 'Q1', title: 'Genesis Drop', status: 'shipped', bullets: ['Genesis mint live', 'Discord & socials launch', 'First 10k pet supply'] },
  { quarter: 'Q2', title: 'Arena', status: 'shipped', bullets: ['Battle system v1', 'Global leaderboards', 'Weekly tournaments'] },
  { quarter: 'Q3', title: 'Bloodlines', status: 'in-progress', bullets: ['Breeding mechanics', 'Cross-chain support', 'New rarity tier'] },
  { quarter: 'Q4', title: 'Marketplace 2.0', status: 'planned', bullets: ['Native P2P trades', 'Mobile companion app', 'Guild system'] },
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
  { question: 'What is CryptoPet?', answer: 'A fully on-chain creature collection and battle game. Every pet is an NFT you mint, train, and play with — across web and mobile.' },
  { question: 'Which chains are supported?', answer: 'Ethereum and Solana out of the gate, with additional rollups added through Q3. Use the wallet you already have.' },
  { question: 'Do I really own my pets?', answer: 'Yes. Pets are NFTs in your wallet — fully transferable, tradable, and yours to keep regardless of what happens to the app.' },
  { question: 'How much does it cost to start?', answer: 'Connecting your wallet is free. Mint price varies per drop and is announced ahead of time on Discord and Twitter.' },
  { question: 'Can I earn from playing?', answer: 'Yes. Win battles, breed sought-after bloodlines, and trade rares on the marketplace. Royalties flow to holders.' },
  { question: 'Are the contracts audited?', answer: 'Yes. Audit reports from independent firms are linked in the docs and updated on every major release.' },
];

export const TESTIMONIALS: Testimonial[] = [
  { quote: "Been collecting since the genesis drop. The battle system is genuinely fun — not just a chart you stare at.", author: 'neon_runner', role: 'Top-10 leaderboard, Season 1' },
  { quote: 'Best art in the space. Period. My Legendary owl pays the rent — emotionally.', author: 'Mira K.', role: 'Holder since Q1' },
  { quote: 'Finally an on-chain game that respects my time. Sessions are short, decisions are real.', author: '0xpaws', role: 'Guild captain' },
];

export const BACKERS: Backer[] = [
  { name: 'Ethereum' },
  { name: 'Solana' },
  { name: 'Chainlink' },
  { name: 'IPFS' },
  { name: 'Arbitrum' },
  { name: 'Base' },
];
