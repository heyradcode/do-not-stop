import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Modal from 'react-modal';

import NeonButton from '../NeonButton/NeonButton';
import './NeonModal.css';

type NeonModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  title: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export default function NeonModal({
  isOpen,
  onRequestClose,
  title,
  children,
  headerActions,
  className,
  contentClassName,
}: NeonModalProps) {
  useEffect(() => {
    Modal.setAppElement('#root');
  }, []);

  const dialogClassName = ['dialog', className].filter(Boolean).join(' ');
  const bodyClassName = ['body', contentClassName].filter(Boolean).join(' ');

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      className={dialogClassName}
      overlayClassName="neon-modal"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
    >
      <div className="header">
        <h3 className="title">{title}</h3>
        <div className="controls">
          {headerActions}
          <NeonButton
            className="close-btn"
            onClick={onRequestClose}
            tone="cyan"
            size="sm"
            aria-label="Close modal"
          >
            Close
          </NeonButton>
        </div>
      </div>
      <div className={bodyClassName}>{children}</div>
    </Modal>
  );
}
