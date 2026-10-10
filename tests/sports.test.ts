// Sport → protocol → primitive configuration layer.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { featureSpecs } from '../src/biomechanics/catalog';
import { DEFAULT_DETECTOR_CONFIG, parseDetectorConfig, serializeDetectorConfig } from '../src/detection/config';
import { DemoController } from '../src/demo/demoController';
import { allProtocolEntries, DEMO_CONTEXTS, resolveDemo, resolveLaunch } from '../src/protocols/launch';
import { sessionPattern } from '../src/protocols/patterns';
import { PRIMITIVES } from '../src/protocols/primitives';
import { canLaunch, PROTOCOLS } from '../src/protocols/protocols';
import { SPORTS } from '../src/protocols/sports';
import { SessionEngine } from '../src/session/engine';

const shippedRaw = existsSync('public/breakingpoint_detector_config.json')
  ? (JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')) as Record<string, unknown>)
  : null;
const shipped = shippedRaw ? parseDetectorConfig(shippedRaw) : DEFAULT_DETECTOR_CONFIG;

function runDemo(id: string) {
  const ctx = resolveDemo(id);
  if (!ctx) throw new Error(`demo context ${id} not launchable`);
  const engine = new SessionEngine(ctx.exercise, shipped, 'Adam', 'demo');
  new DemoController(engine, ctx.exercise).runToEnd(false);
  return { ctx, s: engine.getSnapshot() };
}

describe('1. sport profile configuration', () => {
  it('loads every sport with unique ids and valid protocol references', () => {
    const ids = SPORTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['soccer', 'basketball', 'volleyball', 'racquet', 'strength', 'martial']) {
      expect(SPORTS.find((s) => s.id === id)?.tier).toBe('primary');
    }
    for (const { ref } of allProtocolEntries()) expect(PROTOCOLS[ref.protocolId]).toBeDefined();
    for (const s of SPORTS) expect(s.protocols.length + (s.subSports?.length ?? 0)).toBeGreaterThan(0);
  });

  it('analysable protocols only reference features that their primitive actually measures', () => {
    for (const { protocol, ref } of allProtocolEntries()) {
      if (!canLaunch(protocol)) continue;
      const engine = PRIMITIVES[protocol.primitive].engine!;
      const measured = new Set(featureSpecs(engine).map((f) => f.key));
      for (const k of protocol.metrics) expect(measured.has(k)).toBe(true);
      for (const k of ref.focus ?? []) expect(measured.has(k)).toBe(true);
    }
  });

  it('racquet sports share one lunge protocol across pickleball, tennis and badminton', () => {
    for (const sub of ['pickleball', 'tennis', 'badminton']) {
      const ctx = resolveLaunch('racquet', 'lunge-forward', sub);
      expect(ctx?.primitive.id).toBe('FORWARD_LUNGE');
      expect(ctx?.exercise).toBe('lunge');
      expect(ctx?.status).toBe('BETA');
    }
  });
});

describe('2. READY sports reference implemented protocols', () => {
  it('every READY / BETA entry resolves to an implemented engine', () => {
    for (const { sport, sub, protocol } of allProtocolEntries()) {
      if (protocol.status !== 'READY' && protocol.status !== 'BETA') continue;
      const ctx = resolveLaunch(sport.id, protocol.id, sub?.id);
      expect(ctx, `${sport.id}/${sub?.id}/${protocol.id}`).not.toBeNull();
      expect(['squat', 'cmj', 'lunge']).toContain(ctx!.exercise);
    }
  });
  it('soccer, basketball, volleyball and strength each have a READY protocol', () => {
    for (const id of ['soccer', 'basketball', 'volleyball', 'strength']) {
      const sport = SPORTS.find((s) => s.id === id)!;
      expect(sport.protocols.some((r) => PROTOCOLS[r.protocolId].status === 'READY')).toBe(true);
    }
  });
});

describe('3. roadmap protocols cannot launch analysis', () => {
  it('COMING_SOON / FUTURE protocols never resolve to a runnable context', () => {
    let roadmap = 0;
    for (const { sport, sub, protocol } of allProtocolEntries()) {
      if (protocol.status === 'COMING_SOON' || protocol.status === 'FUTURE') {
        roadmap++;
        expect(canLaunch(protocol)).toBe(false);
        expect(resolveLaunch(sport.id, protocol.id, sub?.id)).toBeNull();
      }
    }
    expect(roadmap).toBeGreaterThan(10);
  });
  it('status gates launch even when the primitive itself is implemented (approach jump)', () => {
    expect(PROTOCOLS['jump-approach'].primitive).toBe('JUMP_AND_LAND');
    expect(resolveLaunch('volleyball', 'jump-approach')).toBeNull();
  });
  it('a protocol cannot be launched from a sport that does not list it', () => {
    expect(resolveLaunch('soccer', 'squat-bodyweight')).toBeNull();
    expect(resolveLaunch('nope', 'jump-repeated')).toBeNull();
  });
});

