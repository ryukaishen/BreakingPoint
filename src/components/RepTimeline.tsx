import type { RepRecord } from '../session/engine';
import { STATE_COLOR } from '../utils/format';

interface Props {
  reps: RepRecord[];
  alarmRep: number | null;
  selected: number | null;
  onSelect: (rep: number | null) => void;
  maxScore: number;
}

export function RepTimeline({ reps, alarmRep, selected, onSelect, maxScore }: Props) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 6 }}>
      <div className="tl-label">REPS</div>
      <div className="timeline" role="list">
        {reps.length === 0 && <div className="tl-empty">Reps appear here as they are detected. Click a rep to inspect its measurements.</div>}
        {reps.map((r) => {
          const s = r.drift?.score ?? null;
          const col = r.step ? STATE_COLOR[r.step.state] : '#59d0ff';
          const h = s === null ? 4 : Math.max(3, Math.min(20, (s / Math.max(maxScore, 1e-6)) * 20));
          return (
            <div
              key={r.index}
              role="listitem"
              className={`tl-cell ${selected === r.index ? 'selected' : ''} ${alarmRep === r.index ? 'bp' : ''}`}
              onClick={() => onSelect(selected === r.index ? null : r.index)}
              title={`Rep ${r.index}${s !== null ? ` · drift ${s.toFixed(2)}` : ' · not scored'}`}
            >
              <span className="tl-n">{r.index}</span>
              <span className="tl-bar-wrap">
                <span className="tl-bar" style={{ height: h, background: s === null ? '#3a4558' : col }} />
              </span>
              <span className="tl-d">{s === null ? '—' : s.toFixed(1)}</span>
              {alarmRep === r.index && <span className="tl-mark">▲</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
