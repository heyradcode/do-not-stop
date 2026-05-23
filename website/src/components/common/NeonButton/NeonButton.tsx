import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

import './NeonButton.css';

export type NeonButtonTone = 'emerald' | 'azure' | 'amber' | 'cyan';
export type NeonButtonSize = 'md' | 'sm';

export type NeonButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: NeonButtonTone;
  size?: NeonButtonSize;
  fullWidth?: boolean;
};

export default function NeonButton({
  tone = 'azure',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...rest
}: NeonButtonProps) {
  const classString = clsx(
    'neon-btn',
    `tone-${tone}`,
    `size-${size}`,
    fullWidth && 'full-width',
    className,
  );

  return (
    <button type={type} className={classString} {...rest}>
      <span className="label">{children}</span>
    </button>
  );
}