describe('4-6. jump sports share the existing jump-and-land primitive', () => {
  const soccer = resolveLaunch('soccer', 'jump-repeated')!;
  const basketball = resolveLaunch('basketball', 'jump-repeated')!;
  const volleyball = resolveLaunch('volleyball', 'jump-repeated')!;
  it('4. soccer CMJ uses the existing CMJ engine', () => {
    expect(soccer.primitive.id).toBe('JUMP_AND_LAND');
    expect(soccer.exercise).toBe('cmj');
    expect(soccer.title).toBe('Explosive Jump Check');
  });
  it('5. basketball repeated jump uses the same primitive', () => {
    expect(basketball.primitive).toBe(soccer.primitive);
    expect(basketball.exercise).toBe('cmj');
  });
  it('6. volleyball repeated jump uses the same primitive', () => {
    expect(volleyball.primitive).toBe(soccer.primitive);
    expect(volleyball.exercise).toBe('cmj');
  });
});

describe('7. sport selection does not modify detector thresholds', () => {
  it('sport profiles carry no detector parameters', () => {
    const text = JSON.stringify(SPORTS).toLowerCase();
    for (const banned of ['ewma', 'cusum', 'threshold', 'alpha', 'outlier']) expect(text.includes(banned)).toBe(false);
  });
  it('every launchable context runs with the identical detector config', () => {
    const ref = JSON.stringify(serializeDetectorConfig(shipped));
    for (const { sport, sub, protocol } of allProtocolEntries()) {
      const ctx = resolveLaunch(sport.id, protocol.id, sub?.id);
      if (!ctx) continue;
      const engine = new SessionEngine(ctx.exercise, shipped, 'Adam', 'demo');
      expect(engine.getSnapshot().config).toBe(shipped);
      expect(JSON.stringify(serializeDetectorConfig(engine.getSnapshot().config))).toBe(ref);
    }
  });
});

describe('8. demo contexts still fire at the expected point', () => {
  it.each(DEMO_CONTEXTS.map((d) => d.id))('%s demo: breaking point at rep 10', (id) => {
    const { s } = runDemo(id);
    expect(s.monitorReps.length).toBe(14);
    expect(s.alarmRep).toBe(10);
  });
  it('same primitive ⇒ same real pipeline output (soccer and volleyball)', () => {
    const a = runDemo('soccer').s.monitorReps.map((r) => r.drift?.score);
    const b = runDemo('volleyball').s.monitorReps.map((r) => r.drift?.score);
    expect(b).toEqual(a);
  });
});

describe('9. the Lab-exported (HiPerGator pipeline) config is respected', () => {
  it.skipIf(!shippedRaw)('loaded parameters equal the exported JSON and drive the thresholds', () => {
    const raw = shippedRaw!;
    expect(shipped.source).toContain('BreakingPoint Lab');
    expect(shipped.mode).toBe(raw.mode);
    expect(shipped.ewmaAlpha).toBe(raw.ewma_alpha);
    expect(shipped.breakpointThreshold).toBe(raw.breakpoint_threshold);
    expect(shipped.warningThreshold).toBe(raw.warning_threshold);
    expect(shipped.minimumPersistentReps).toBe(raw.minimum_persistent_reps);
    const { s } = runDemo('soccer');
    const { mu0, sigma0 } = s.baseline!.reference;
    expect(s.thresholds!.breakpointLevel).toBeCloseTo(mu0 + (raw.breakpoint_threshold as number) * sigma0, 12);
    expect(s.thresholds!.warningLevel).toBeCloseTo(mu0 + (raw.warning_threshold as number) * sigma0, 12);
  });
});

describe('drift-pattern labels (descriptive, non-medical)', () => {
  it('derive from the data; sports only rename them', () => {
    const soccer = runDemo('soccer');
    const p = sessionPattern('cmj', soccer.s.monitorReps, soccer.s.onsetRep, soccer.s.baseline?.reference.sigma0, soccer.ctx.patternLabels);
    expect(p?.id).toBe('explosive');
    expect(p?.label).toBe('EXPLOSIVE OUTPUT DROPPING');
    const bb = resolveLaunch('basketball', 'jump-repeated')!;
    const p2 = sessionPattern('cmj', soccer.s.monitorReps, soccer.s.onsetRep, soccer.s.baseline?.reference.sigma0, bb.patternLabels);
    expect(p2?.id).toBe('explosive');
    expect(p2?.label).toBe('JUMP CONSISTENCY CHANGING');
  });
  it('labels never use diagnostic language', () => {
    const text = JSON.stringify([SPORTS, PROTOCOLS]).toLowerCase();
    for (const banned of ['acl', 'injury risk', 'tendon', 'concussion', 'overtraining', 'diagnos']) expect(text.includes(banned)).toBe(false);
  });
});
