import { makeLabeler } from '../protocols/labels';
import { getSubSport, protocolRefs, resolveLaunch, type LaunchContext } from '../protocols/launch';
import { PRIMITIVES } from '../protocols/primitives';
import { PROTOCOLS, STATUS_LABEL, type ProtocolStatus } from '../protocols/protocols';
import type { SportProfile } from '../protocols/sports';
import { Camera, Play } from './Icons';
import { SportIcon } from './SportIcons';

interface Props {
  sport: SportProfile;
  subSportId?: string;
  onSubSport: (id: string) => void;
  onBack: () => void;
  onDemo: (ctx: LaunchContext) => void;
  onLive: (ctx: LaunchContext) => void;
  onLibrary: () => void;
}

const STATUS_CLASS: Record<ProtocolStatus, string> = { READY: 'ready', BETA: 'beta', COMING_SOON: 'soon', FUTURE: 'future' };

export function SportPage({ sport, subSportId, onSubSport, onBack, onDemo, onLive, onLibrary }: Props) {
  const sub = getSubSport(sport, subSportId);
  const refs = protocolRefs(sport, sub?.id);
  const contextName = sub?.name ?? sport.name;
  return (
    <div className="landing">
      <section className="sport-page">
        <button className="btn ghost sm" onClick={onBack}>
          ← All sports
        </button>
        <div className="sport-hero">
          <span className="sport-icon big">
            <SportIcon id={sport.icon} size={40} />
          </span>
          <div>
            <div className="eyebrow">{sport.name}{sub ? ` · ${sub.name}` : ''}</div>
            <h1>{contextName}</h1>
            <p className="muted">Recommended movement screens · {sport.descriptor.toLowerCase()}</p>
          </div>
        </div>
        {sport.subSports && sport.subSports.length > 0 && (
          <div className="seg subsport-seg" role="tablist" aria-label="Discipline">
            {sport.subSports.map((s) => (
              <button key={s.id} className={s.id === sub?.id ? 'active' : ''} onClick={() => onSubSport(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        {(sub?.note ?? sport.note) && <div className="panel note-panel">{sub?.note ?? sport.note}</div>}

        <div className="proto-grid">
          {refs.map((ref) => {
            const p = PROTOCOLS[ref.protocolId];
            const ctx = resolveLaunch(sport.id, p.id, sub?.id);
            const prim = PRIMITIVES[p.primitive];
            const labels = ctx ? makeLabeler(ctx.exercise, ctx.featureLabels) : null;
            const metrics = ctx ? (ref.focus ?? p.metrics).map((k) => labels!.short(k)) : p.plannedMetrics ?? [];
            return (
              <div key={p.id} className={`proto-card ${ctx ? '' : 'disabled'}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className={`status-badge ${STATUS_CLASS[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  <span className="prim-tag" title={prim.description}>
                    {prim.id.replace(/_/g, ' ')} primitive
                  </span>
                </div>
                <h3>{ref.title ?? p.name}</h3>
                {ref.tagline && <div className="proto-tagline">{ref.tagline}</div>}
                <p className="proto-purpose">{ref.purpose ?? p.purpose}</p>
                <div className="proto-camera">
                  <Camera size={13} /> {p.camera}
                </div>
                <div className="proto-metrics-label">{ctx ? 'Measures' : 'Planned metrics'}</div>
                <div className="metric-chips">
                  {metrics.map((m) => (
                    <span key={m} className={`metric-chip ${ctx ? '' : 'muted'}`}>
                      {m}
                    </span>
                  ))}
                </div>
                <div className="proto-actions">
                  {ctx ? (
                    <>
                      <button className="btn primary" onClick={() => onDemo(ctx)}>
                        <Play size={13} /> Run demo
                      </button>
                      <button className="btn" onClick={() => onLive(ctx)}>
                        <Camera size={14} /> Start live camera
                      </button>
                    </>
                  ) : (
                    <button className="btn" disabled>
                      {STATUS_LABEL[p.status]}
                    </button>
                  )}
                </div>
                {p.status === 'BETA' && ctx && <div className="proto-foot">Beta · shared {prim.name.toLowerCase()} primitive; real-camera reliability is still being validated.</div>}
              </div>
            );
          })}
        </div>

        <div className="shared-note">
          <b>One detector for every protocol.</b> The sport changes which repeatable movement is monitored and how it is described — the personal baseline and
          the Lab-calibrated sequential detector (BreakingPoint Lab Monte-Carlo validation) stay the same.{' '}
          <button className="link-btn" onClick={onLibrary}>
            Explore all protocols →
          </button>
        </div>
      </section>
    </div>
  );
}
