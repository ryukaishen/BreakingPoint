// FORM CHANGES OVER TIME (component name kept as FormDrawdown): the athlete's
// Form Change Score (technical name: drift score) per rep, with the personal normal
// band, warning and alert levels, the smoothed EWMA trend line, the CUSUM strip used
// to estimate when the change began, and the alert rep.

import { useMemo, useState } from 'react';
import type { ExerciseType } from '../biomechanics/catalog';
import { useLabels } from '../protocols/labels';
import type { DriftThresholds } from '../detection/detector';
import type { RepRecord } from '../session/engine';
import { arrow, fmt, fmtSigma, STATE_COLOR, STATE_LABEL } from '../utils/format';
import { useSize } from '../utils/hooks';
import { C, FONT_DISPLAY } from '../ui/theme';

interface Props {
  reps: RepRecord[];
  thresholds: DriftThresholds | null;
  cusumH: number;
  /** Detector mode — the CUSUM strip is a trigger only for 'cusum' / 'combined'. */
  mode?: string;
  alarmRep: number | null;
  onsetRep: number | null;
  exercise: ExerciseType;
  selected?: number | null;
  onSelect?: (rep: number | null) => void;
  height?: number;
  compact?: boolean;
  minReps?: number;
}

export function FormDrawdown({
  reps, thresholds, cusumH, mode = 'combined', alarmRep, onsetRep, exercise, selected = null, onSelect, height = 230, compact = false, minReps = 14,
}: Props) {
  const cusumTriggers = mode === 'cusum' || mode === 'combined';
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const L = useLabels(exercise);
  const W = Math.max(280, size.width || 600);
  const H = height;
  const pad = { l: 46, r: 14, t: 12, b: 22 };
  const stripH = compact ? 0 : 30;
  const plotH = H - pad.t - pad.b - (stripH ? stripH + 12 : 0);
  const n = Math.max(minReps, reps.length);
  const xStep = (W - pad.l - pad.r) / n;
  const xc = (i: number) => pad.l + (i - 0.5) * xStep;

  const scores = reps.map((r) => r.drift?.score ?? null);
  // Focus the y-axis on the decision region; very tall bars are capped with a ▲ marker.
  const yMax = useMemo(() => {
    const vals = scores.filter((s): s is number => s !== null);
    const bp = thresholds ? thresholds.breakpointLevel : 2;
    const top = Math.min(Math.max(bp * 2.2, ...vals.map((v) => v * 1.08)), bp * 3.4);
    return Math.ceil(top * 2) / 2;
  }, [scores, thresholds]);
  const y = (v: number) => pad.t + plotH - (Math.max(0, Math.min(v, yMax)) / yMax) * plotH;
  const ticks = useMemo(() => {
    const step = yMax > 6 ? 2 : yMax > 3 ? 1 : 0.5;
    const out: number[] = [];
    for (let v = 0; v <= yMax + 1e-9; v += step) out.push(v);
    return out;
  }, [yMax]);

  const stripTop = pad.t + plotH + 12;
  const cMax = Math.max(cusumH * 1.4, ...reps.map((r) => r.step?.cusum ?? 0));
  const yc = (v: number) => stripTop + stripH - (Math.min(v, cMax) / cMax) * stripH;
  const barW = Math.max(4, Math.min(34, xStep * 0.6));

  const ewmaPts = reps.filter((r) => r.step).map((r) => `${xc(r.index)},${y(r.step!.ewmaLevel)}`);
  const cusumPts = reps.filter((r) => r.step).map((r) => `${xc(r.index)},${yc(r.step!.cusum)}`);
  const hr = hover !== null ? reps.find((r) => r.index === hover) : null;

  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Form changes over time: Form Change Score for each rep" style={{ display: 'block' }}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.line2} strokeWidth="2" />
          </pattern>
          <linearGradient id="postbp" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.break} stopOpacity="0.13" />
            <stop offset="100%" stopColor={C.break} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* grid + axis */}
        {!compact && (
          <text x={11} y={pad.t + plotH / 2} transform={`rotate(-90 11 ${pad.t + plotH / 2})`} textAnchor="middle" fontSize="10.5" fill={C.muted} fontFamily={FONT_DISPLAY}>
            Form Change Score
          </text>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={C.line} />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="11" fill={C.muted} fontFamily={FONT_DISPLAY}>
              {t % 1 ? t.toFixed(1) : t}
            </text>
          </g>
        ))}

        {thresholds && (
          <>
            <rect x={pad.l} y={y(thresholds.normalUpper)} width={W - pad.l - pad.r} height={y(0) - y(thresholds.normalUpper)} fill={C.stable} opacity="0.07" />
            {!compact && (
              <text x={pad.l + 6} y={y(0) - 5} fontSize="10.5" fill={C.stable} opacity="0.75" fontFamily={FONT_DISPLAY} letterSpacing="1">
                YOUR NORMAL RANGE
              </text>
            )}
          </>
        )}

        {alarmRep !== null && (
          <rect x={xc(alarmRep) - xStep / 2} y={pad.t} width={W - pad.r - (xc(alarmRep) - xStep / 2)} height={plotH} fill="url(#postbp)" />
        )}

        {/* bars */}
        {reps.map((r) => {
          const s = r.drift?.score ?? null;
          const col = r.step ? STATE_COLOR[r.step.state] : C.sys;
          const isSel = selected === r.index;
          const isHover = hover === r.index;
          if (s === null) {
            return (
              <g key={r.index}>
                <rect x={xc(r.index) - barW / 2} y={y(yMax * 0.25)} width={barW} height={y(0) - y(yMax * 0.25)} fill="url(#hatch)" rx="1.5" />
                <text x={xc(r.index)} y={y(yMax * 0.25) - 4} textAnchor="middle" fontSize="11" fill={C.muted}>×</text>
              </g>
            );
          }
          return (
            <g key={r.index}>
              <rect
                x={xc(r.index) - barW / 2}
                y={y(s)}
                width={barW}
                height={Math.max(2, y(0) - y(s))}
                rx="1.5"
                fill={col}
                opacity={isSel || isHover ? 0.95 : 0.62}
                stroke={isSel ? C.text : 'none'}
                strokeWidth={isSel ? 1.5 : 0}
              />
              {s > yMax && (
                <text x={xc(r.index)} y={pad.t + 9} textAnchor="middle" fontSize="10.5" fill={col} fontFamily={FONT_DISPLAY}>
                  ▲{s.toFixed(1)}
                </text>
              )}
            </g>
          );
        })}

        {thresholds && (
          <>
            <line x1={pad.l} x2={W - pad.r} y1={y(thresholds.warningLevel)} y2={y(thresholds.warningLevel)} stroke={C.drift} strokeDasharray="5 5" strokeWidth="1.3" />
            <line x1={pad.l} x2={W - pad.r} y1={y(thresholds.breakpointLevel)} y2={y(thresholds.breakpointLevel)} stroke={C.break} strokeDasharray="5 5" strokeWidth="1.3" />
            {!compact && (
              <>
                <text x={pad.l + 6} y={y(thresholds.breakpointLevel) - 5} textAnchor="start" fontSize="10.5" fill={C.drift} fontFamily={FONT_DISPLAY} letterSpacing="0.8" stroke={C.panel} strokeWidth="3" paintOrder="stroke">
                  WARNING {thresholds.warningLevel.toFixed(2)}
                </text>
                <text x={W - pad.r - 4} y={y(thresholds.breakpointLevel) - 5} textAnchor="end" fontSize="10.5" fill={C.break} fontFamily={FONT_DISPLAY} letterSpacing="0.8" stroke={C.panel} strokeWidth="3" paintOrder="stroke">
                  ALERT LINE {thresholds.breakpointLevel.toFixed(2)}
                </text>
              </>
            )}
          </>
        )}

        {ewmaPts.length > 1 && (
          <>
            <polyline points={ewmaPts.join(' ')} fill="none" stroke={C.text} strokeWidth="6" strokeLinejoin="round" opacity="0.12" />
            <polyline points={ewmaPts.join(' ')} fill="none" stroke={C.text} strokeWidth="2.4" strokeLinejoin="round" />
          </>
        )}
        {reps.filter((r) => r.step).map((r) => (
          <circle key={r.index} cx={xc(r.index)} cy={y(r.step!.ewmaLevel)} r="3.2" fill={STATE_COLOR[r.step!.state]} stroke={C.panel} strokeWidth="1.5" />
        ))}

        {onsetRep !== null && alarmRep !== null && onsetRep < alarmRep && (
          <g>
            <line x1={xc(onsetRep) - xStep / 2} x2={xc(onsetRep) - xStep / 2} y1={pad.t} y2={pad.t + plotH} stroke={C.violet} strokeDasharray="3 4" strokeWidth="1.4" />
            {!compact && (
              <text x={xc(onsetRep) - xStep / 2 + 4} y={pad.t + 10} fontSize="10.5" fill={C.violet} fontFamily={FONT_DISPLAY} letterSpacing="0.5">
                changes began, about rep {onsetRep}
              </text>
            )}
          </g>
        )}
        {alarmRep !== null && (
          <g>
            <line x1={xc(alarmRep)} x2={xc(alarmRep)} y1={pad.t} y2={pad.t + plotH} stroke={C.break} strokeWidth="2.2" />
            <rect x={xc(alarmRep) + 5} y={pad.t + (compact ? 2 : 16)} width={compact ? 92 : 148} height={compact ? 16 : 18} rx="2" fill={C.break} />
            <text x={xc(alarmRep) + 11} y={pad.t + (compact ? 14 : 29)} fontSize={compact ? 9.5 : 10.5} fontWeight="700" fill={C.void} fontFamily={FONT_DISPLAY}>
              {compact ? `BREAK · REP ${alarmRep}` : `BREAKING POINT · REP ${alarmRep}`}
            </text>
          </g>
        )}

        {/* CUSUM evidence strip */}
        {stripH > 0 && (
          <g>
            <rect x={pad.l} y={stripTop} width={W - pad.l - pad.r} height={stripH} fill={C.abyss} stroke={C.line} rx="2" />
            {cusumPts.length > 0 && (
              <polygon points={`${xc(reps.find((r) => r.step)!.index)},${stripTop + stripH} ${cusumPts.join(' ')} ${xc(reps.filter((r) => r.step).slice(-1)[0].index)},${stripTop + stripH}`} fill={C.violet} opacity="0.25" />
            )}
            {cusumPts.length > 1 && <polyline points={cusumPts.join(' ')} fill="none" stroke={C.violet} strokeWidth="1.5" />}
            {cusumTriggers && <line x1={pad.l} x2={W - pad.r} y1={yc(cusumH)} y2={yc(cusumH)} stroke={C.violet} strokeDasharray="3 3" opacity="0.7" />}
            <text x={pad.l - 3} y={stripTop + stripH / 2 + 3} textAnchor="end" fontSize="10.5" fill={C.violet} fontFamily={FONT_DISPLAY}>
              CUSUM
            </text>
            <text x={W - pad.r - 6} y={stripTop + 10} textAnchor="end" fontSize="11" fill={C.violet} fontFamily={FONT_DISPLAY}>
              {cusumTriggers ? `build-up of change · alert at h = ${fmt(cusumH, 1)}` : 'build-up of change · used to estimate when changes began'}
            </text>
          </g>
        )}

        {/* x labels + hit areas */}
        {Array.from({ length: n }, (_, k) => k + 1).map((i) => (
          <g key={i}>
            <text x={xc(i)} y={H - 6} textAnchor="middle" fontSize="11" fill={i === alarmRep ? C.break : C.muted} fontWeight={i === alarmRep ? 700 : 400} fontFamily={FONT_DISPLAY}>
              {i}
            </text>
            {i <= reps.length && (
              <rect
                x={xc(i) - xStep / 2}
                y={pad.t}
                width={xStep}
                height={H - pad.t}
                fill="transparent"
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(selected === i ? null : i)}
              />
            )}
          </g>
        ))}
        {reps.length === 0 && (
          <text x={(W + pad.l) / 2} y={pad.t + plotH / 2} textAnchor="middle" fontSize="12.5" fill={C.muted}>
            Waiting for the first monitored rep…
          </text>
        )}
      </svg>
      {hr && !compact && (
        <div className="tooltip" style={{ left: Math.min(W - 200, Math.max(0, xc(hr.index) + 14)), top: 8 }}>
          <div className="t">
            <span>Rep {hr.index}</span>
            {hr.step && <span style={{ color: STATE_COLOR[hr.step.state] }}>{STATE_LABEL[hr.step.state]}</span>}
          </div>
          <div className="r"><span>Form Change Score</span><span className="mono">{fmt(hr.drift?.score)}</span></div>
          <div className="r"><span>Trend (EWMA)</span><span className="mono">{fmt(hr.step?.ewmaLevel)}</span></div>
          <div className="r"><span>Build-up (CUSUM)</span><span className="mono">{fmt(hr.step?.cusum)}</span></div>
          {hr.drift?.ranked.slice(0, 3).map((d) => (
            <div className="r" key={d.key}>
              <span>{L.short(d.key)}</span>
              <span className="mono">{fmtSigma(d.zClipped)} {arrow(d.zClipped ?? 0)}</span>
            </div>
          ))}
          {hr.drift?.score === null && <div className="r"><span>Not scored: the camera view was too poor</span></div>}
          <div className="r" style={{ marginTop: 4, color: C.muted }}><span>Click for full measurements</span></div>
        </div>
      )}
    </div>
  );
}
