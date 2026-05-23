export type LandingFeatureCard = {
  title: string;
  text: string;
  icon?: string;
  iconImage?: string;
};

export type LandingFeaturedPet = {
  name: string;
  level: number;
  rarity: 'Legendary' | 'Epic' | 'Rare';
  image: string;
};

export type LandingCommunityCard = {
  name: string;
  members: string;
  color: 'discord' | 'twitter' | 'telegram' | 'youtube';
  href?: string;
};

export type LandingStep = {
  number: string;
  title: string;
  text: string;
};

export type LandingRoadmapItem = {
  quarter: string;
  title: string;
  status: 'shipped' | 'in-progress' | 'planned';
  bullets: string[];
};

export type LandingRarityTier = {
  name: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  share: string;
  blurb: string;
  tone: 'silver' | 'cyan' | 'violet' | 'gold';
};

export type LandingFaq = {
  question: string;
  answer: string;
};

export type LandingTestimonial = {
  quote: string;
  author: string;
  role: string;
};

export type LandingBacker = {
  name: string;
};

export const LANDING_FEATURE_CARDS: LandingFeatureCard[] = [
  { title: 'Breed Unique Pets', text: 'Combine rare DNA traits and hatch powerful new companions.', iconImage: '/images/icons/interaction/breed.png' },
  { title: 'Epic Battles', text: 'Challenge rivals and climb the leaderboard with tactical fights.', iconImage: '/images/icons/interaction/battle.png' },
  { title: 'Power Growth', text: 'Level up, optimize stats, and unlock advanced abilities.', iconImage: '/images/icons/interaction/levelup.png' },
  { title: 'Trade & Earn', text: 'Collect, showcase, and trade your best CryptoPets.', iconImage: '/images/icons/interaction/trading.png' },
];

export const LANDING_FEATURED_PETS: LandingFeaturedPet[] = [
  { name: 'Golden Lion', level: 99, rarity: 'Legendary', image: '/images/pets/lion.png' },
  { name: 'Frost Dragon', level: 37, rarity: 'Epic', image: '/images/pets/dinosaur.png' },
  { name: 'Thunder Pup', level: 96, rarity: 'Rare', image: '/images/pets/dog.png' },
  { name: 'Crystal Trunk', level: 62, rarity: 'Epic', image: '/images/pets/elephant.png' },
  { name: 'Shadow Cat', level: 83, rarity: 'Rare', image: '/images/pets/cat.png' },
  { name: 'Mystic Owl', level: 71, rarity: 'Legendary', image: '/images/pets/owl.png' },
];

export const LANDING_COMMUNITY_CARDS: LandingCommunityCard[] = [
  { name: 'Discord', members: '150k+ Members', color: 'discord' },
  { name: 'Twitter', members: '250k+ Followers', color: 'twitter' },
  { name: 'Telegram', members: '120k+ Members', color: 'telegram' },
  { name: 'YouTube', members: '180k+ Members', color: 'youtube' },
];

export const LANDING_STEPS: LandingStep[] = [
  { number: '01', title: 'Connect', text: 'Plug in any wallet — MetaMask, Phantom or social login. Takes seconds.' },
  { number: '02', title: 'Mint', text: 'Hatch your first pet from the egg pool and roll for a rare trait.' },
  { number: '03', title: 'Train', text: 'Level up, breed new bloodlines, and unlock signature abilities.' },
  { number: '04', title: 'Battle', text: 'Take on rivals in the arena and climb the global leaderboard.' },
];

export const LANDING_ROADMAP: LandingRoadmapItem[] = [
  {
    quarter: 'Q1',
    title: 'Genesis Drop',
    status: 'shipped',
    bullets: ['Genesis mint live', 'Discord & socials launch', 'First 10k pet supply'],
  },
  {
    quarter: 'Q2',
    title: 'Arena',
    status: 'shipped',
    bullets: ['Battle system v1', 'Global leaderboards', 'Weekly tournaments'],
  },
  {
    quarter: 'Q3',
    title: 'Bloodlines',
    status: 'in-progress',
    bullets: ['Breeding mechanics', 'Cross-chain support', 'New rarity tier'],
  },
  {
    quarter: 'Q4',
    title: 'Marketplace 2.0',
    status: 'planned',
    bullets: ['Native P2P trades', 'Mobile companion app', 'Guild system'],
  },
];

export const LANDING_RARITY_TIERS: LandingRarityTier[] = [
  { name: 'Common', share: '55%', blurb: 'The everyday roster — solid stats and easy synergies.', tone: 'silver' },
  { name: 'Rare', share: '28%', blurb: 'Faster growth and access to mid-tier traits.', tone: 'cyan' },
  { name: 'Epic', share: '14%', blurb: 'Stronger move sets and exclusive cosmetics.', tone: 'violet' },
  { name: 'Legendary', share: '3%', blurb: 'Top-tier stats, unique abilities, full prestige.', tone: 'gold' },
];

export const LANDING_FAQS: LandingFaq[] = [
  {
    question: 'What is CryptoPet?',
    answer: 'A fully on-chain creature collection and battle game. Every pet is an NFT you mint, train, and play with — across web and mobile.',
  },
  {
    question: 'Which chains are supported?',
    answer: 'Ethereum and Solana out of the gate, with additional rollups added through Q3. Use the wallet you already have.',
  },
  {
    question: 'Do I really own my pets?',
    answer: 'Yes. Pets are NFTs in your wallet — fully transferable, tradable, and yours to keep regardless of what happens to the app.',
  },
  {
    question: 'How much does it cost to start?',
    answer: 'Connecting your wallet is free. Mint price varies per drop and is announced ahead of time on Discord and Twitter.',
  },
  {
    question: 'Can I earn from playing?',
    answer: 'Yes. Win battles, breed sought-after bloodlines, and trade rares on the marketplace. Royalties flow to holders.',
  },
  {
    question: 'Are the contracts audited?',
    answer: 'Yes. Audit reports from independent firms are linked in the docs and updated on every major release.',
  },
];

export const LANDING_TESTIMONIALS: LandingTestimonial[] = [
  {
    quote: "Been collecting since the genesis drop. The battle system is genuinely fun — not just a chart you stare at.",
    author: 'neon_runner',
    role: 'Top-10 leaderboard, Season 1',
  },
  {
    quote: 'Best art in the space. Period. My Legendary owl pays the rent — emotionally.',
    author: 'Mira K.',
    role: 'Holder since Q1',
  },
  {
    quote: 'Finally an on-chain game that respects my time. Sessions are short, decisions are real.',
    author: '0xpaws',
    role: 'Guild captain',
  },
];

export const LANDING_BACKERS: LandingBacker[] = [
  { name: 'Ethereum' },
  { name: 'Solana' },
  { name: 'Chainlink' },
  { name: 'IPFS' },
  { name: 'Arbitrum' },
  { name: 'Base' },
];
