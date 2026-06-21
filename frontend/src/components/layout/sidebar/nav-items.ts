import type { ComponentType } from 'react';
import {
    BattleIcon,
    CrystalIcon,
    EggIcon,
    LevelUpIcon,
    MarriageIcon,
    PawIcon,
    QuillIcon,
    SparklesIcon,
    TrainIcon,
    type IconTone,
} from '@components/ui/icon';
import {
    BATTLE_PATH,
    BREED_PATH,
    DASHBOARD_HOME,
    LEVELUP_PATH,
    MARRIAGE_PATH,
    RENAME_PATH,
    TRAIN_PATH,
} from '@constants/interactionRoutes';

export type NavItem = {
    id: string;
    label: string;
    Icon: ComponentType<{ size?: number | string }>;
    tone: IconTone;
    /** Route this item navigates to. Omitted for deferred (not-yet-built) items. */
    path?: string;
    /** Deferred features (Inventory / Shard Forge) render disabled with a "Soon" tag. */
    deferred?: boolean;
};

/**
 * Left-nav actions, ordered to match the redesign mock. Gallery + six feature
 * screens are wired to real routes; Inventory and Shard Forge are deferred (see
 * FRONTEND_REDESIGN_PLAN.md §8) and shown disabled until backend/contract
 * support lands.
 */
export const NAV_ITEMS: readonly NavItem[] = [
    { id: 'gallery', label: 'Gallery', Icon: PawIcon, tone: 'cyan', path: DASHBOARD_HOME },
    { id: 'battle', label: 'Battle Arena', Icon: BattleIcon, tone: 'magenta', path: BATTLE_PATH },
    { id: 'breed', label: 'Breeding Lab', Icon: EggIcon, tone: 'amber', path: BREED_PATH },
    { id: 'levelup', label: 'Level Up', Icon: LevelUpIcon, tone: 'violet', path: LEVELUP_PATH },
    { id: 'train', label: 'Training Ground', Icon: TrainIcon, tone: 'cyan', path: TRAIN_PATH },
    { id: 'items', label: 'Inventory', Icon: CrystalIcon, tone: 'amber', deferred: true },
    { id: 'shard', label: 'Shard Forge', Icon: SparklesIcon, tone: 'cyan', deferred: true },
    { id: 'marriage', label: 'Marriage', Icon: MarriageIcon, tone: 'magenta', path: MARRIAGE_PATH },
    { id: 'rename', label: 'Rename Pet', Icon: QuillIcon, tone: 'cyan', path: RENAME_PATH },
];
