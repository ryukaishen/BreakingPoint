import { useId, type ReactNode } from 'react';
import '../../styles-system-threshold.css';

export type SystemHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type SystemVariant = 'system' | 'context' | 'stable' | 'attention' | 'critical' | 'neutral';

export interface SystemFrameProps {
  title: ReactNode;
  children: ReactNode;
  /** A short label above the heading, such as "Live session" or "Sample data". */
  label?: ReactNode;
  /** Supporting copy attached to the heading. */
  description?: ReactNode;
  /** Violet, secondary context that should not compete with the primary status. */
  context?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: SystemVariant;
  headingLevel?: SystemHeadingLevel;
  headingId?: string;
  className?: string;
}

const classNames = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

/**
 * Structural shell for System Threshold surfaces.
 *
 * The rail and backplane carry hierarchy; the component deliberately avoids a
 * generic floating-card treatment. A visible heading always names the region.
 */
export function SystemFrame({
  title,
  children,
  label,
  description,
  context,
  actions,
  footer,
  variant = 'system',
  headingLevel = 2,
  headingId,
  className,
}: SystemFrameProps) {
  const generatedId = useId();
  const titleId = headingId ?? `${generatedId}-title`;
  const Heading = `h${headingLevel}` as const;

  return (
    <section className={classNames('st-frame', `st-frame--${variant}`, className)} aria-labelledby={titleId}>
      <span className="st-frame__backplane" aria-hidden="true" />
      <div className="st-frame__content">
        <header className="st-frame__header">
          <div className="st-frame__heading">
            {label && <div className="st-frame__label">{label}</div>}
            <Heading className="st-frame__title" id={titleId}>
              {title}
            </Heading>
            {description && <p className="st-frame__description">{description}</p>}
          </div>
          {(context || actions) && (
            <div className="st-frame__header-side">
              {context && <div className="st-frame__context">{context}</div>}
              {actions && <div className="st-frame__actions">{actions}</div>}
            </div>
          )}
        </header>
        <div className="st-frame__body">{children}</div>
        {footer && <footer className="st-frame__footer">{footer}</footer>}
      </div>
    </section>
  );
}
