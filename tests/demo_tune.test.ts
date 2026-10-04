// Re-tunes the demo presets for the currently installed detector config.
// Run:  DEMO_TUNE=1 npx vitest run tests/demo_tune.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDetectorConfig } from '../src/detection/config';
import { SessionEngine } from '../src/session/engine';
import { DemoController } from '../src/demo/demoController';

it.skipIf(!process.env.DEMO_TUNE)('search demo seeds', () => {
  const cfg = parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')));
  for (const ex of ['squat', 'cmj'] as const) {
    const found: string[] = [];
    for (const effect of [0.35, 0.45, 0.55, 0.65, 0.8, 1.0]) {
      for (let seed = 1; seed <= 60; seed++) {
        const engine = new SessionEngine(ex, cfg, 'Adam', 'demo');
        const demo = new DemoController(engine, ex, 16 / 9, seed, effect);
        demo.runToEnd(true);
        const s = engine.getSnapshot();
        if (s.monitorReps.length !== 14 || s.calibrationReps.length !== 6 || s.recoveryReps.length !== 3) continue;
        const st = s.monitorReps.map((r) => r.step!);
        const ok = st.slice(0, 8).every((x) => x.state === 'STABLE') && st[8].state === 'DRIFT' && st[9].state === 'BREAKPOINT' && s.alarmRep === 10;
        if (!ok) continue;
        const D = s.monitorReps.map((r) => r.drift?.score ?? 0);
        const fresh = Math.max(...st.slice(0, 6).map((x) => x.ewma));
        const m8 = cfg.warningThreshold - st[7].ewma;
        const m9 = cfg.breakpointThreshold - st[8].ewma;
        const m10 = st[9].ewma - cfg.breakpointThreshold;
        const rising = D[6] > Math.max(...D.slice(0, 6)) && D[7] > D[6];
        const margin = Math.min(m8, m9, m10, cfg.warningThreshold - fresh);
        found.push(`${ex} effect=${effect} seed=${seed} margin=${margin.toFixed(3)} rising=${rising} onset=${s.onsetRep} rec=${s.recovery?.status}:${s.recovery?.percent.toFixed(2)} D=${D.map((d) => d.toFixed(2)).join(' ')}`);
      }
    }
    found.sort((a, b) => parseFloat(b.split('margin=')[1]) - parseFloat(a.split('margin=')[1]));
    console.log(`\n${ex}: ${found.length} candidates\n` + found.slice(0, 8).join('\n'));
  }
}, 600000);
