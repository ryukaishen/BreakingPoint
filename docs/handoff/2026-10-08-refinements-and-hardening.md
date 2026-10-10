# Handoff: design refinements and production hardening (2026-10-08)

For the session implementing Stages 2 to 4. Read this before touching `App.tsx`, the debrief, or the progress screen. It says what already exists, what you should use instead of writing your own, and what was left for you on purpose.

Ground rules that shaped this work: the other session's uncommitted files were not edited (`styles.css`, `styles-platform.css`, `theme.ts`, `main.tsx`, `CameraStage.tsx`, `session/*` WIP). Anything that edits a file both sessions would touch lives in an isolated worktree. Nothing is committed.

## What exists, and where

| Piece | Where | State |
|---|---|---|
| **R1** Rep-by-rep comparison (the record-line replay) | `src/data/splits.ts`, `src/components/debrief/SplitsBand.tsx` + `.css`, `tests/splits.test.ts` | Built, tested, new files in this tree |
| **R2** Numeral typography rule | `src/ui/numerals.css` (`.num-hero`, `.num`), `tests/typography.test.ts` | Built; the test enforces it on every CSS file |
| **R3** Record staircase for Progress | `src/data/staircase.ts`, `src/components/progress/RecordStaircase.tsx` + `.css`, `tests/staircase.test.ts` | Built, tested, new files in this tree |
| **R4** 3 m readability standard and tool | `docs/READABILITY_3M.md`, `src/ui/readability.ts`, `scripts/readability.mjs`, `scripts/lib/cdp.mjs`, `tests/readability.test.ts` | Standard and tool built. **Applying it to the athlete view is deferred** (needs your `FocusPanel`/`RecordLane` integrated). Real-device check not yet done. |
| Reference composition | `docs/preview/breakaway-parts.html` (served by `npm run dev`) | Dev-only page showing R1, R2, R3 inside the approved debrief and progress layouts |
| **Production hardening** (session protection, recovery, landmarks, announcer, text floor) | Worktree `../BreakingPoint-hardening`, branch `hardening/session-protection`, uncommitted. Also as `docs/handoff/session-protection.patch` | Built. 44/44 end-to-end checks; 146 unit tests pass there (the 80 existing plus 66 new) |
| Pinned Vercel audit | `.claude/skills/web-interface-audit/` (run `/web-interface-audit <files>`) | Vendored at commit `434b7f9`, hash-verified, user-invoked only |
| Project plugin policy | `.claude/settings.json` | Taste Skill and the upstream Vercel skill disabled for this project |
| `.gitignore` | `.claude/skills/` and `.claude/settings.json` are now tracked | One small edit |

## Use these. Do not write competing versions.

**Debrief (Stage 3).** `SplitsBand` is the rep-by-rep comparison against the athlete's own best comparable set.

```tsx
import { buildSplits } from '../data/splits';
import { SplitsBand } from '../components/debrief/SplitsBand';
<SplitsBand model={buildSplits(history, record)} headingLevel={2} />
```

`history` is the athlete's sessions for the protocol (`repo.sessions(athleteId, protocolId)`), `record` the set just finished. It already handles: the reference choice (comparable sets only, so a set from other conditions is never compared), a first set, a set that is not eligible, reps after the warning, unscored reps, and an empty set.

Composition, as built in the preview and as the approved board intends:

1. **The warning and the next step stay above the replay.** Result slab, then the breaking-point card with "Start recovery check", then the band. The band is a major element but never pushes the safety message down.
2. **One hero numeral per screen** (`.num-hero`). Everything else numeric is `.num` (Mona Sans, tabular).
3. **Lime exactly once, and only for a genuine new record.** The slab carries the NEW RECORD tag, so the band's own tag is **off by default** (`recordTag` prop). The band does mark the end of the held run in lime when `outcome.kind === 'new-record'`; nothing else in it is lime.
4. The band never judges drift onset or the breaking point (no better or worse), only reps held. Keep that when you add copy.

**Progress (Stage 4).** `RecordStaircase` is the staircase with every session readable.

```tsx
import { buildStaircase } from '../data/staircase';
import { RecordStaircase } from '../components/progress/RecordStaircase';
<RecordStaircase model={buildStaircase(history, protocolId, { configId })} />
```

