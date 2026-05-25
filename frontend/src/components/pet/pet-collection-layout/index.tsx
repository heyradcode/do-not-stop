import React from 'react';
import './index.css';

export type PetCollectionLayoutProps = {
    title: React.ReactNode;
    /** Muted line under the title (e.g. “Connect your wallet…”). */
    description?: React.ReactNode;
    /** Controls aligned to the header corner (e.g. refresh). */
    actions?: React.ReactNode;
    children?: React.ReactNode;
    /** Extra classes on the outer `.pet-collection` section (e.g. `wallet-disconnected`). */
    className?: string;
};

/**
 * Shell for the dashboard pet list: section + surface + title bar.
 * Styles: `./index.css` (classes scoped under `.pet-collection`).
 */
const PetCollectionLayout: React.FC<PetCollectionLayoutProps> = ({
    title,
    description,
    actions,
    children,
    className,
}) => {
    const isWalletDisconnected = className?.includes('wallet-disconnected');

    return (
        <section className={`pet-collection${className ? ` ${className}` : ''}`} aria-labelledby="heading">
            <div className="surface">
                <header className="title-bar">
                    <div className="intro">
                        <h2 id="heading" className="heading">
                            {title}
                        </h2>
                        {description && !isWalletDisconnected ? (
                            <p className="caption">{description}</p>
                        ) : null}
                    </div>
                    {actions != null ? <div className="actions">{actions}</div> : null}
                </header>
                {isWalletDisconnected && description ? (
                    <div className="state-body">
                        <p className="caption">{description}</p>
                    </div>
                ) : null}
                {children}
            </div>
        </section>
    );
};

export default PetCollectionLayout;
