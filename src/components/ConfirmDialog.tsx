import type { ReactNode } from 'react';
import { useDialog } from '../utils/hooks';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** 'danger' for actions that discard data or abandon a set. */
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

/** Interrupts only for destructive or session-ending actions. Focus starts on the safe choice. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', tone = 'danger', onConfirm, onCancel }: Props) {
  const cancelRef = useDialog<HTMLButtonElement>(onCancel);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="confirm sys-window" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <div id="confirm-body" className="confirm-body">
          {children}
        </div>
        <div className="confirm-actions">
          <button className="btn" ref={cancelRef} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn ${tone === 'danger' ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
