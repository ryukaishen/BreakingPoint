# Handoff: athlete-facing wording for the Stage 2 files (2026-10-09)

For the session that owns the Stage 2 athlete view. On 2026-10-09 the rest of the app moved to plainer sports language. Your files were left untouched on purpose. They are uncommitted, and Adam asked that nobody else edit them. This note lists the strings in them that still use the old wording, with the replacement that matches the rest of the app. Nothing here changes identifiers, exported fields, CSS or logic.

A copy of every one of your files, taken before any other work started, is in `C:\Users\Administrator\Projects\BreakingPoint-wip-snapshot-2026-10-09\` (raw-byte SHA-256 values are in `MANIFEST.sha256`).

## Vocabulary now used in the live app

| Old visible wording | New visible wording |
|---|---|
| Movement drift score, drift score, drift (as a number) | Form Change Score |
| DRIFT EMERGING, Drift (state) | FORM CHANGING, Form changing |
| Your mechanics are starting to shift / movement is changing | Your form is starting to change. |
| Drift onset, drift began | Changes began, about rep N (always an estimate) |
| Breaking point at rep N / detected at rep N | The alert triggered at rep N (the state keeps the name "Breaking point") |
| Your baseline (in explanations) | Your usual form ("baseline" stays fine on controls such as "Use saved baseline") |
| Form drawdown | Form Changes Over Time |
| Smoothed drift (EWMA) | Trend (smoothed score) |
| CUSUM evidence, persistence evidence | Build-up of change (CUSUM) |
| Why rep N was flagged / Frozen at breaking point | What changed at rep N / Kept from the alert rep |
| σ RMS (unit next to the score) | removed from the athlete view; σ stays in technical detail with the tooltip "Change from your usual form, in multiples of your normal rep-to-rep variation (σ)." |
| returned toward baseline (recovery %) | of the change gone |
| Persistent drift remains / Drift persists | Still different from your usual form |
| One odd rep moves it at most halfway/partway | Each rep moves the trend line only part of the way, so one unusual rep rarely triggers it on its own. |

The score is two-sided: a higher score means *more different* in either direction, never worse, unsafe or fatigued. Never show it as a percentage.

Shared helpers you can call instead of writing sentences yourself:

- `src/session/explain.ts`: `explainAlert(exercise, reps, onsetRep, alarmRep)` returns `{ what, when }`. `explainAlertText(e)` joins them, for example "You leaned forward more and your drive out of the bottom got slower. These changes first appeared around rep 7, and BreakingPoint triggered an alert at rep 10." `describeAlertTiming(onsetRep, alarmRep)` gives the timing alone: "Your form first started changing around rep 7. The alert triggered at rep 10."
- `src/biomechanics/plainLanguage.ts`: one plain phrase per measurement and direction.
- `STATE_LABEL` in `src/utils/format.ts` now reads STABLE / FORM CHANGING / BREAKING POINT.

## Strings to update in your files

### `src/components/session/FocusPanel.tsx`

| Line (today) | Current | Suggested |
|---|---|---|
| 121 | plate `'Drift'` | `'Form changing'` |
| 123 | `'Your movement is changing. Be ready to stop.'` | `'Your form is starting to change. Be ready to stop.'` |
| 114 | `` `Breaking point at rep ${s.alarmRep}. End the set and rest.` `` | `` `The alert triggered at rep ${s.alarmRep}. End the set and rest.` `` |
| 131 | `'Movement matches your baseline.'` | `'Your reps match your usual form.'` |
| 142 | `'…check your recovery against your original baseline.'` | `'…check your recovery against your usual form.'` |
| 151 | `` `No breaking point. You held your baseline for ${held} rep…` `` | `` `No alert. You held your usual form for ${held} rep…` `` |
| 161 | `` `${RECOVERY_REPS} controlled reps, compared with your original baseline.` `` | `` `${RECOVERY_REPS} controlled reps, compared with your usual form.` `` |
| 169 | `'Back to baseline'` / `'Partly recovered'` / `'Drift persists'` | `'Back to your usual form'` / `'Partly back'` / `'Still different'` |
| 178 | bigLabel `'returned toward baseline'` | `'of the change gone'` |

### `src/components/session/Evidence.tsx`

| Line | Current | Suggested |
|---|---|---|
| 132 | column `Baseline` | `Usual` |
| 144 | `'low conf.'` | `'unclear'` |
| 200-206 | "The breaking point fires when smoothed drift (EWMA) crosses…", "…One odd rep moves it at most partway.", "…CUSUM evidence exceeds h…", "…confirm persistent drift." | Use the SidePanel wording: "The alert triggers when the trend line crosses X. Each rep moves the trend line only part of the way, so one unusual rep rarely triggers it on its own." / "…when the build-up of change (CUSUM) passes h = X." / "…when the trend line (EWMA) and the build-up of change (CUSUM) both show a lasting change." |
| 218, 222 | `Movement drift score`, unit `σ RMS` | `Form Change Score`, no unit |
| 225 | "Latest scored rep against your baseline. Your normal range ends at X." | "How different the latest rep is from your usual form. Your normal range is up to X." |
| 230 | `Smoothed drift (EWMA)` | `Trend (smoothed score)` |
| 238 | `Persistence evidence (CUSUM)` / `CUSUM, used to estimate drift onset` | `Build-up of change (CUSUM)` / `Build-up of change (CUSUM, for timing)` |
| 252-253 | `Why rep N was flagged`, `Frozen at the breaking point` | `What changed at rep N`, `Kept from the alert rep` |
| 271 | `… fresh reps, in-control drift μ ± σ` | "N fresh reps recorded." Put the μ ± σ detail in a `title` tooltip, as SidePanel does. |
| 282-283 | `Form drawdown`, `Drift per rep against {name}'s personal baseline` | `Form Changes Over Time`, `Form Change Score for each rep, compared with {name}'s usual form` |
| 287-291 | legend `drift per rep`, `smoothed drift (EWMA)`, `breaking point`, `CUSUM evidence` | `score for each rep`, `trend (smoothed)`, `alert line`, `build-up of change (CUSUM)` |

### `src/components/session/RecordLane.tsx`

| Line | Current | Suggested |
|---|---|---|
| 42 | `The record line counts only reps before drift.` | `The record line counts only reps before your form started to change.` |

"Held at your baseline" (23, 31) can stay, or become "Held your usual form".

### `src/session/voice.ts` (spoken)

| Line | Current | Suggested |
|---|---|---|
| 43 | `Drift persists.` | `Still different from your usual form.` |

"Stop. End the set and rest." and "Baseline locked." read fine as spoken cues.

### `src/components/CameraStage.tsx`

| Line | Current | Suggested |
|---|---|---|
| 149 | tooltip `Live hip drop vs your baseline depth range` | `Live hip drop compared with your usual depth` |

### `index.html`

| Line | Current | Suggested |
|---|---|---|
| 6 | meta description "BreakingPoint learns how you move when fresh and detects the rep where fatigue starts changing your mechanics." | "BreakingPoint learns how you move when you're fresh, then tracks how your form changes throughout a workout." |

The current description claims fatigue detection, which the app does not measure. This one matters most.

`useHandsFree.ts` needs no change.
