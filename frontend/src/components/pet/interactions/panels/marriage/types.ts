import type { IncomingProposal } from '@shared/core';

export type MarriageTab = 'propose' | 'accept';

export type MarriagePanelProps = {
    isStandaloneView?: boolean;
};

export type PendingAccept = {
    proposal: IncomingProposal;
    myPetId: string;
};
