import { useId, type ReactNode } from 'react';
import type { SystemHeadingLevel, SystemVariant } from './SystemFrame';

export type SystemNoticeLive = 'off' | 'polite' | 'assertive';

export interface SystemNoticeProps {
  title: ReactNode;
  children: ReactNode;
  variant?: SystemVariant;
  /** Visible text paired with the semantic color. */
  label?: ReactNode;
  actions?: ReactNode;
  live?: SystemNoticeLive;
  headingLevel?: SystemHeadingLevel;
  headingId?: string;
  className?: string;
}

const DEFAULT_LABEL: Record<SystemVariant, string> = {
  system: 'System',
  context: 'Context',
  stable: 'Ready',
  attention: 'Attention',
  critical: 'Critical',
  neutral: 'Notice',
};

/**
 * A semantic system message. It is quiet by default; callers opt into a live
 * region only when the message is created in response to a meaningful event.
 */
export function SystemNotice({
  title,
  children,
  variant = 'system',
  label,
  actions,
  live = 'off',
  headingLevel = 3,
  headingId,
  className,
}: SystemNoticeProps) {
  const generatedId = useId();
  const titleId = headingId ?? `${generatedId}-title`;
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  const role = live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined;
  const classes = ['st-notice', `st-notice--${variant}`, className].filter(Boolean).join(' ');

  return (
    <aside
      className={classes}
      aria-labelledby={titleId}
      aria-live={live === 'off' ? undefined : live}
      aria-atomic={live === 'off' ? undefined : true}
      role={role}
    >
      <span className="st-notice__rail" aria-hidden="true" />
      <div className="st-notice__main">
        <div className="st-notice__label">
          <span className="st-notice__signal" aria-hidden="true" />
          {label ?? DEFAULT_LABEL[variant]}
        </div>
        <Heading className="st-notice__title" id={titleId}>
          {title}
        </Heading>
        <div className="st-notice__body">{children}</div>
      </div>
      {actions && <div className="st-notice__actions">{actions}</div>}
    </aside>
  );
}
