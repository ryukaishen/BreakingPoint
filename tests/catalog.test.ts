// The sport page and protocol library read everything from the registry through catalog.ts.
import { describe, expect, it } from 'vitest';
import { defaultEntry, movementEntries, sharedContexts, sportEntries, sportPrimitives, sportReadiness } from '../src/protocols/catalog';
import { getSport, resolveLaunch } from '../src/protocols/launch';
import { canLaunch, PROTOCOLS } from '../src/protocols/protocols';
import { SPORTS, type SportContextDef, type SportProfile } from '../src/protocols/sports';

const contexts: { sport: SportProfile; sub?: SportContextDef }[] = SPORTS.flatMap((sport) => (sport.subSports?.length ? sport.subSports.map((sub) => ({ sport, sub })) : [{ sport }]));

describe('movement entries for each sport context', () => {
  it('cover all nine sports and every discipline, with one to five movements each', () => {
    expect(SPORTS.map((s) => s.id)).toEqual(['soccer', 'basketball', 'volleyball', 'racquet', 'strength', 'martial', 'running', 'gymnastics', 'field']);
    expect(contexts).toHaveLength(13);
    for (const { sport, sub } of contexts) {
      const entries = movementEntries(sport, sub?.id);
      expect(entries.length, `${sport.id}/${sub?.id}`).toBeGreaterThanOrEqual(1);
      expect(entries.length).toBeLessThanOrEqual(5);
      expect(entries.map((e) => e.protocol.id)).toEqual((sub ?? sport).protocols.map((r) => r.protocolId));
    }
  });

  it('only READY and BETA protocols get a launch context, and it is the registry’s own', () => {
    for (const { sport, sub } of contexts) {
      for (const e of movementEntries(sport, sub?.id)) {
        const runnable = e.status === 'READY' || e.status === 'BETA';
        expect(e.launch !== null, `${e.key}`).toBe(runnable && canLaunch(e.protocol));
        if (e.launch) expect(e.launch).toEqual(resolveLaunch(sport.id, e.protocol.id, sub?.id));
      }
    }
  });

  it('roadmap protocols list exactly their own planned measurements; runnable ones list what they measure', () => {
    for (const e of SPORTS.flatMap(sportEntries)) {
      if (e.launch) {
        expect(e.measures).toHaveLength(e.launch.focus.length);
        expect(e.measures.every((m) => m.length > 0)).toBe(true);
      } else {
        expect(e.measures).toEqual(PROTOCOLS[e.protocol.id].plannedMetrics ?? []);
      }
    }
  });

  it('keeps the sport’s own titles, purposes and camera guidance', () => {
    const [jump] = movementEntries(getSport('soccer')!);
    expect(jump.title).toBe('Explosive Jump Check');
    expect(jump.purpose).toBe(getSport('soccer')!.protocols[0].purpose);
    expect(jump.camera).toBe(PROTOCOLS['jump-repeated'].camera);
    const deadlift = movementEntries(getSport('strength')!)[2];
    expect(deadlift.title).toBe('Deadlift');
    expect(deadlift.launch).toBeNull();
  });

  it('a discipline that is not named falls back to the first one', () => {
    const racquet = getSport('racquet')!;
    expect(movementEntries(racquet).map((e) => e.key)).toEqual(movementEntries(racquet, 'pickleball').map((e) => e.key));
    expect(movementEntries(racquet, 'badminton')[1].protocol.id).toBe('lunge-deep');
  });
});

describe('which movement opens selected', () => {
  it('the first runnable one by default', () => {
    expect(movementEntries(getSport('strength')!)[defaultEntry(movementEntries(getSport('strength')!))].protocol.id).toBe('squat-bodyweight');
    const fencing = movementEntries(getSport('martial')!, 'fencing');
    expect(fencing[defaultEntry(fencing)].protocol.id).toBe('lunge-forward');
  });
  it('the one asked for when this context has it, including a roadmap one', () => {
    const strength = movementEntries(getSport('strength')!);
    expect(strength[defaultEntry(strength, 'lunge-forward')].protocol.id).toBe('lunge-forward');
    expect(strength[defaultEntry(strength, 'deadlift')].protocol.id).toBe('deadlift');
    expect(strength[defaultEntry(strength, 'jump-repeated')].protocol.id).toBe('squat-bodyweight');
  });
  it('the first movement when nothing in the context can run', () => {
    for (const [sport, sub] of [['martial', 'kendo'], ['martial', 'kickboxing'], ['running', undefined]] as const) {
      const entries = movementEntries(getSport(sport)!, sub);
      expect(entries.every((e) => e.launch === null)).toBe(true);
      expect(defaultEntry(entries)).toBe(0);
    }
  });
});

describe('library facts', () => {
  it('readiness counts each protocol once across disciplines', () => {
    expect(sportReadiness(getSport('racquet')!)).toEqual({ ready: 0, beta: 1, roadmap: 3, total: 4 });
    expect(sportReadiness(getSport('strength')!)).toEqual({ ready: 1, beta: 1, roadmap: 1, total: 3 });
    expect(sportReadiness(getSport('running')!)).toEqual({ ready: 0, beta: 0, roadmap: 3, total: 3 });
  });
  it('every sport entry has a unique key, and the library lists all 20 protocols somewhere', () => {
    const all = SPORTS.flatMap(sportEntries);
    for (const s of SPORTS) {
      const keys = sportEntries(s).map((e) => e.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(new Set(all.map((e) => e.protocol.id))).toEqual(new Set(Object.keys(PROTOCOLS)));
  });
  it('movement types come from the sport’s own protocols', () => {
    expect(sportPrimitives(getSport('strength')!).map((p) => p.id)).toEqual(['SQUAT', 'FORWARD_LUNGE', 'HIP_HINGE']);
  });
  it('lists the other contexts that use the same protocol', () => {
    const [soccerJump] = movementEntries(getSport('soccer')!);
    expect(sharedContexts(soccerJump)).toEqual(['Basketball', 'Volleyball', 'Gymnastics', 'Field Sports']);
    const [pickleLunge] = movementEntries(getSport('racquet')!, 'pickleball');
    expect(sharedContexts(pickleLunge)).toEqual(['Tennis', 'Badminton', 'Strength', 'Fencing']);
  });
});
