import { useEffect, useRef, type CSSProperties } from 'react';
import { statusLabel, type StairSession, type StaircaseModel } from '../../data/staircase';
import { useScrollable } from '../../utils/useScrollable';
import '../../ui/numerals.css';
import './RecordStaircase.css';

interface Props {
  model: StaircaseModel;
  /** Where the title sits in the page outline. */
  headingLevel?: 2 | 3;
}

// Geometry in SVG user units. The chart scrolls sideways on narrow screens instead of shrinking its text.
const SKEW = Math.tan((12 * Math.PI) / 180); // the system's 12° cut
const M = { l: 40, r: 128, t: 34, b: 44 };
const PLOT_H = 220;
const COL = 60;
const BAR = 30;

const vars = (v: Record<string, string | number>) => v as CSSProperties;
const shortDate = (iso: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));

const CLASS: Record<StairSession['status'], string> = {
  first: 'is-first',
  record: 'is-record',
  matched: 'is-held',
  below: 'is-held',
  'not-counted': 'is-void',
};

/**
 * The record line over time. Bars are reps held at baseline for every session; the
 * staircase is the running record. A session that raised the record is a solid bar with
 * a cap and a diamond where it meets the line; every other session is an outlined bar at
 * full contrast, so nothing is merely "dimmed"; a session that did not count is dashed.
 * Every bar carries its value as text. Lime is used only for the newest session when it
 * is a genuine new record.
 */
export function RecordStaircase({ model, headingLevel = 2 }: Props) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  const { sessions, record, yMax } = model;
  const n = sessions.length;
  const scroller = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(scroller);
  // On a narrow screen the chart scrolls sideways. Start at the newest sessions: those are the ones that matter.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [n]);

  if (n === 0) {
    return (
      <section className="rs" aria-labelledby="rs-title">
        <Heading id="rs-title">Record line</Heading>
        <p className="rs-empty">No sessions yet. Your first set that counts draws the first step of your record line.</p>
      </section>
    );
  }

  const plotW = Math.max(n * COL, 360);
  const W = M.l + plotW + M.r;
  const H = M.t + PLOT_H + M.b;
  const slot = plotW / n;
  const base = M.t + PLOT_H;
  const y = (v: number) => base - (v / yMax) * PLOT_H;
  const cx = (i: number) => M.l + (i + 0.5) * slot;
  /** Where a point at height `py` ends up once the 12° lean is applied around the baseline. */
  const lean = (x: number, py: number) => x + SKEW * (base - py);

  // The staircase: the running record across sessions that count, stepping at slot boundaries.
  const counted = sessions.map((s, i) => ({ s, i })).filter((e) => e.s.status !== 'not-counted');
  let d = '';
  counted.forEach((e, k) => {
    const left = M.l + e.i * slot;
    const level = y(e.s.best);
    d += k === 0 ? `M ${left} ${level}` : ` H ${left} V ${level}`;
  });
  if (counted.length) d += ` H ${M.l + plotW}`;
  const recordY = record ? y(record.value) : null;
  const latest = sessions[n - 1];
  const latestRecord = model.latestIsRecord;
  const labelEvery = n > 12 ? 2 : 1;

  const summary = record
    ? `${record.value} reps held at your baseline is your record, set ${shortDate(record.at)}. ${n} session${n === 1 ? '' : 's'}${model.omitted ? `, the latest ${n} of ${n + model.omitted}` : ''}.`
    : `${n} session${n === 1 ? '' : 's'}, none yet counted toward records.`;

  return (
    <figure className="rs" aria-labelledby="rs-title">
      <figcaption className="rs-head">
        <Heading id="rs-title">Record line</Heading>
        <p className="rs-summary">{summary}</p>
      </figcaption>

      <div
        className="rs-scroll"
        ref={scroller}
        {...(scrollable ? { role: 'region', tabIndex: 0, 'aria-label': 'Record line chart. Scroll sideways for earlier sessions.' } : {})}
      >
        <svg className="rs-svg" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, 720) }} role="img" aria-label={summary} focusable="false">
          {/* grid and axis */}
          {model.yTicks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'rs-axis' : 'rs-grid'} x1={M.l} x2={M.l + plotW} y1={y(t)} y2={y(t)} />
              <text className="rs-ytick num" x={M.l - 8} y={y(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}

          {/* bars and the staircase share one lean, so the risers lean too */}
          <g transform={`translate(0 ${base}) skewX(-12) translate(0 ${-base})`}>
            {sessions.map((s, i) => {
              const isLatestRecord = latestRecord && s.sessionId === latest.sessionId;
              const h = Math.max(2, base - y(s.held));
              return (
                <g key={s.sessionId} className={`rs-bar ${CLASS[s.status]}${isLatestRecord ? ' is-new' : ''}`} style={vars({ '--i': i })}>
                  <rect className="rs-body" x={cx(i) - BAR / 2} y={base - h} width={BAR} height={h} />
                  {s.status === 'record' && <rect className="rs-cap" x={cx(i) - BAR / 2} y={base - h} width={BAR} height={6} />}
                </g>
              );
            })}
            {d && <path className="rs-line" d={d} fill="none" />}
          </g>

          {/* markers and labels sit upright, at the leaned positions of the bar tops */}
          {sessions.map((s, i) => {
            const top = y(s.held);
            const px = lean(cx(i), top);
            const isLatestRecord = latestRecord && s.sessionId === latest.sessionId;
            return (
              <g key={s.sessionId} className={`rs-mark ${CLASS[s.status]}${isLatestRecord ? ' is-new' : ''}`}>
                {(s.status === 'record' || s.status === 'first') && <path className="rs-diamond" d={`M ${px} ${top - 17} l 6 6 l -6 6 l -6 -6 z`} />}
                <text className="rs-val num" x={px} y={top - (s.status === 'record' || s.status === 'first' ? 22 : 8)} textAnchor="middle">
                  {s.held}
                </text>
                {(i % labelEvery === 0 || i === n - 1) && (
                  <text className="rs-xlabel" x={cx(i)} y={base + 20} textAnchor="middle">
                    {shortDate(s.at)}
                  </text>
                )}
              </g>
            );
          })}

          {recordY !== null && record && (
            <text className="rs-record-label" x={lean(M.l + plotW, recordY) + 12} y={recordY + 4}>
              Record <tspan className="num">{record.value}</tspan>
            </text>
          )}
        </svg>
      </div>

      <ul className="rs-legend">
        <li>
          <i className="rs-sw is-record" /> New record
        </li>
        <li>
          <i className="rs-sw is-held" /> Held below your record
        </li>
        {sessions.some((s) => s.status === 'not-counted') && (
          <li>
            <i className="rs-sw is-void" /> Did not count toward records
          </li>
        )}
        <li>
          <i className="rs-sw rs-sw-line" /> Your record line
        </li>
        {latestRecord && (
          <li>
            <i className="rs-sw is-record is-new" /> Newest record
          </li>
        )}
      </ul>

      {/* A table ignores width and overflow, so it cannot hide itself: the block wrapper does the clipping. */}
      <div className="visually-hidden">
      <table>
        <caption>Reps held at baseline by session, with your record after each. {summary}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Reps held</th>
            <th scope="col">Record after</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.sessionId}>
              <th scope="row">{shortDate(s.at)}</th>
              <td>{s.held}</td>
              <td>{s.status === 'not-counted' ? 'unchanged' : s.best}</td>
              <td>{statusLabel(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
