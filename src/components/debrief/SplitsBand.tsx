import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cellLabel, type SplitCell, type SplitLane, type SplitsModel } from '../../data/splits';
import { useScrollable } from '../../utils/useScrollable';
import '../../ui/numerals.css';
import './SplitsBand.css';

interface Props {
  model: SplitsModel;
  /** Where the title sits in the page outline; the debrief decides. */
  headingLevel?: 2 | 3;
  /** Play the rep-by-rep replay on mount and when Replay is pressed. Reduced motion always shows the final state. */
  replay?: boolean;
  /**
   * Show a NEW RECORD tag inside the band. Off by default: lime appears once on a screen, and the debrief's
   * result slab already carries the tag. Turn on only where the band stands alone.
   */
  recordTag?: boolean;
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

const GLYPH: Record<string, string> = { break: '✕', unscored: '·' };

function Cell({ cell, i }: { cell: SplitCell | undefined; i: number }) {
  if (!cell) {
    return (
      <span className="sb-cell is-none" style={vars({ '--i': i })}>
        <i />
      </span>
    );
  }
  return (
    <span className={`sb-cell s-${cell.state}${cell.afterWarning ? ' is-after' : ''}`} style={vars({ '--i': i })}>
      <i>
        <b>{GLYPH[cell.state] ?? ''}</b>
      </i>
    </span>
  );
}

function Lane({ lane, slots, record }: { lane: SplitLane; slots: number; record?: boolean }) {
  return (
    <div className={`sb-lane${record ? ' is-record' : ''}`}>
      <div className="sb-gutter">
        <span className="sb-lane-label">{lane.label}</span>
      </div>
      <div className="sb-cells" style={vars({ '--n': slots, '--held': lane.held })}>
        {Array.from({ length: slots }, (_, i) => (
          <Cell key={i} cell={lane.cells[i]} i={i} />
        ))}
        <i className="sb-held" aria-hidden />
      </div>
      <div className="sb-end">
        <b className="num">{lane.held}</b>
        <small>held</small>
      </div>
    </div>
  );
}

/**
 * The record-line replay: this set against your best earlier set, one column per rep.
 * Every state is shown by pattern and glyph as well as colour (solid, hatched, crossed,
 * outlined), both lanes keep full contrast, and the chart has a text alternative.
 * Lime appears only when the set is a genuine new record.
 */
export function SplitsBand({ model, headingLevel = 2, replay = true, recordTag = false }: Props) {
  const [run, setRun] = useState(0);
  const reduced = usePrefersReducedMotion();
  const chart = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(chart);
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  const { today, best, slots, outcome } = model;
  const newRecord = outcome.kind === 'new-record';
  const play = replay && !reduced;
  const tickEvery = slots > 24 ? 5 : 1;
  const hasAfter = [today, best].some((l) => l?.cells.some((c) => c.afterWarning));
  const hasUnscored = [today, best].some((l) => l?.cells.some((c) => c.state === 'unscored'));

  if (slots === 0) {
    return (
      <section className="splits" aria-labelledby="splits-title">
        <Heading id="splits-title">Rep by rep</Heading>
        <p className="sb-empty">No reps were measured in this set.</p>
      </section>
    );
  }

  return (
    <section className="splits" aria-labelledby="splits-title" data-record={newRecord || undefined}>
      <header className="sb-head">
        <div>
          <Heading id="splits-title">{best ? 'Rep by rep against your best' : 'Rep by rep'}</Heading>
          <p className="sb-headline">{model.headline}</p>
          {model.note && <p className="sb-note">{model.note}</p>}
        </div>
        {play && (
          <button type="button" className="btn ghost sm sb-replay" onClick={() => setRun((r) => r + 1)}>
            Replay
          </button>
        )}
      </header>

      {/* The drawing is hidden from assistive tech (the table below replaces it), except when it scrolls: then it must be focusable, so it is exposed as a labelled region. */}
      <div
        className="sb-chart"
        key={run}
        ref={chart}
        data-play={play || undefined}
        {...(scrollable ? { role: 'region', tabIndex: 0, 'aria-label': 'Rep by rep chart. Scroll sideways to see every rep.' } : { 'aria-hidden': true })}
      >
        <div className="sb-axis">
          <span className="sb-gutter" />
          <div className="sb-cells" style={vars({ '--n': slots })}>
            {Array.from({ length: slots }, (_, i) => (
              <span key={i} className="sb-tick num">
                {(i + 1) % tickEvery === 0 || i === 0 ? i + 1 : ''}
              </span>
            ))}
          </div>
          <span className="sb-end" />
        </div>
        <Lane lane={today} slots={slots} record={newRecord} />
        {best && <Lane lane={best} slots={slots} />}
        {newRecord && recordTag && <span className="sb-tag">New record</span>}
      </div>

      <ul className="sb-legend">
        <li>
          <i className="sb-sw s-stable" /> At baseline
        </li>
        <li>
          <i className="sb-sw s-drift" /> Drift
        </li>
        <li>
          <i className="sb-sw s-break">
            <b>{GLYPH.break}</b>
          </i>{' '}
          Breaking point
        </li>
        {hasAfter && (
          <li>
            <i className="sb-sw s-drift is-after" /> After the warning, not counted
          </li>
        )}
        {hasUnscored && (
          <li>
            <i className="sb-sw s-unscored" /> Not scored (capture too poor)
          </li>
        )}
        <li>
          <i className="sb-sw sb-held-sw" /> End of the held run
        </li>
      </ul>

      <dl className="sb-facts">
        {model.rows.map((r) => (
          <div key={r.id} className="sb-fact">
            <dt>{r.label}</dt>
            <dd>
              <span className="num sb-fact-v">{r.today}</span>
              {r.best !== null && (
                <span className="sb-vs">
                  Best set: {r.best}
                  {r.delta !== null && ` (${r.delta === 'same' ? 'the same' : r.delta})`}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/* A table ignores width and overflow, so it cannot hide itself: the block wrapper does the clipping. */}
      <div className="visually-hidden">
      <table>
        <caption>
          Rep by rep, {best ? `this set and ${best.label.toLowerCase()}` : 'this set'}. {model.headline}
        </caption>
        <thead>
          <tr>
            <th scope="col">Rep</th>
            <th scope="col">{today.label}</th>
            {best && <th scope="col">{best.label}</th>}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: slots }, (_, i) => (
            <tr key={i}>
              <th scope="row">{i + 1}</th>
              <td>{cellLabel(today.cells[i])}</td>
              {best && <td>{cellLabel(best.cells[i])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
