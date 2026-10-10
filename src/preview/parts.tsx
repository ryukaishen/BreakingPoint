// Dev-only reference page for the Breakaway building blocks (docs/preview/breakaway-parts.html).
// Shows the rep-by-rep band and the record staircase inside the layouts the approved board
// describes, fed by the sample athlete's history (real pipeline output, synthetic athlete).
// It is also the reference for how the debrief and progress screens should compose them:
// the warning and the next step stay prominent above the replay, and each screen has ONE
// hero numeral.

import '@fontsource-variable/mona-sans/standard.css';
import '@fontsource-variable/anybody/standard-italic.css';
import { createRoot } from 'react-dom/client';
import { SplitsBand } from '../components/debrief/SplitsBand';
import { RecordStaircase } from '../components/progress/RecordStaircase';
import { createSampleRepository, SAMPLE_ATHLETE_ID } from '../data/sample';
import { buildSplits } from '../data/splits';
import { buildStaircase } from '../data/staircase';
import { heldOutcome } from '../data/progress';
import type { SessionRecord } from '../data/types';
import '../styles.css';
import '../styles-platform.css';
import '../ui/numerals.css';
import './parts.css';

const history = createSampleRepository().sessions(SAMPLE_ATHLETE_ID, 'jump-repeated');
const kindOf = (rec: SessionRecord) => heldOutcome(history, rec).kind;

/** Preview-only variations, labelled as such. */
const withAfterWarning = (rec: SessionRecord): SessionRecord => {
  const reps = rec.reps.map((r, i, a) => (i >= a.length - 2 ? { ...r, afterWarning: true } : r));
  reps[1] = { ...reps[1], state: null, score: null, ewma: null };
  return { ...rec, reps };
};

const latest = history[history.length - 1];
const scenarios: { title: string; rec: SessionRecord; hist: SessionRecord[] }[] = [
  { title: 'New record', rec: [...history].reverse().find((s) => kindOf(s) === 'new-record') ?? latest, hist: history },
  { title: 'Matched or below your best', rec: history.find((s, i) => i > 1 && ['matched', 'below'].includes(kindOf(s))) ?? latest, hist: history },
  { title: 'First set that counts', rec: history[0], hist: history },
  { title: 'Not eligible (capture quality)', rec: { ...latest, quality: { ...latest.quality, eligible: false, reasons: ['Capture quality too low'] } }, hist: history },
  { title: 'Reps after the warning, and an unscored rep (preview data)', rec: withAfterWarning(latest), hist: history },
];

const when = (iso: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));

function Debrief({ title, rec, hist }: (typeof scenarios)[number]) {
  const model = buildSplits(hist, rec);
  const record = model.outcome.kind === 'new-record';
  return (
    <section className="pv-block" aria-label={title}>
      <p className="pv-title">{title}</p>
      <article className="pv-debrief">
        <div className={`pv-slab${record ? ' is-record' : ''}`}>
          <span className="num-hero pv-hero" style={{ ['--num-hero-size' as string]: 'clamp(96px, 14vw, 180px)' }}>
            {rec.heldReps}
          </span>
          <div className="pv-what">
            <b>reps held at your baseline</b>
            <small>
              {when(rec.startedAt)}
              {model.outcome.previousBest !== null ? `, previous best ${model.outcome.previousBest}` : ''}
            </small>
          </div>
          {record && <span className="pv-newrec">New record</span>}
        </div>

        {rec.breakpointRep !== null && (
          <div className="pv-warn sys-window toned tone-break">
            <div>
              <h3>Breaking point at rep {rec.breakpointRep}</h3>
              <p>Your movement changed from your baseline around rep {rec.onsetRep}. End here, take a recovery period, then run the check.</p>
            </div>
            <button className="btn primary lg">Start recovery check</button>
          </div>
        )}

        <SplitsBand model={model} headingLevel={2} />
      </article>
    </section>
  );
}

function Progress() {
  const stair = buildStaircase(history, 'jump-repeated');
  const first = stair.sessions.find((s) => s.status === 'first');
  return (
    <section className="pv-block" aria-label="Progress">
      <p className="pv-title">Progress</p>
      <article className="pv-progress">
        <aside className="pv-pb">
          <span className="pv-pb-label">Most reps held at your baseline</span>
          <span className="num-hero pv-hero" style={{ ['--num-hero-size' as string]: 'clamp(96px, 12vw, 150px)' }}>
            {stair.record?.value ?? 0}
          </span>
          <span className="pv-pb-sub">
            {stair.record ? `Set ${when(stair.record.at)}` : ''}
            {first && stair.record ? `, up from ${first.held} on ${when(first.at)}` : ''}
          </span>
        </aside>
        <RecordStaircase model={stair} headingLevel={2} />
      </article>
      <p className="pv-title">Progress with a session that did not count, and a newest session that matched</p>
      <article className="pv-progress pv-progress-solo">
        <RecordStaircase
          model={buildStaircase(
            [
              ...history.slice(0, 6),
              { ...history[6], id: 'preview_void', quality: { ...history[6].quality, eligible: false, reasons: ['Capture quality too low'] }, heldReps: history[6].heldReps + 4 },
              ...history.slice(7),
            ],
            'jump-repeated',
          )}
          headingLevel={2}
        />
      </article>
    </section>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <main className="pv-page" id="main">
    <h1>Breakaway building blocks</h1>
    <p className="pv-note">
      Sample data, synthetic athlete: real pipeline output, and none of it reaches a real athlete's records. Dev-only reference for the debrief and progress screens.
    </p>
    {scenarios.map((s) => (
      <Debrief key={s.title} {...s} />
    ))}
    <Progress />
  </main>,
);
