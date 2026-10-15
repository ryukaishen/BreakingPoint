import { useId, useRef, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import type { PostSection } from '../../session/postWorkout';
import { TechnicalCorners } from '../system/TechnicalCorners';

interface Props {
  /** The line above the title, e.g. "Session telemetry / Sample athlete". */
  code: string;
  section: PostSection;
  onSection: (s: PostSection) => void;
  /** Extra header actions before Exit (e.g. back to the camera during a live recovery check). */
  headerActions?: ReactNode;
  onExit: () => void;
  exitLabel?: string;
  /** Element that receives focus when the system opens (the heading). */
  headingRef?: Ref<HTMLHeadingElement>;
  headingLevel?: 1 | 2;
  children: ReactNode;
}

const SECTIONS: [PostSection, string][] = [
  ['recovery', 'Recovery'],
  ['summary', 'Summary'],
  ['history', 'History'],
];

/**
 * Figma Make's post-workout system: the violet frame, its header and the Recovery / Summary /
 * History sections. The sections are a tab list (arrow keys, Home and End move between them).
 */
export function PostWorkoutSystem({ code, section, onSection, headerActions, onExit, exitLabel = 'Exit', headingRef, headingLevel = 2, children }: Props) {
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = SECTIONS.length - 1;
    const next = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (next === null) return;
    e.preventDefault();
    onSection(SECTIONS[next][0]);
    tabs.current[next]?.focus();
  };

  return (
    <section className="post-system" aria-labelledby={`${id}-title`}>
      <div className="post-backplane post-plane-a" aria-hidden="true" />
      <div className="post-backplane post-plane-b" aria-hidden="true" />
      <div className="post-shell">
        <TechnicalCorners />
        <header className="post-header">
          <div>
            <span className="threshold-code">{code}</span>
            <Heading id={`${id}-title`} ref={headingRef} tabIndex={-1}>
              Post-workout system
            </Heading>
          </div>
          <div className="post-section-tabs">
            <div role="tablist" aria-label="Post-workout sections">
              {SECTIONS.map(([s, label], i) => (
                <button
                  key={s}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${s}`}
                  aria-selected={section === s}
                  aria-controls={`${id}-panel`}
                  tabIndex={section === s ? 0 : -1}
                  className={`threshold-action ${section === s ? 'is-active' : ''}`}
                  onClick={() => onSection(s)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  {label}
                </button>
              ))}
            </div>
            {headerActions}
            <button type="button" className="threshold-action post-exit" onClick={onExit}>
              {exitLabel}
            </button>
          </div>
        </header>
        <div className="post-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${section}`} key={section}>
          {children}
        </div>
      </div>
    </section>
  );
}
