import React from 'react';
import {
  GiCrossedSwords,
  GiCrystalShine,
  GiDna1,
  GiDragonHead,
  GiEggPod,
  GiFairyWand,
  GiPaperPlane,
  GiPawPrint,
  GiQuillInk,
  GiSandsOfTime,
  GiSparkles,
  GiSpellBook,
  GiUpgrade,
} from 'react-icons/gi';
import { IoCheckmarkSharp, IoClose, IoCopy, IoPauseSharp, IoWarning } from 'react-icons/io5';
import './Icon.css';

export type IconTone = 'cyan' | 'violet' | 'magenta' | 'emerald' | 'amber' | 'inherit';
export type IconGlow = 'none' | 'soft' | 'strong';
export type IconSize = number | string;

export type IconProps = {
  as: React.ComponentType<{ size?: number | string; className?: string; 'aria-hidden'?: boolean }>;
  size?: IconSize;
  tone?: IconTone;
  glow?: IconGlow;
  className?: string;
  title?: string;
};

const TONE_CLASS: Record<IconTone, string> = {
  cyan: 'tone-cyan',
  violet: 'tone-violet',
  magenta: 'tone-magenta',
  emerald: 'tone-emerald',
  amber: 'tone-amber',
  inherit: 'tone-inherit',
};

const GLOW_CLASS: Record<IconGlow, string> = {
  none: '',
  soft: 'glow-soft',
  strong: 'glow-strong',
};

const Icon: React.FC<IconProps> = ({
  as: Component,
  size = '1em',
  tone = 'inherit',
  glow = 'soft',
  className,
  title,
}) => {
  const cls = ['neon-icon', TONE_CLASS[tone], GLOW_CLASS[glow], className].filter(Boolean).join(' ');
  return (
    <span className={cls} role={title ? 'img' : undefined} aria-label={title} aria-hidden={!title}>
      <Component size={size} aria-hidden />
    </span>
  );
};

export default Icon;

export {
  GiCrossedSwords as BattleIcon,
  GiCrystalShine as CrystalIcon,
  GiDna1 as DnaIcon,
  GiDragonHead as DragonIcon,
  GiEggPod as EggIcon,
  GiFairyWand as MagicIcon,
  GiPaperPlane as SendIcon,
  GiPawPrint as PawIcon,
  GiQuillInk as QuillIcon,
  GiSandsOfTime as HourglassIcon,
  GiSparkles as SparklesIcon,
  GiSpellBook as SpellbookIcon,
  GiUpgrade as LevelUpIcon,
  IoCheckmarkSharp as CheckIcon,
  IoClose as CloseIcon,
  IoCopy as CopyIcon,
  IoPauseSharp as PauseIcon,
  IoWarning as WarningIcon,
};
