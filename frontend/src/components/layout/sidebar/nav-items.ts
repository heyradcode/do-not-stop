import { type IconTone } from '@components/ui/icon';
import {
    BATTLE_PATH,
    BREED_PATH,
    DASHBOARD_HOME,
    LEADERBOARD_PATH,
    LEVELUP_PATH,
    MESSAGES_PATH,
    MARRIAGE_PATH,
    RENAME_PATH,
    TRAIN_PATH,
} from '@constants/interactionRoutes';
import galleryIcon from '@assets/nav-icons/gallery.svg';
import battleIcon from '@assets/nav-icons/battle.svg';
import breedIcon from '@assets/nav-icons/breed.svg';
import levelupIcon from '@assets/nav-icons/levelup.svg';
import trainIcon from '@assets/nav-icons/train.svg';
import itemsIcon from '@assets/nav-icons/items.svg';
import shardIcon from '@assets/nav-icons/shard.svg';
import marriageIcon from '@assets/nav-icons/marriage.svg';
import renameIcon from '@assets/nav-icons/rename.svg';
import messagesIcon from '@assets/nav-icons/messages.svg';
import leaderboardIcon from '@assets/nav-icons/leaderboard.svg';

export type NavItem = {
    id: string;
    label: string;
    /** URL of the Claude-Design-generated nav icon (colored SVG, viewBox 48×48). */
    iconSrc: string;
    /** Drives the active border-left / glow accent (see sidebar/index.css). */
    tone: IconTone;
    /** Route this item navigates to. Omitted for deferred (not-yet-built) items. */
    path?: string;
    /** Deferred features (Inventory / Shard Forge) render disabled with a "Soon" tag. */
    deferred?: boolean;
};

/**
 * Left-nav actions, ordered to match the redesign mock. Icons are the
 * Claude-Design-generated SVGs (`src/assets/nav-icons/`). Gallery + six feature
 * screens are wired to real routes; Inventory and Shard Forge are deferred (see
 * FRONTEND_REDESIGN_PLAN.md §8) and shown disabled until backend/contract
 * support lands.
 */
export const NAV_ITEMS: readonly NavItem[] = [
    { id: 'gallery', label: 'Gallery', iconSrc: galleryIcon, tone: 'cyan', path: DASHBOARD_HOME },
    { id: 'battle', label: 'Battle Arena', iconSrc: battleIcon, tone: 'magenta', path: BATTLE_PATH },
    { id: 'breed', label: 'Breeding Lab', iconSrc: breedIcon, tone: 'amber', path: BREED_PATH },
    { id: 'levelup', label: 'Level Up', iconSrc: levelupIcon, tone: 'violet', path: LEVELUP_PATH },
    { id: 'train', label: 'Training Ground', iconSrc: trainIcon, tone: 'cyan', path: TRAIN_PATH },
    { id: 'items', label: 'Inventory', iconSrc: itemsIcon, tone: 'amber', deferred: true },
    { id: 'shard', label: 'Shard Forge', iconSrc: shardIcon, tone: 'cyan', deferred: true },
    { id: 'marriage', label: 'Marriage', iconSrc: marriageIcon, tone: 'magenta', path: MARRIAGE_PATH },
    { id: 'rename', label: 'Rename Pet', iconSrc: renameIcon, tone: 'cyan', path: RENAME_PATH },
    {
        id: 'messages',
        label: 'Messages',
        iconSrc: messagesIcon,
        tone: 'magenta',
        path: MESSAGES_PATH,
    },
    {
        id: 'leaderboard',
        label: 'Leaderboard',
        iconSrc: leaderboardIcon,
        tone: 'amber',
        path: LEADERBOARD_PATH,
    },
];
