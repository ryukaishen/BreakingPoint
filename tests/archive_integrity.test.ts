// The original HiPerGator study and the earlier local run are kept byte for byte.
// results/provenance.json lists a raw-byte SHA-256 for every archived file; this test
// fails if any of them changes, moves or goes missing. Nothing is normalised: the
// .gitattributes file turns off line-ending conversion so checkouts keep the exact bytes.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

interface Artifact {
  path: string;
  bytes: number;
  sha256: string;
}
interface Experiment {
  id: string;
  selected_config_id: string;
  artifacts: Artifact[];
}

const manifest = JSON.parse(readFileSync('results/provenance.json', 'utf8')) as { experiments: Experiment[] };
const byId = Object.fromEntries(manifest.experiments.map((e) => [e.id, e]));
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Committed bytes of the detector config the app ships (canonical; LF line endings). */
const CONFIG_SHA256 = '543798067d97f96efa6d98baf43d3aaabc49029cafb70cc537755af82d7e1b9e';

describe('archived experiment artifacts', () => {
  it('lists both experiments, kept apart', () => {
    expect(Object.keys(byId).sort()).toEqual(['hipergator-2026-10', 'local-50k-2026-10-04']);
    expect(byId['hipergator-2026-10'].selected_config_id).toBe('ewma|a=0.4|bp=2|w=1|m=0|clip=2.5');
    expect(byId['local-50k-2026-10-04'].selected_config_id).toBe('ewma|a=0.4|bp=2|w=1.5|m=2|clip=2.5');
    expect(byId['local-50k-2026-10-04'].artifacts.every((a) => a.path.startsWith('results/archive/2026-10-04_local_50k/'))).toBe(true);
  });

  for (const e of manifest.experiments) {
    it.each(e.artifacts.map((a) => [a.path, a] as const))(`${e.id}: %s is byte-identical to the record`, (path, a) => {
      expect(existsSync(path), `${path} is missing`).toBe(true);
      const buf = readFileSync(path);
      expect(buf.length).toBe(a.bytes);
      expect(sha256(path)).toBe(a.sha256);
    });
  }

  it('covers every figure in results/figures and public/lab/figures', () => {
    const listed = new Set(byId['hipergator-2026-10'].artifacts.map((a) => a.path));
    for (const dir of ['results/figures', 'public/lab/figures']) {
      for (const f of readdirSync(dir)) expect(listed.has(`${dir}/${f}`), `${dir}/${f} is not in provenance.json`).toBe(true);
    }
  });

  it('keeps the app config and the results copy byte-identical to the committed study output', () => {
    expect(sha256('public/breakingpoint_detector_config.json')).toBe(CONFIG_SHA256);
    expect(sha256('results/breakingpoint_detector_config.json')).toBe(CONFIG_SHA256);
  });

  it('leaves no local-run CSV at the top of results/, where it could pass for a HiPerGator output', () => {
    expect(readdirSync('results').filter((f) => f.endsWith('.csv'))).toEqual([]);
  });
});
