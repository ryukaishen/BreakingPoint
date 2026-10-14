import { useEffect, useId, useMemo, useState } from 'react';
import type { RecoveryStatus } from '../../detection/recovery';
import { buildStaircase } from '../../data/staircase';
import type { StoredBaseline, SessionRecord } from '../../data/types';
import type { DataScope } from '../../data/useAthleteData';
import type { LaunchContext } from '../../protocols/launch';
import { resolveLaunch } from '../../protocols/launch';
import { RecordStaircase } from '../progress/RecordStaircase';
import { SystemNav } from '../system/SystemNav';
import { SystemNotice } from '../system/SystemNotice';
import { TechnicalCorners } from '../system/TechnicalCorners';
import { deriveStatus } from './statusModel';

export interface StatusViewProps {
  scope: DataScope;
  athleteName: string | null;
  sessions: readonly SessionRecord[];
  baselines: readonly StoredBaseline[];
  persistent: boolean;
  onAddAthlete: () => void;
  onBrowse: () => void;
  onOpenSport: (sportId: string, subSportId?: string) => void;
  onLive: (ctx: LaunchContext) => void;
  onDemo: (ctx: LaunchContext) => void;
  onResearch: () => void;
  onAthletes: () => void;
}

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function when(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : shortDate.format(date);
}

function recoveryWords(status: RecoveryStatus): string {
  if (status === 'recovered') return 'Back to your usual form';
  if (status === 'partial') return 'Partly back';
  return 'Still different';
}

