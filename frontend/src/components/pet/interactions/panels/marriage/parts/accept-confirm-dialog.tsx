import React from 'react';
import NeonButton from '@components/ui/neon-button';
import type { PendingAccept } from '../types';

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
    <div className="marriage-confirm-overlay" onClick={onCancel}>
        <div className="marriage-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h5 className="confirm-title">💒 Accept Proposal?</h5>
            <p className="confirm-body">
                <strong>{pending.proposal.proposerPetName}</strong> (#
                {pending.proposal.proposerPetId}) will marry your{' '}
                <strong>{targetPetName(pending.myPetId)}</strong> (#{pending.myPetId}).
            </p>
            <div className="confirm-actions">
                <button type="button" className="confirm-cancel" onClick={onCancel} disabled={busy}>
                    Cancel
                </button>
                <NeonButton tone="emerald" size="sm" onClick={onConfirm} disabled={busy}>
                    {isAccepting ? 'Accepting...' : '💒 Confirm'}
                </NeonButton>
            </div>
        </div>
    </div>
);

export default AcceptConfirmDialog;
