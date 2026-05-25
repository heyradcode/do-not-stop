import React from 'react';

export type StateCardProps = {
    title: React.ReactNode;
    description?: React.ReactNode;
    sub?: React.ReactNode;
    helpText?: React.ReactNode;
    children?: React.ReactNode;
    /** Extra classes applied to the outer `.pet-interactions` container. */
    containerClassName?: string;
};

/**
 * Shared wrapper for simple interaction “state” screens:
 * - not connected
 * - no pets yet
 * - not enough pets
 * - header + arbitrary children
 */
const StateCard: React.FC<StateCardProps> = ({
    title,
    description,
    sub,
    helpText,
    children,
    containerClassName,
}) => {
    const isWalletDisconnected = containerClassName?.includes('wallet-disconnected');

    return (
        <div className={`pet-interactions${containerClassName ? ` ${containerClassName}` : ''}`}>
            <div className="card">
                <div className="header">
                    <h3>{title}</h3>
                </div>
                {description && isWalletDisconnected ? (
                    <div className="state-body">
                        <p className="description">{description}</p>
                    </div>
                ) : description ? (
                    <p className="description">{description}</p>
                ) : null}
                {sub ? <p className="sub">{sub}</p> : null}
                {helpText ? <p className="help-text">{helpText}</p> : null}
                {children}
            </div>
        </div>
    );
};

export default StateCard;
