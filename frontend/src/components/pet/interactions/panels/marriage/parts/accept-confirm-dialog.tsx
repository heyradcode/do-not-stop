import React from 'react';
import NeonButton from '@components/ui/neon-button';
import NeonModal from '@components/ui/neon-modal';
import type { PendingAccept } from '../types';
import s from '../index.module.css';

type AcceptConfirmDialogProps = {
    pending: PendingAccept;
    targetPetName: (id: string) => string;
    busy: boolean;
    isAccepting: boolean;
    onCancel: () => void;
    onConfirm: () => void;
};

/** Modal confirming acceptance of an incoming proposal. */
const AcceptConfirmDialog: React.FC<AcceptConfirmDialogProps> = ({
    pending,
    targetPetName,
    busy,
    isAccepting,
    onCancel,
    onConfirm,
}) => (
    <NeonModal
        isOpen
        onRequestClose={onCancel}
        title="💒 Accept Proposal?"
        contentClassName="marriage-confirm-body"
    >
        <p className={s.confirmBody}>
            <strong>{pending.proposal.proposerPetName}</strong> (#{pending.proposal.proposerPetId})
            will marry your <strong>{targetPetName(pending.myPetId)}</strong> (#{pending.myPetId}).
        </p>
        <div className={s.confirmActions}>
            <button type="button" className={s.confirmCancel} onClick={onCancel} disabled={busy}>
                Cancel
            </button>
            <NeonButton tone="emerald" size="sm" onClick={onConfirm} disabled={busy}>
                {isAccepting ? 'Accepting...' : '💒 Confirm'}
            </NeonButton>
        </div>
    </NeonModal>
);

export default AcceptConfirmDialog;
