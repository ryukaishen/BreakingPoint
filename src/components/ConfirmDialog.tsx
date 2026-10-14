import { useRef, type ReactNode } from 'react';
import { SystemNotification } from './system/SystemNotification';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** 'danger' for actions that discard data or abandon a set. */
  tone?: 'danger' | 'default';
  /** The window's title-bar label. */
  bar?: string;
  /** The system code line above the title. */
  code?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Interrupts only for destructive or session-ending actions. Focus starts on the safe choice. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', tone = 'danger', bar, code, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const danger = tone === 'danger';
  return (
    <SystemNotification
      tone={danger ? 'stop' : 'ready'}
      role="alertdialog"
      bar={bar ?? 'Confirm'}
      code={code}
      titleId="confirm-title"
      title={title}
      bodyId="confirm-body"
      onClose={onCancel}
      initialFocus={cancelRef}
      actions={
        <>
          <button type="button" className="threshold-action notification-btn" ref={cancelRef} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`threshold-action notification-btn ${danger ? 'is-danger' : 'is-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </SystemNotification>
  );
}
