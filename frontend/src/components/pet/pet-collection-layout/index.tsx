import React from 'react';
import PetContainer from '@components/pet/pet-container';
import './index.css';

export type PetCollectionLayoutProps = {
    title: React.ReactNode;
    /** Muted line under the title (e.g. “Connect your wallet…”). */
    description?: React.ReactNode;
    /** Controls aligned to the header corner (e.g. refresh). */
    actions?: React.ReactNode;
    children?: React.ReactNode;
    /** Extra classes on the outer panel (e.g. `wallet-disconnected`). */
    className?: string;
};

/**
 * Shell for the dashboard pet list. Composes the shared `PetContainer` with
 * a `pet-collection` modifier so list-specific styles can scope to this panel.
 */
const PetCollectionLayout: React.FC<PetCollectionLayoutProps> = ({
    title,
    description,
    actions,
    children,
    className,
}) => {
    const isWalletDisconnected = className?.includes('wallet-disconnected');
    const composedClass = `pet-collection${className ? ` ${className}` : ''}`;

    return (
        <PetContainer
            title={title}
            description={description}
            actions={actions}
            className={composedClass}
            headingId="pet-collection-heading"
            centerDescription={isWalletDisconnected}
        >
            {children}
        </PetContainer>
    );
};

export default PetCollectionLayout;
