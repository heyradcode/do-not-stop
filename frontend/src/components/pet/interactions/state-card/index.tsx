import React from 'react';
import DashboardPanel from '@components/common/dashboard-panel';

export type StateCardProps = {
    title: React.ReactNode;
    description?: React.ReactNode;
    sub?: React.ReactNode;
    helpText?: React.ReactNode;
    children?: React.ReactNode;
    /** Extra classes on the outer panel (e.g. `wallet-disconnected`, `interaction-standalone`). */
    containerClassName?: string;
};

/**
 * Shared wrapper for simple interaction "state" screens:
 * - not connected
 * - no pets yet
 * - not enough pets
 * - header + arbitrary children
 *
 * Composes the shared `DashboardPanel` with a `pet-interactions` modifier.
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
    const composedClass = `pet-interactions${containerClassName ? ` ${containerClassName}` : ''}`;

    return (
        <DashboardPanel
            title={title}
            className={composedClass}
            headingId="pet-interactions-heading"
            description={isWalletDisconnected ? description : undefined}
            centerDescription={isWalletDisconnected}
        >
            {!isWalletDisconnected && description ? (
                <p className="description">{description}</p>
            ) : null}
            {sub ? <p className="sub">{sub}</p> : null}
            {helpText ? <p className="help-text">{helpText}</p> : null}
            {children}
        </DashboardPanel>
    );
};

export default StateCard;
