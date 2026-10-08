// The synthetic sample athlete: an in-memory repository that is rebuilt on
// every visit and never touches browser storage, so nothing done while
// exploring it can reach a real athlete's records.

import { MemoryStore } from './kv';
import { AthleteRepository } from './repository';
import seeds from './sampleHistory.json';
import { materializeSampleSessions, SAMPLE_ATHLETE_ID, SAMPLE_ATHLETE_NAME, SAMPLE_WEEKLY_GOAL, type SampleSessionSeed } from './sampleHistory';

export { SAMPLE_ATHLETE_ID, SAMPLE_ATHLETE_NAME };

export function createSampleRepository(now = new Date()): AthleteRepository {
  const repo = new AthleteRepository(new MemoryStore(), 'sample');
  repo.createAthlete(SAMPLE_ATHLETE_NAME, SAMPLE_ATHLETE_ID);
  repo.updateAthlete(SAMPLE_ATHLETE_ID, { weeklyGoal: SAMPLE_WEEKLY_GOAL });
  for (const s of materializeSampleSessions(seeds as unknown as SampleSessionSeed[], now)) repo.saveSession(s);
  return repo;
}