Record sessions are solid with a cap and a diamond; counted sessions below the line are outlined (6:1 contrast); sessions that did not count are dashed and labelled; every bar has its value as text; a table restates the chart. Lime is only the newest session, only when it is a record. On narrow screens it scrolls and starts at the newest sessions; the scroll region is keyboard reachable. Reuse `recordSteps`/`milestones` from `data/progress.ts` for the rest of the page; they are untouched.

**Typography (R2).** `.num-hero` is Anybody condensed black italic, 32px or larger, tabular. `.num` is Mona Sans tabular. `tests/typography.test.ts` fails the build if any rule uses `--font-num` below 32px or without tabular figures, with `file:line`. Your new `styles-session.css` is covered automatically. Interpretation to confirm: the board also sets display words (the state plate, NEW RECORD) in Anybody; the test allows that **at 32px or larger**, never for labels, data or body text. If you want strictly numerals only, tighten the test.

**Preview.** `http://localhost:5173/docs/preview/breakaway-parts.html` renders all of this from the sample athlete's history.

## Session protection and recovery (the patch)

`git apply docs/handoff/session-protection.patch` applies cleanly to this working tree today (checked, not applied). It adds:

- `session/navGuard.ts`: Back and Forward are intercepted while a **live** calibration, set or recovery check is in progress (undo, ask, replay only on confirm); `beforeunload` shows the browser's prompt. Unload handlers are not reliable (mobile browsers, no prior interaction, crashes), so they are only a speed bump.
- `data/draft.ts` and `session/useSetDraft.ts`: a live set is checkpointed after every rep and when the page is hidden. After an interruption the athlete is offered the measured reps (`RecoveryDialog`). Kept sets are stored **not eligible for records**, so an interrupted set can never set a record or serve as a comparison. Demo data never writes a draft, and every draft is validated as untrusted input.
- `SessionAnnouncer` and `session/announce.ts`: the only live regions. Polite for progress (4 messages across a 14-rep demo), one assertive alert for the breaking point.
- Landmarks: skip link, one `<main id="main">` per view, an `h1` for the session, per-view document titles.

