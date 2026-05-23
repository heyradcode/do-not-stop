import React from 'react';
import clsx from 'clsx';

import './NeonCard.css';

type NeonCardProps = React.HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'div' | 'section';
};

export default function NeonCard({
  as = 'article',
  className,
  children,
  ...props
}: NeonCardProps) {
  const Tag = as;
  const classes = clsx('neon-card', className);

  return (
    <Tag className={classes} {...props}>
      {children}
    </Tag>
  );
}
