export type LandingFeatureCard = {
  title: string;
  text: string;
  icon?: string;
  iconImage?: string;
};

export type LandingFeaturedPet = {
  name: string;
  level: number;
  rarity: string;
  image: string;
};

export type LandingCommunityCard = {
  name: string;
  members: string;
  color: 'discord' | 'twitter' | 'telegram' | 'youtube';
  href?: string;
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
