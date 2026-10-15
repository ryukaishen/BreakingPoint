import { useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import { compareWithEarlier, filterHistory, historyEntries, historyMovements, relativeDay } from '../../data/history';
import { heldOutcome } from '../../data/progress';
import type { SessionRecord } from '../../data/types';
import type { DetectorConfig } from '../../detection/config';
import { makeLabeler, type FeatureLabeler } from '../../protocols/labels';
import type { SessionPhase } from '../../session/engine';
import { postSetFromRecord, recoveryModel, type PostSection, type PostSet, type RecoveryState } from '../../session/postWorkout';
import type { HistoryEmpty } from './HistoryPanel';
import { HistoryPanel } from './HistoryPanel';
import { PostWorkoutSystem } from './PostWorkoutSystem';
import { RecoveryPanel } from './RecoveryPanel';
import { SummaryPanel } from './SummaryPanel';
import '../../styles-threshold-post.css';

/** The set this session just finished (session context only). */
export interface CurrentSet {
  set: PostSet;
  phase: SessionPhase;
  liveScores: (number | null)[];
  restSince: number | null;
  labels: FeatureLabeler;
  exports: { onJson: () => void; onCsv: () => void };
}

interface Props {
  code: string;
  section: PostSection;
  onSection: (s: PostSection) => void;
  headingRef?: Ref<HTMLHeadingElement>;
  headerActions?: ReactNode;
  onExit: () => void;
  exitLabel?: string;
  /** Null outside a session: Recovery and Summary then follow the set selected in History. */
  current: CurrentSet | null;
  /** Live recovery check: what the camera sees. */
  capture?: { label: string; problem: string | null } | null;
  recoveryActions?: (state: RecoveryState, set: PostSet) => ReactNode;
  summaryActions?: ReactNode;
  history: {
    scope: 'real' | 'sample';
    onScope: ((s: 'real' | 'sample') => void) | null;
    athleteName: string | null;
    records: SessionRecord[];
    config: DetectorConfig;
    /** The set to select first (the one just saved). */
    preferredId: string | null;
    empty: HistoryEmpty | null;
  };
}

export function PostWorkout(p: Props) {
  const h = p.history;
  const now = useMemo(() => new Date(), [h.records]);
  const entries = useMemo(() => historyEntries(h.records), [h.records]);
  const movements = useMemo(() => historyMovements(entries), [entries]);
  const [movement, setMovement] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(h.preferredId);
  const [compare, setCompare] = useState(false);

  // A different athlete or scope: start from the newest set again.
  const scopeKey = `${h.scope}:${h.athleteName ?? ''}`;
  useEffect(() => {
    setMovement(null);
    setSelectedId(h.preferredId);
    setCompare(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
  useEffect(() => {
    if (h.preferredId) setSelectedId(h.preferredId);
  }, [h.preferredId]);

  const shown = useMemo(() => filterHistory(entries, movement && movements.some((m) => m.protocolId === movement) ? movement : null), [entries, movement, movements]);
  const selected = shown.find((e) => e.record.id === selectedId)?.record ?? shown[0]?.record ?? null;
  const selectedSet = useMemo(
    () => (selected ? postSetFromRecord(selected, h.athleteName ?? 'Athlete', h.config, heldOutcome(h.records, selected)) : null),
    [selected, h.athleteName, h.config, h.records],
  );
  const comparison = useMemo(() => (selected ? compareWithEarlier(h.records, selected) : null), [selected, h.records]);

  // Recovery and Summary: this session's set, or the stored set selected in History.
  const subject = p.current?.set ?? selectedSet;
  const labels = p.current?.labels ?? (selectedSet ? makeLabeler(selectedSet.exercise, selectedSet.launch?.featureLabels) : null);
  const recoveryInput = subject
    ? { set: subject, phase: p.current ? p.current.phase : null, liveScores: p.current?.liveScores ?? [] }
    : null;
  const recoveryState = recoveryInput ? recoveryModel({ ...recoveryInput, restSeconds: 0 }).state : null;
  const recordKind = !subject ? '' : subject.origin === 'session' ? (subject.source === 'demo' ? 'Demo dataset' : 'Live session') : subject.source === 'demo' ? 'Saved demo set' : 'Saved set';
  const when = subject?.endedAt ? (subject.origin === 'session' ? 'just now' : relativeDay(subject.endedAt, now).toLowerCase()) : '';
  const noSet = (
    <section className="history-empty-state post-no-set">
      <span className="threshold-code">{h.empty ? h.empty.code : 'No set selected'}</span>
      <h3>{h.empty ? h.empty.title : 'Choose a set in History'}</h3>
      <p>{h.empty ? h.empty.text : 'Recovery and the set summary follow the set you select in History.'}</p>
      {h.empty?.actions && <div className="history-empty-actions">{h.empty.actions}</div>}
    </section>
  );

  return (
    <PostWorkoutSystem
      code={p.code}
      section={p.section}
      onSection={p.onSection}
      headingRef={p.headingRef}
      headerActions={p.headerActions}
      onExit={p.onExit}
      exitLabel={p.exitLabel}
    >
      {p.section === 'recovery' &&
        (subject && recoveryInput ? (
          <RecoveryPanel
            input={recoveryInput}
            restSince={p.current?.restSince ?? null}
            code={`Original baseline / ${subject.title}`}
            capture={p.current && (p.current.phase === 'recovery') ? p.capture : null}
            actions={(state) => p.recoveryActions?.(state, subject)}
          />
        ) : (
          noSet
        ))}
      {p.section === 'summary' &&
        (subject && labels && recoveryState ? (
          <SummaryPanel
            set={subject}
            labels={labels}
            recordKind={recordKind}
            when={when}
            recoveryState={recoveryState}
            exports={p.current?.exports ?? null}
            actions={p.summaryActions}
          />
        ) : (
          noSet
        ))}
      {p.section === 'history' && (
        <HistoryPanel
          scope={h.scope}
          onScope={h.onScope}
          athleteName={h.athleteName}
          entries={shown}
          movements={movements}
          movement={movement}
          onMovement={(m) => {
            setMovement(m);
            setSelectedId(null);
          }}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          selected={selectedSet}
          compare={compare}
          onCompare={() => setCompare((c) => !c)}
          comparison={comparison}
          empty={h.empty}
          now={now}
        />
      )}
    </PostWorkoutSystem>
  );
}
