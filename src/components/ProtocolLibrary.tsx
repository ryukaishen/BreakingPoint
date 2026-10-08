import { allProtocolEntries } from '../protocols/launch';
import { PRIMITIVES, type PrimitiveId } from '../protocols/primitives';
import { canLaunch, STATUS_GLYPH, type ProtocolStatus } from '../protocols/protocols';
import { SPORTS, type SportContextDef, type SportProfile } from '../protocols/sports';
import { useDialog } from '../utils/hooks';
import { Close, Lock } from './Icons';
import { SportIcon } from './SportIcons';

interface Props {
  onClose: () => void;
  onOpenSport: (sportId: string, subSportId?: string) => void;
}

const GLYPH_CLASS: Record<ProtocolStatus, string> = { READY: 'ready', BETA: 'beta', COMING_SOON: 'soon', FUTURE: 'soon' };
const PRIM_STATUS: Record<string, string> = { implemented: 'ready', beta: 'beta', roadmap: 'soon' };

export function ProtocolLibrary({ onClose, onOpenSport }: Props) {
  const entries = allProtocolEntries();
  // primitive → sport contexts using it today (ready/beta) vs planned (roadmap protocols)
  const active = new Map<PrimitiveId, Set<string>>();
  const planned = new Map<PrimitiveId, Set<string>>();
  for (const e of entries) {
    const target = canLaunch(e.protocol) ? active : planned;
    const set = target.get(e.protocol.primitive) ?? new Set<string>();
    set.add(e.sub?.name ?? e.sport.name);
    target.set(e.protocol.primitive, set);
  }
  const usage = new Set<PrimitiveId>([...active.keys(), ...planned.keys()]);
  const primitiveOrder: PrimitiveId[] = ['JUMP_AND_LAND', 'FORWARD_LUNGE', 'SQUAT', 'LATERAL_MOVEMENT', 'SINGLE_LEG_HOP', 'GAIT_CYCLE', 'HIP_HINGE', 'STRIKE_STEP', 'KICK'];
  type Ctx = { sport: SportProfile; sub?: SportContextDef };
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const contexts = SPORTS.flatMap((sport): Ctx[] => (sport.subSports?.length ? sport.subSports.map((sub) => ({ sport, sub })) : [{ sport }]));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sys-window" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="library-title" tabIndex={-1} ref={dialogRef}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">Many sports, a few movement primitives, one detector</div>
            <h2 id="library-title">Movement protocol library</h2>
          </div>
          <div className="row">
            <span className="legend-glyphs">
              <span className="glyph ready">✓</span> Ready <span className="glyph beta">△</span> Beta <span className="glyph soon">○</span> Roadmap
            </span>
            <button className="btn ghost" onClick={onClose} aria-label="Close">
              <Close />
            </button>
          </div>
        </div>
        <div className="modal-body col" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-title">Movement primitives → sports</div>
            <div className="prim-map">
              {primitiveOrder
                .filter((id) => usage.has(id))
                .map((id) => {
                  const p = PRIMITIVES[id];
                  const now = [...(active.get(id) ?? [])];
                  const later = [...(planned.get(id) ?? [])].filter((x) => !now.includes(x));
                  return (
                    <div key={id} className="prim-row">
                      <span className={`prim-pill ${PRIM_STATUS[p.status]}`} title={p.description}>
                        {id}
                      </span>
                      <span className="prim-arrow">→</span>
                      <span className="prim-sports">
                        {now.join(', ')}
                        {later.length > 0 && (
                          <span className="dim">
                            {now.length ? ' / ' : ''}planned: {later.join(', ')}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              A new sport does not mean a new model: a sport selects a protocol on a reusable primitive, plus terminology and featured metrics. The personal
              baseline and the sequential detector are shared.
            </div>
          </div>

          <div className="lib-grid">
            {contexts.map(({ sport, sub }) => (
              <button key={`${sport.id}-${sub?.id ?? ''}`} className="lib-sport" onClick={() => onOpenSport(sport.id, sub?.id)}>
                <div className="row" style={{ gap: 8 }}>
                  <SportIcon id={sport.icon} size={18} />
                  <b>{sub?.name ?? sport.name}</b>
                </div>
                {(sub ?? sport).protocols.map((ref) => {
                  const e = entries.find((x) => x.sport.id === sport.id && x.sub?.id === sub?.id && x.ref === ref)!;
                  return (
                    <div key={ref.protocolId} className="lib-item">
                      <span className={`glyph ${GLYPH_CLASS[e.protocol.status]}`}>{STATUS_GLYPH[e.protocol.status]}</span>
                      {ref.title && e.protocol.status !== 'COMING_SOON' && e.protocol.status !== 'FUTURE' ? ref.title : e.protocol.name}
                    </div>
                  );
                })}
              </button>
            ))}
          </div>

          <div className="locked-card">
            <div className="lc-head">
              <span className="lc-title">
                <Lock size={14} /> Create your own protocol
              </span>
              <span className="status-badge soon">Roadmap</span>
            </div>
            <p style={{ color: 'var(--text-2)' }}>Teach BreakingPoint a repeatable movement.</p>
            <ol className="custom-steps">
              <li>A coach records several clean repetitions of any repeatable movement.</li>
              <li>BreakingPoint segments the repetitions.</li>
              <li>It learns the athlete's personal movement distribution and builds a baseline.</li>
              <li>Future repetitions are monitored for persistent drift by the same validated detector.</li>
            </ol>
            <p>Not implemented yet. Learning arbitrary movements is roadmap work.</p>
          </div>
          <div className="disclaimer">
            Detector validation (BreakingPoint Lab) evaluates detector behaviour under controlled synthetic movement drift. Sport-specific clinical validation is future
            work. BreakingPoint provides training information and is not a medical diagnosis.
          </div>
        </div>
      </div>
    </div>
  );
}
