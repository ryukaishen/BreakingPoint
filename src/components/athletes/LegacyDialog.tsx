import { useState } from 'react';
import { PROTOCOLS } from '../../protocols/protocols';
import type { AthleteProfile, LegacyBaseline } from '../../data/types';
import { useDialog } from '../../utils/hooks';
import { Close } from '../Icons';

interface Props {
  items: LegacyBaseline[];
  athletes: AthleteProfile[];
  onAssign: (legacyId: string, athleteId: string) => void;
  onDiscard: (legacyId: string) => void;
  onClose: () => void;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown date' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/** Version 1 baselines had no owner. The user decides whose each one is, or discards it. */
export function LegacyDialog({ items, athletes, onAssign, onDiscard, onClose }: Props) {
  const ref = useDialog<HTMLDivElement>(onClose);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sys-window" style={{ width: 'min(640px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="legacy-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="legacy-title">Baselines from an earlier version</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>
        <div className="modal-body col" style={{ gap: 14 }}>
          <p className="prose" style={{ margin: 0 }}>
            The previous version saved one baseline per movement without recording whose it was. Choose the athlete each one belongs to, or discard it.
            Nothing is assigned until you choose.
          </p>
          {items.length === 0 && <p className="muted">All earlier baselines have been handled.</p>}
          {items.map((l) => {
            const target = choice[l.id] ?? '';
            return (
              <div key={l.id} className="panel legacy-row">
                <div>
                  <div className="legacy-title">{PROTOCOLS[l.protocolId]?.name ?? l.exercise}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Saved {fmtDate(l.createdAt)}
                    {l.savedName ? ` under the name "${l.savedName}"` : ''} · {l.baseline.nReps} calibration reps
                  </div>
                </div>
                <div className="legacy-actions">
                  <label className="visually-hidden" htmlFor={`legacy-${l.id}`}>
                    Athlete
                  </label>
                  <select id={`legacy-${l.id}`} className="field-input" value={target} onChange={(e) => setChoice({ ...choice, [l.id]: e.target.value })}>
                    <option value="">Choose athlete…</option>
                    {athletes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn primary sm" disabled={!target} onClick={() => onAssign(l.id, target)}>
                    Assign
                  </button>
                  <button className="btn ghost sm" onClick={() => setConfirmDiscard(l.id)}>
                    Discard
                  </button>
                </div>
                {confirmDiscard === l.id && (
                  <div className="legacy-confirm" role="alert">
                    <span>Discard this baseline? This can’t be undone.</span>
                    <button className="btn sm" onClick={() => setConfirmDiscard(null)}>
                      Keep it
                    </button>
                    <button
                      className="btn danger sm"
                      onClick={() => {
                        setConfirmDiscard(null);
                        onDiscard(l.id);
                      }}
                    >
                      Discard
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
