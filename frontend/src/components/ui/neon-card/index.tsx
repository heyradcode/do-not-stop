import React from 'react';
import clsx from 'clsx';

import s from './index.module.css';

type NeonCardProps = React.HTMLAttributes<HTMLElement> & {
    as?: 'article' | 'div' | 'section';
};

const NeonCard = ({ as = 'article', className, children, ...props }: NeonCardProps) => {
    const Tag = as;
    const classes = clsx(s.card, className);

    return (
        <Tag className={classes} {...props}>
            {children}
        </Tag>
    );
};

export default NeonCard;
