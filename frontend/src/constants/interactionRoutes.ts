import type { ComponentType } from 'react';
import {
  BattleIcon,
  EggIcon,
  LevelUpIcon,
  MarriageIcon,
  QuillIcon,
  TrainIcon,
} from '@components/ui/icon';

/** Internal action id (`interactions/:action`; `rename` segment → changename). */
export type InteractionAction = 'breed' | 'battle' | 'levelup' | 'train' | 'marriage' | 'changename';

export type StandaloneInteractionHeader = {
  Icon: ComponentType<{ size?: number | string }>;
  label: string;
  sub: string;
};

/** Standalone page titles for `/breed` … `/rename` (dashboard hub uses its own header). */
export const STANDALONE_INTERACTION_HEADERS: Record<InteractionAction, StandaloneInteractionHeader> = {
  breed: { Icon: EggIcon, label: 'Breeding Lab', sub: 'Breed two pets to create a new one' },
  battle: { Icon: BattleIcon, label: 'Battle Arena', sub: 'Pick two pets to fight' },
  levelup: { Icon: LevelUpIcon, label: 'Level Up', sub: 'Pay a small fee to level up your pet' },
  train: { Icon: TrainIcon, label: 'Training Ground', sub: 'Pay a level-scaled fee for an XP boost' },
  marriage: { Icon: MarriageIcon, label: 'Marriage', sub: 'Marry two pets to unlock cross-owner breeding' },
  changename: { Icon: QuillIcon, label: 'Rename Pet', sub: "Change your pet's name" },
};

/** Dashboard home (hub + gallery). */
export const DASHBOARD_HOME = '/dashboard';

/** Top-level interaction routes (e.g. /breed) — no gallery; interaction UI only. */
export const BREED_PATH = '/breed';
export const BATTLE_PATH = '/battle';
export const LEVELUP_PATH = '/levelup';
export const TRAIN_PATH = '/train';
export const MARRIAGE_PATH = '/marriage';
export const RENAME_PATH = '/rename';

/** Routes where the layout shows only the interaction flow (gallery hidden). */
export const INTERACTION_ROUTES: readonly string[] = [
  BREED_PATH,
  BATTLE_PATH,
  LEVELUP_PATH,
  TRAIN_PATH,
  MARRIAGE_PATH,
  RENAME_PATH,
];

export const isInteractionRoute = (pathname: string): boolean  => {
  const path = pathname.replace(/\/$/, '') || '/';
  return INTERACTION_ROUTES.includes(path);
}
