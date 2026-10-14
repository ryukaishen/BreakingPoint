import { useRef, type FormEvent, type ReactNode, type RefObject } from 'react';
import { TechnicalCorners } from './TechnicalCorners';
import { useModalFocus } from './useModalFocus';

export type NotificationTone = 'ready' | 'attention' | 'stop';

interface Props {
  tone: NotificationTone;
  /** alertdialog for decisions that discard data or end a set; dialog for forms. */
  role?: 'dialog' | 'alertdialog';
  /** The label in the title bar, e.g. "DELETE ATHLETE". */
  bar: string;
  /** The system code line above the heading, e.g. "LOCAL RECORDS / PERMANENT ACTION". */
  code?: string;
  titleId: string;
  title: ReactNode;
  bodyId?: string;
  children?: ReactNode;
  actions: ReactNode;
  /** Escape, the close button and a click outside call this. Leave it out when the choice must be explicit. */
  onClose?: () => void;
  /** Where focus starts: the safe choice, or the first field. Defaults to the window itself. */
  initialFocus?: RefObject<HTMLElement>;
  /** Render the window as a <form> (the athlete name dialog). */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  className?: string;
}

const SYMBOL: Record<NotificationTone, string> = { ready: '+', attention: '!', stop: '!' };

/**
 * Make's SystemNotification as a modal dialog: echo planes, corner brackets, a title bar and
 * the content block, assembled with Make's threshold-assemble motion. Focus moves in on open,
 * Tab and Shift+Tab stay inside, and focus returns to the control that opened it.
 */
export function SystemNotification(p: Props) {
  const ref = useRef<HTMLElement>(null);
  useModalFocus(ref, p.onClose, p.initialFocus);

  const content = (
    <>
      <div className="notification-echo echo-one" aria-hidden="true" />
      <div className="notification-echo echo-two" aria-hidden="true" />
      <TechnicalCorners />
      <div className="notification-title">
        <span className="notification-symbol" aria-hidden="true">
          {SYMBOL[p.tone]}
        </span>
        <span>{p.bar}</span>
        {p.onClose && (
          <button type="button" className="threshold-action notification-close" aria-label="Close" onClick={p.onClose}>
            ×
          </button>
        )}
      </div>
      <div className="notification-content">
        {p.code && <span className="threshold-code">{p.code}</span>}
        <h2 id={p.titleId}>{p.title}</h2>
        {p.children && (
          <div id={p.bodyId} className="notification-body">
            {p.children}
          </div>
        )}
        <div className="confirm-actions notification-actions">{p.actions}</div>
      </div>
    </>
  );

  const shared = {
    className: `threshold-notification tone-${p.tone} ${p.className ?? ''}`,
    role: p.role ?? 'dialog',
    'aria-modal': true,
    'aria-labelledby': p.titleId,
    'aria-describedby': p.children ? p.bodyId : undefined,
    tabIndex: -1,
  } as const;

  return (
    <div className="st-modal">
      <div className="st-scrim" aria-hidden="true" onClick={p.onClose} />
      {p.onSubmit ? (
        <form ref={ref as RefObject<HTMLFormElement>} {...shared} onSubmit={p.onSubmit} noValidate>
          {content}
        </form>
      ) : (
        <div ref={ref as RefObject<HTMLDivElement>} {...shared}>
          {content}
        </div>
      )}
    </div>
  );
}