export function StatusView(p: StatusViewProps) {
  const titleId = useId();
  const measureId = useId();
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const athleteKey = `${p.scope}:${p.athleteName ?? ''}`;

  useEffect(() => {
    setSelectedProtocolId(null);
  }, [athleteKey]);

  const model = useMemo(
    () => deriveStatus({ sessions: p.sessions, baselines: p.baselines, selectedProtocolId }),
    [p.sessions, p.baselines, selectedProtocolId],
  );
  const selected = model.selected;
  const chart = useMemo(() => (selected ? buildStaircase(p.sessions, selected.protocolId) : null), [p.sessions, selected]);
  const launch = selected?.sportId ? resolveLaunch(selected.sportId, selected.protocolId, selected.subSportId) : null;

  const start = () => {
    if (!p.athleteName && p.scope === 'real') {
      p.onAddAthlete();
      return;
    }
    if (launch && p.scope === 'sample') p.onDemo(launch);
    else if (launch) p.onLive(launch);
    else p.onBrowse();
  };

  const noAthlete = p.scope === 'real' && !p.athleteName;
  const startLabel = noAthlete ? 'Add athlete' : launch && p.scope === 'sample' ? 'Run the demo' : launch ? 'Start live camera' : 'Choose a movement';
  const hasMetric = model.hero.held !== null;

  const railLabel = p.scope === 'sample' ? 'SAMPLE RECORD · IN MEMORY ONLY' : 'STORED RECORD';
  const baselineLine = model.baseline.saved
    ? `Baseline saved ${when(model.baseline.savedAt)} · ${model.baseline.nReps ?? 0} fresh reps${model.baseline.countsTowardRecords ? '' : ' · too variable to count toward records'}`
    : 'No saved baseline: the next set starts with calibration';

  return (
    <div className="st-page">
      <div className="threshold-environment" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <SystemNav current="status" onEntry={p.onBrowse} onStatus={() => {}} onAthletes={p.onAthletes} onResearch={p.onResearch} />

      <main className="threshold-canvas" id="main" tabIndex={-1}>
        <section className="system-stage">
          <div className="system-backplane plane-a" aria-hidden="true" />
          <div className="system-backplane plane-b" aria-hidden="true" />
          <div className="system-frame">
            <div className="system-rail rail-top">
              <i />
              <span>{railLabel}</span>
              <i />
            </div>
            <TechnicalCorners />
            <div className="system-stage-grid">
              <section className="threshold-status" aria-labelledby={titleId}>
                {noAthlete || !selected ? (
                  <div className="status-empty">
                    <h1 id={titleId}>{noAthlete ? 'No athlete on this device' : p.athleteName}</h1>
                    {!noAthlete && <p className="status-empty__status">No sets yet</p>}
                    <p>
                      {noAthlete
                        ? 'Add an athlete to record sets. Sets, baselines and records stay on this device.'
                        : `Sets you record for ${p.athleteName} on this device appear here.`}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="status-heading">
                      <span className="threshold-code">{hasMetric ? 'LATEST COUNTED SET' : 'NO COUNTED SET'}</span>
                      <h1 id={titleId}>{p.athleteName}</h1>
                    </div>
                    <div className="status-core">
                      <div className="status-number">
                        {hasMetric ? (
                          <strong className="st-numeral st-hero__value" aria-labelledby={measureId}>
                            {String(model.hero.held)}
                          </strong>
                        ) : (
                          <strong className="status-pending" aria-labelledby={measureId}>
                            No counted set yet
                          </strong>
                        )}
                        <span className="st-measure" id={measureId}>
                          Reps at your usual form
                        </span>
                      </div>
                      <div className="status-context">
                        <span>{hasMetric ? when(model.hero.startedAt) : 'Not yet'}</span>
                        <strong>{selected.contextName}</strong>
                        <p>{selected.title}</p>
                      </div>
                    </div>
                    <div className="status-rule">
                      <i />
                      <span>{baselineLine}</span>
                      <i />
                    </div>
                    <div className="status-details">
                      <div>
                        <span>Estimated change</span>
                        <strong>{model.latest?.onsetRep ? `Around rep ${model.latest.onsetRep}` : model.latest ? 'Not estimated' : 'No completed set'}</strong>
                      </div>
                      <div>
                        <span>Alert</span>
                        <strong>{model.latest?.breakpointRep ? `Rep ${model.latest.breakpointRep}` : model.latest ? 'No alert' : 'No completed set'}</strong>
                      </div>
                    </div>
                    {selected.availability === 'BETA' && <p className="status-note">Beta. Rep counting for this movement has not been checked on real camera footage.</p>}
                    {(model.newerSetUncounted || (model.latest && !model.latest.eligible && !hasMetric)) && model.latest && (
                      <SystemNotice variant="attention" title={hasMetric ? 'Latest set did not count' : 'No counted set yet'} label="Set quality">
                        <p>
                          {model.latest.reasons[0] ?? 'It did not pass the record quality floor.'}
                          {hasMetric ? ' The number above comes from the latest set that did.' : ''}
                        </p>
                      </SystemNotice>
                    )}
                  </>
                )}
              </section>

              <section className="threshold-chart st-chart" aria-label="Record line">
                {model.movements.length > 1 && (
                  <div className="st-move" role="group" aria-label="Movements with stored sets">
                    {model.movements.map((movement) => (
                      <button
                        key={movement.protocolId}
                        type="button"
                        aria-pressed={movement.protocolId === selected?.protocolId}
                        onClick={() => setSelectedProtocolId(movement.protocolId)}
                      >
                        {movement.contextName}
                      </button>
                    ))}
                  </div>
                )}
                {chart && chart.sessions.length > 0 ? (
                  <RecordStaircase model={chart} headingLevel={2} limeRecord={p.scope === 'real'} />
                ) : (
                  <div className="st-chart__empty">
                    <h2>Record line</h2>
                    <p>Your first counted set starts the record line.</p>
                  </div>
                )}
              </section>
            </div>

            <div className="system-lower st-telemetry">
              <div>
                <span>Protocol</span>
                <strong>{selected ? selected.title : 'None selected'}</strong>
                <small>{selected ? `${selected.contextName}${selected.availability === 'BETA' ? ' · beta' : ''}` : noAthlete ? 'Add an athlete first' : 'Choose a movement'}</small>
              </div>
              <div>
                <span>Recovery</span>
                <strong>
                  {model.latest?.recoveryPercent === null || model.latest?.recoveryPercent === undefined
                    ? 'No recovery check'
                    : `${Math.round(model.latest.recoveryPercent * 100)}%`}
                </strong>
                <small>
                  {model.latest?.recoveryStatus
                    ? `${recoveryWords(model.latest.recoveryStatus)} · ${Math.round((model.latest.recoveryPercent ?? 0) * 100)}% of the change gone`
                    : 'Optional after an alert, once you have rested.'}
                </small>
              </div>
              <div>
                <span>Stored sets</span>
                <strong className="num">{model.storedSets}</strong>
                <small>
                  {model.storedSets === 0
                    ? 'None yet'
                    : model.countedSets === model.storedSets
                      ? `${model.countedSets} counted toward records`
                      : `${model.countedSets} of ${model.storedSets} counted toward records`}
                </small>
              </div>
              <div className="system-lower__action">
                <button type="button" className="cyan-action st-go" onClick={start}>
                  {startLabel}
                </button>
                {selected?.sportId && (
                  <button type="button" className="lower-link" onClick={() => p.onOpenSport(selected.sportId!, selected.subSportId)}>
                    Open {selected.contextName}
                  </button>
                )}
              </div>
            </div>
            <div className="system-rail rail-bottom">
              <i />
              <span>{p.persistent ? 'On-device records · video is never uploaded' : 'Browser storage is unavailable, so sets last only for this visit.'}</span>
              <i />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
