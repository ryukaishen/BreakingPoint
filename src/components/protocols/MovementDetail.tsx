import { MIN_CALIBRATION_REPS } from '../../baseline/baseline';
import { STATUS_NAME, statusTone, type MovementEntry } from '../../protocols/catalog';
import type { LaunchContext } from '../../protocols/launch';
import type { ProtocolStatus } from '../../protocols/protocols';
import { CALIBRATION_TARGET } from '../../session/engine';

/** Make's protocol status tag: Ready (cyan), Beta (violet), Coming soon and Future (muted). */
export function ProtocolStatusTag({ status }: { status: ProtocolStatus }) {
  return <span className={`protocol-status status-${statusTone(status)}`}>{STATUS_NAME[status]}</span>;
}

interface Props {
  entry: MovementEntry;
  /** When a saved baseline exists for the current athlete and this protocol: when it was saved. */
  savedAt?: string;
  /** Other sports that use the same protocol (the library shows them). */
  sharedWith?: string[];
  headingLevel?: 2 | 3;
  /** The selector renders the panel as the tab panel of its movement cards. */
  panel?: { id: string; labelledBy: string };
  library?: boolean;
  onDemo: (ctx: LaunchContext) => void;
  onLive: (ctx: LaunchContext) => void;
}

const savedDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Make's MovementDetailPanel: what the selected protocol tracks, how to place the camera, how
 * calibration works and what it measures, then the launch actions. Only a protocol that the app
 * can run (READY or BETA, resolved by the launch registry) gets Run demo and Start live camera;
 * a roadmap protocol shows that it is locked and lists only its own planned measurements.
 */
export function MovementDetail({ entry: e, savedAt, sharedWith, headingLevel = 2, panel, library, onDemo, onLive }: Props) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const launch = e.launch;
  return (
    <div
      className={`selected-movement-panel complete-detail ${library ? 'library-detail' : ''} status-${statusTone(e.status)}`}
      key={e.key}
      id={panel?.id}
      role={panel ? 'tabpanel' : undefined}
      aria-labelledby={panel?.labelledBy}
    >
      <div className="movement-detail-title">
        <span className="threshold-code">Selected protocol / {STATUS_NAME[e.status]}</span>
        <Heading>{e.title}</Heading>
        {e.tagline && <span className="movement-detail-tagline">{e.tagline}</span>}
        <p>{e.purpose}</p>
        {e.status === 'BETA' && launch && (
          <p className="movement-detail-note">Beta: uses the shared {e.primitive.name.toLowerCase()} analysis, which has not been tested with real cameras yet.</p>
        )}
      </div>
      <dl className="movement-detail-specs">
        <div className="movement-spec">
          <dt>Camera</dt>
          <dd>{e.camera}</dd>
        </div>
        <div className="movement-spec">
          <dt>Calibration</dt>
          {launch ? (
            <dd>
              {CALIBRATION_TARGET} reps at your normal tempo. A live set can finish after {MIN_CALIBRATION_REPS + 1}.
              {savedAt && <span className="movement-spec-saved">Saved baseline from {savedDate(savedAt)}, ready to reuse in a live set.</span>}
            </dd>
          ) : (
            <dd>None yet. This movement can’t be run.</dd>
          )}
        </div>
        <div className="movement-spec">
          <dt>{launch ? 'Measurements used' : 'Planned measurements'}</dt>
          <dd>{e.measures.join(' · ')}</dd>
        </div>
      </dl>
      <div className="movement-launch-actions">
        {launch ? (
          <>
            <button type="button" className="threshold-action movement-demo-action" onClick={() => onDemo(launch)}>
              Run demo
            </button>
            <button type="button" className="threshold-action violet-action" onClick={() => onLive(launch)}>
              Start live camera <span aria-hidden="true">↗</span>
            </button>
          </>
        ) : (
          <div className="locked-protocol-message">
            <span>Roadmap / {STATUS_NAME[e.status]}</span>
            <strong>Not available yet</strong>
            <small>No demo or live session for this movement.</small>
          </div>
        )}
      </div>
      {sharedWith && sharedWith.length > 0 && (
        <p className="movement-shared">
          <span>Same protocol in</span> {sharedWith.join(', ')}
        </p>
      )}
    </div>
  );
}