What to preserve when you rewrite `App.tsx` for the athlete view (the patch's `App.tsx` hunks are small and additive):

1. `useNavGuard({ view, setView, isProtected: liveActive, requestLeave: guardLeave, persist: draft.flush })` and `useSetDraft(...)` after the recorder.
2. The startup scan for drafts and `<RecoveryDialog>`.
3. `<a className="skip-link">`, and **`id="main" tabIndex={-1}` on the session's `<main>` plus a visually hidden `<h1>`**. The end-to-end script checks both.
4. `<SessionAnnouncer snap={snap} />` mounted once in the session view.

**Edit `FocusPanel.tsx` (yours, untouched here):** `src/components/session/FocusPanel.tsx:204` is `aria-live="assertive"` on the whole status region. Remove the live attributes there (leave `className="focus-state"` only); the announcer speaks state changes. Likewise `SidePanel.tsx`'s state card lost its live region in the patch (moot if you delete `SidePanel`).

**Styles.** `docs/handoff/session-protection-styles.diff` does not apply to your `styles.css` (you changed the `.depth-gauge` rules). Apply by hand:

1. After `.visually-hidden`, add the `.skip-link` rule and `main:focus { outline: none; }` (see the diff).
2. Raise three sizes to 11px: `.brand-tag` (line 146, 10.5px), `.depth-gauge .lbl` (line 279, 10.5px), `.tl-cell .tl-mark` (line 421, 10px).

Then `tests/a11y_css.test.ts` passes. Until then, run it read-only against this tree to see exactly what it flags: from the worktree, `BP_ROOT=../BreakingPoint npx vitest run tests/a11y_css.test.ts`. Today it flags the three sizes and the missing skip link, and nothing else.

Palette findings for your tokens, measured (script, not by eye) on the Breakaway values in this tree; none of it changed, it is your file:

- Text on an **amber, red or lime fill should be `--ink`**: ink on `--break` is 5.77:1, on `--drift` 11.05:1, on `--lime` 17.07:1. Light text on `--break` fails 4.5:1 (`--text` 3.11:1, pure white 3.49:1; fine only as large text at 3:1).
- Light text on cobalt passes: `--on-cobalt` white 5.17:1, `--text` 4.60:1.
- `--cobalt` is a fill, not a text colour (3.90:1 on the page): use `--cobalt-hi` for text (6.54:1).
- Adjacent surface steps are `--ink` to `--navy` 1.07:1, `--navy` to `--panel` 1.01:1, `--panel` to `--panel-2` 1.07:1, `--panel-2` to `--panel-3` 1.10:1, so depth leans on hairlines (`--line-2` on `--panel` is 1.64:1).
- `--dim` is 3.40:1 on `--panel`: for non-essential marks only.

## The 3 m standard, applied to the athlete view (deferred)

`docs/READABILITY_3M.md` has the tiers, the pixel sizes per device, the real-device check, and the measured baseline. Short version for a 15.6-inch laptop at 3 m: rep count and state word need glyphs of at least **105 px** (font about 150 px), the instruction at least 83 px font or demoted to T3 with the stop carried by the state word and the spoken cue, the record marker at least **12 px** thick. The approved B1 mock passes only on the rep count. Run `node scripts/readability.mjs --url http://localhost:5173/ --probe "name|selector|digits|T1" --device laptop15` on your real class names, and `--device phone` too.

### The worktree, and removing it safely

`../BreakingPoint-hardening` is a normal git worktree of this repository on branch `hardening/session-protection`, with **uncommitted** changes (the patch above is the same content). It reuses this repo's dependencies through three directory junctions: `node_modules`, `public/mediapipe`, `public/models`. **Delete the junctions first, then the worktree**, so nothing can be removed through them:

```bash
cmd /c "rmdir ..\BreakingPoint-hardening\node_modules"
cmd /c "rmdir ..\BreakingPoint-hardening\public\mediapipe"
cmd /c "rmdir ..\BreakingPoint-hardening\public\models"
git worktree remove --force ../BreakingPoint-hardening
git branch -D hardening/session-protection      # only after the patch is applied or no longer wanted
```

(`rmdir` on a junction removes only the link.) To run the end-to-end script against it, start its own dev server there (`npx vite --port 5174 --strictPort`); that server is not left running.

## What was not done or not verified

- **Athlete view changes (R4), `FocusPanel`/`RecordLane`:** deferred as agreed.
- **Wiring `SplitsBand` and `RecordStaircase` into screens:** the debrief and progress screens do not exist yet (Stages 3 and 4). They are ready to drop in.
- **`DESIGN.md` and `docs/DESIGN_SYSTEM.md`:** deferred until the implementation stabilises. When it does, `docs/DESIGN_SYSTEM.md` still describes the older "System window" system and must lose: violet as the milestone colour, Saira, IBM Plex, the `--void`/`--abyss`/`--sys` names, and "System window" as the system's name; and gain: cobalt, ice and lime roles, Mona Sans plus Anybody, the 12 degree cut, the numeral rule, the readability standard, the record line, "lime once". Impeccable loads a root `DESIGN.md`; `/impeccable document` can produce it then.
- **Real camera, real athlete, real devices:** the live camera path, hands-free thresholds, voice in a gym, and the real-device 3 m check are all unverified here. The end-to-end tests drive the real engine with synthetic frames, not a camera.
- **Project plugin policy:** `.claude/settings.json` lists all four plugins explicitly (so Impeccable and UI/UX Pro Max stay on). It takes effect when a session starts; confirm that `taste-skill:*` and `web-design-guidelines:*` are gone from the skill list and Impeccable is still there. If Impeccable or UI/UX Pro Max vanished, delete the file.
- Not committed. Nothing was pushed.

## Verify

```bash
npm test                    # includes the new tests; none depend on the patch except tests/a11y_css.test.ts, which only lives in the worktree/patch
npx tsc -p tsconfig.json
npm run build
```

End-to-end session protection (needs the patched app on a dev server): `BASE=http://127.0.0.1:5174/ node scripts/e2e/session-guard.mjs`, expect 44/44.
