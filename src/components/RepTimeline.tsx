import type { RepRecord } from '../session/engine';
import { C } from '../ui/theme';
import { STATE_COLOR, STATE_LABEL } from '../utils/format';

interface Props {
  reps: RepRecord[];
  alarmRep: number | null;
  selected: number | null;
  onSelect: (rep: number | null) => void;
  maxScore: number;
}

export function RepTimeline({ reps, alarmRep, selected, onSelect, maxScore }: Props) {
  return (
    <div className="timeline-row">
      <div className="tl-label" aria-hidden>
        Reps
      </div>
      {reps.length === 0 ? (
        <div className="tl-empty">Reps appear here as they are detected. Select a rep to inspect its measurements.</div>
      ) : (
        <ul className="timeline" aria-label="Monitored reps">
          {reps.map((r) => {
            const s = r.drift?.score ?? null;
            const col = r.step ? STATE_COLOR[r.step.state] : C.sys;
            const h = s === null ? 4 : Math.max(3, Math.min(20, (s / Math.max(maxScore, 1e-6)) * 20));
            const label = `Rep ${r.index}${s !== null ? `, drift ${s.toFixed(2)}` : ', not scored'}${r.step ? `, ${STATE_LABEL[r.step.state].toLowerCase()}` : ''}${alarmRep === r.index ? ', breaking point' : ''}`;
            return (
              <li key={r.index}>
                <button
                  className={`tl-cell ${selected === r.index ? 'selected' : ''} ${alarmRep === r.index ? 'bp' : ''}`}
                  onClick={() => onSelect(selected === r.index ? null : r.index)}
                  aria-pressed={selected === r.index}
                  aria-label={label}
                  title={label}
                >
                  <span className="tl-n">{r.index}</span>
                  <span className="tl-bar-wrap">
                    <span className="tl-bar" style={{ height: h, background: s === null ? C.line2 : col }} />
                  </span>
                  <span className="tl-d">{s === null ? '—' : s.toFixed(1)}</span>
                  {alarmRep === r.index && (
                    <span className="tl-mark" aria-hidden>
                      ▲
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
