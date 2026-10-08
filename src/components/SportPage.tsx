import { makeLabeler } from '../protocols/labels';
import { getSubSport, protocolRefs, resolveLaunch, type LaunchContext } from '../protocols/launch';
import { PRIMITIVES } from '../protocols/primitives';
import { PROTOCOLS, STATUS_LABEL, type ProtocolStatus } from '../protocols/protocols';
import type { SportProfile } from '../protocols/sports';
import { Camera, Lock, Play } from './Icons';
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
      <section className="section sport-page">
        <button className="btn ghost sm" onClick={onBack}>
          <span aria-hidden>‹</span> All sports
        </button>
        <div className="sport-hero">
          <span className="sport-icon big" aria-hidden>
            <SportIcon id={sport.icon} size={38} />
          </span>
          <div>
            {sub && <div className="eyebrow">{sport.name}</div>}
            <h1>{contextName}</h1>
            <p>Recommended movement screens for {sport.descriptor.toLowerCase()}.</p>
          </div>
        </div>
        {sport.subSports && sport.subSports.length > 0 && (
          <div className="seg subsport-seg" role="tablist" aria-label="Discipline">
            {sport.subSports.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === sub?.id} className={s.id === sub?.id ? 'active' : ''} onClick={() => onSubSport(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        {(sub?.note ?? sport.note) && <div className="panel note-panel">{sub?.note ?? sport.note}</div>}

        <ol className="briefings">
          {refs.map((ref) => {
            const p = PROTOCOLS[ref.protocolId];
            const ctx = resolveLaunch(sport.id, p.id, sub?.id);
            const prim = PRIMITIVES[p.primitive];
            const labels = ctx ? makeLabeler(ctx.exercise, ctx.featureLabels) : null;
            const metrics = ctx ? (ref.focus ?? p.metrics).map((k) => labels!.short(k)) : p.plannedMetrics ?? [];
            return (
              <li key={p.id} className={`panel briefing ${ctx ? '' : 'locked'}`}>
                <div>
                  <div className="b-head">
                    <span className={`status-badge ${STATUS_CLASS[p.status]}`}>
                      {!ctx && <Lock size={10} />}
                      {STATUS_LABEL[p.status]}
                    </span>
                    <span className="prim-tag" title={prim.description}>
                      {prim.name} primitive
                    </span>
                  </div>
                  <h3>{ref.title ?? p.name}</h3>
                  {ref.tagline && <div className="proto-tagline">{ref.tagline}</div>}
                  <p className="proto-purpose">{ref.purpose ?? p.purpose}</p>
                  <div className="proto-camera">
                    <Camera size={13} /> {p.camera}
                  </div>
                </div>
                <div>
                  <div className="proto-metrics-label">{ctx ? 'Measures' : 'Planned metrics'}</div>
                  <div className="metric-chips">
                    {metrics.map((m) => (
                      <span key={m} className={`metric-chip ${ctx ? '' : 'muted'}`}>
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="proto-actions">
                  {ctx ? (
                    <>
                      <button className="btn primary" onClick={() => onDemo(ctx)}>
                        <Play size={12} /> Run demo
                      </button>
                      <button className="btn" onClick={() => onLive(ctx)}>
                        <Camera size={14} /> Start live camera
                      </button>
                    </>
                  ) : (
                    <span className="proto-locked">
                      <Lock size={13} /> Not launchable yet
                    </span>
                  )}
                </div>
                {p.status === 'BETA' && ctx && <div className="proto-foot">Beta: shared {prim.name.toLowerCase()} primitive. Real-camera reliability is still being validated.</div>}
              </li>
            );
          })}
        </ol>

        <div className="shared-note">
          <b>One detector for every protocol.</b> The sport changes which repeatable movement is monitored and how it is described. The personal baseline and the
          Lab-calibrated sequential detector stay the same.{' '}
          <button className="link-btn" onClick={onLibrary}>
            Explore all protocols
          </button>
        </div>
      </section>
    </div>
  );
}
