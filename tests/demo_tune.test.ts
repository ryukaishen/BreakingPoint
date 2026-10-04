// Re-tunes the demo presets (seed + fatigue-effect scale) for the currently installed detector config.
// Searches only the deterministic synthetic demo data; the detector config is read, never modified.
// Run:  DEMO_TUNE=1 npx vitest run tests/demo_tune.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MovementState } from '../src/detection/detector';
import { parseDetectorConfig } from '../src/detection/config';
import { SessionEngine } from '../src/session/engine';
import { DemoController } from '../src/demo/demoController';

type Story = { name: string; states: MovementState[]; alarm: number };
const S: MovementState = 'STABLE';
const D: MovementState = 'DRIFT';
const B: MovementState = 'BREAKPOINT';
const STORIES: Story[] = [
  { name: 'exact: 1-8 S, 9 D, 10 B', states: [S, S, S, S, S, S, S, S, D, B], alarm: 10 },
  { name: 'A: 1-7 S, 8-9 D, 10 B', states: [S, S, S, S, S, S, S, D, D, B], alarm: 10 },
  { name: 'B: 1-8 S, 9-10 D, 11 B', states: [S, S, S, S, S, S, S, S, D, D, B], alarm: 11 },
];

it.skipIf(!process.env.DEMO_TUNE)('search demo seeds', () => {
  const cfg = parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')));
  const exercises = (process.env.DEMO_TUNE_EX ?? 'squat,cmj,lunge').split(',') as ('squat' | 'cmj' | 'lunge')[];
  const maxSeed = Number(process.env.DEMO_TUNE_SEEDS ?? 120);
  const effects = [0.35, 0.45, 0.55, 0.65, 0.8, 1.0, 1.2];
  for (const ex of exercises) {
    const found: Record<string, string[]> = Object.fromEntries(STORIES.map((s) => [s.name, []]));
    for (const effect of effects) {
      for (let seed = 1; seed <= maxSeed; seed++) {
        const engine = new SessionEngine(ex, cfg, 'Adam', 'demo');
        new DemoController(engine, ex, 16 / 9, seed, effect).runToEnd(true);
        const s = engine.getSnapshot();
        if (s.monitorReps.length !== 14 || s.calibrationReps.length !== 6 || s.recoveryReps.length !== 3) continue;
        const st = s.monitorReps.map((r) => r.step!);
        const Dsc = s.monitorReps.map((r) => r.drift?.score ?? 0);
        for (const story of STORIES) {
          const ok = story.states.every((x, i) => st[i].state === x) && s.alarmRep === story.alarm;
          if (!ok || s.onsetRep === null || s.onsetRep < 6 || s.onsetRep > 8) continue;
          // margin: distance of each decisive EWMA value from the threshold it must clear / stay under
          const lastStable = story.states.lastIndexOf(S);
          const margins = [cfg.warningThreshold - Math.max(...st.slice(0, lastStable + 1).map((x) => x.ewma))];
          for (let i = lastStable + 1; i < story.alarm - 1; i++) margins.push(st[i].ewma - cfg.warningThreshold, cfg.breakpointThreshold - st[i].ewma);
          margins.push(st[story.alarm - 1].ewma - cfg.breakpointThreshold);
          const rising = Dsc[6] > Math.max(...Dsc.slice(0, 6)) && Dsc[7] > Dsc[6];
          found[story.name].push(
            `${ex} effect=${effect} seed=${seed} margin=${Math.min(...margins).toFixed(3)} rising=${rising} onset=${s.onsetRep} ` +
              `rec=${s.recovery?.status}:${s.recovery?.percent.toFixed(2)} D=${Dsc.map((d) => d.toFixed(2)).join(' ')}`,
          );
        }
      }
    }
    for (const story of STORIES) {
      const list = found[story.name].sort((a, b) => parseFloat(b.split('margin=')[1]) - parseFloat(a.split('margin=')[1]));
      console.log(`\n${ex} · ${story.name}: ${list.length} candidates\n` + list.slice(0, 6).join('\n'));
    }
  }
}, 1_800_000);
