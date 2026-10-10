# Provenance: Vercel Web Interface Guidelines (vendored, pinned)

| | |
|---|---|
| Source repository | https://github.com/vercel-labs/web-interface-guidelines |
| Pinned commit | `434b7f91364665f2f733b310ec54809bf8f37937` (short `434b7f9`) |
| Commit | Merge of PR #29, "Add desktop overscroll guideline", 2026-10-05T20:49:16Z |
| License | MIT, Copyright (c) 2025 Vercel Labs (see `LICENSE`, included as required) |
| Reviewed and vendored | 2026-10-08 |

## Files vendored (byte-identical to the pinned commit)

| File | Bytes | git blob SHA (from the pinned tree) | sha256 |
|---|---|---|---|
| `command.md` | 8055 | `3eb3a212b7b89493922ea418489d4c6f67ae8bd5` | `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234` |
| `LICENSE` | 1068 | `b3575a3c1358eac4b9ee36a4c851872d81417760` | `6cd1609c9c12233507cdd2ce0d32e9a721e3c27494951be06b90090deeeb7af2` |

Both files were downloaded with `curl` from `raw.githubusercontent.com/.../434b7f91.../<file>` into an empty scratch directory, checked with `git hash-object` against the blob SHAs listed in the commit's own tree (API `git/trees/<sha>`), and read in full before being copied here. `command.md` contains lint rules and an output format only: no instructions to fetch, execute, install, or send anything.

## Deliberately not vendored

`install.sh` (an installer script), `README.md`, `AGENTS.md`. None are needed to run an audit, and nothing here should be executed.

## Verify integrity (offline, no network)

```bash
git hash-object --no-filters .claude/skills/web-interface-audit/vendor/vercel-web-interface-guidelines/command.md
# expect 3eb3a212b7b89493922ea418489d4c6f67ae8bd5
git hash-object --no-filters .claude/skills/web-interface-audit/vendor/vercel-web-interface-guidelines/LICENSE
# expect b3575a3c1358eac4b9ee36a4c851872d81417760
```

`.gitattributes` in this folder sets `* -text` so git never rewrites line endings and the hashes stay stable on every checkout.

## How the upstream skill differs, and why this one exists

Vercel's own skill (`vercel-labs/agent-skills`, `skills/web-design-guidelines/SKILL.md`) tells the agent to fetch `command.md` from the mutable `main` branch on every run, so remote text can change what an audit checks, or what the agent is told to do, without any review. The wrapper in `../../SKILL.md` is original text that reads this pinned copy instead, is user-invoked only (`disable-model-invocation: true`), and never touches the network.

## Updating (manual and reviewed, never automatic)

1. Pick a new upstream commit and read the diff of `command.md` between the pinned SHA and the new one.
2. Download the new `command.md` and `LICENSE` into an empty directory, verify blob SHAs against that commit's tree, read them in full.
3. Replace the files, update every SHA, size and date above, and re-run the verification commands.
