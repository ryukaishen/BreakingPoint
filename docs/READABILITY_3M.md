# Readability from 3 m: the standard for the athlete view

PRODUCT.md: "In-session state must be legible from about 3 m." This document makes that testable.

**A font size does not make something readable from across a room.** What the eye gets is the *visual angle* the glyphs subtend. That depends on the viewing distance, and on how large a CSS pixel really is on the screen in front of you (a phone pixel is 0.18 mm, a 15.6-inch laptop pixel 0.22 mm, a 24-inch monitor pixel 0.28 mm). The same `font-size: 40px` is a different size to the eye on each of them, and glyph height is only about 70% of the font size. So the standard is stated in degrees, converted to pixels per device, and checked on the elements as they are really rendered.

Status: the standard and its measuring tool exist (`src/ui/readability.ts`, `scripts/readability.mjs`, tests in `tests/readability.test.ts`). The athlete view is being built in another session, so **applying** the standard to it is deferred until its `FocusPanel` and `RecordLane` are integrated. The real-device check below has **not** been performed yet; it needs a person, a laptop and a tape measure.

## The standard

Viewing distance: **3.0 m nominal**, within the product's stated 2.5 to 3.5 m. Athletes read this screen while exerting, so the thresholds sit well above the acuity limit. A 20/20 eye resolves a letter 5 arcminutes tall (0.083 degrees); fatigue, sweat, motion and glare all cost legibility.

| Tier | Minimum glyph size | Contrast | What it covers |
|---|---|---|---|
| **T1** | 0.45 degrees (about 5.4x the acuity limit) | 4.5:1 | Read at a glance, mid-set: the **state word**, the **rep count**, the **stop signal** |
| **T2** | 0.25 degrees (about 3x) | 4.5:1 | Read in a second or two: the **one-line instruction**, the **record label** |
| **G** | 0.05 degrees | 3:1 | A graphic feature that carries information: the **record marker**, the lane edge |
| T3 | no requirement | 4.5:1 | Close-up only: evidence, history, anything read between sets. **Never** needed for safety. |

Contrast is 4.5:1 for text because glyphs this large are large text (WCAG AAA asks 4.5:1) and the project's floor for any text is AA; the tiers add *size*. Colour is never the only carrier of state: every state has its word.

### What that means in pixels (3.0 m, glyph height, and the font size that gives it)

| Device | T1 | T2 | G |
|---|---|---|---|
| 13-inch laptop (1440 CSS px wide, 0.199 mm/px) | 119 px (font about 169) | 66 px (font about 94) | 13 px |
| **15.6-inch laptop (1536 CSS px wide, 0.225 mm/px)** | **105 px (font about 150)** | **58 px (font about 83)** | **12 px** |
| 24-inch monitor (1920 CSS px wide, 0.277 mm/px) | 85 px (font about 122) | 47 px (font about 68) | 9 px |
| Phone (390 CSS px wide, 0.183 mm/px) | 129 px (font about 184) | 71 px (font about 102) | 14 px |

`node scripts/readability.mjs --table` prints this from the same code. As viewport units: about 10vw of font size for T1 on a laptop; a phone needs about 47vw, so **on a phone only two or three large glyphs can meet T1**. A phone propped at 3 m therefore shows the state and the count, huge, and leaves the instruction to the spoken cue.

### Rules of composition (these keep it quiet)

1. **At most four things are read at T1 or T2 at once**: state, rep count, the instruction, the record line. Everything else is T3.
2. **The stop signal has two independent channels**: a T1 state word (never colour alone) and the spoken cue. If the instruction text cannot reach T2, it is T3 and must not carry the stop instruction.
3. **Instruction copy shown at T2 is short**: about 20 characters or two short lines. A sentence at 83 px does not fit beside the other elements.
4. **The record marker is G or larger** and the gap between the fill's end and the marker, one rep apart, is also at least G. A hairline is not a record line.
5. State plates and any text on a coloured fill use a pairing the palette declares (`--on-cobalt` on cobalt, ink on amber, red or lime), checked in `tests/a11y_css.test.ts`.

## How to check

**1. Measure the real elements (automated, about a minute).** Needs the dev server running.

```bash
node scripts/readability.mjs --target app-session --device laptop15 --sim out.png
node scripts/readability.mjs --url http://localhost:5173/ --probe "rep count|.focus-num|digits|T1" --device phone
```

It opens a headless browser in a throwaway profile, finds each probed element, measures the *rendered* glyph height with the canvas text metrics (digits for numerals, capitals for words, so a fallback font or a size that never applied cannot hide), converts it to degrees for the chosen device and distance, computes the contrast against the real background, and prints pass or fail, plus **how far away each item still reads**. `--sim` also writes what the screen looks like from that distance: shrunk to the angle it subtends compared with an arm's length, then lightly blurred. It exits with status 1 when anything fails, so it can gate a change.

What it does **not** know: blur from a cheap panel, glare, a dim room, motion, a viewing angle, or a person's eyesight. It measures size and contrast. That is why step 2 exists.

**2. The real-device check (a person; not yet done).** This is the final check, and the one that cannot be skipped.

- Equipment: the actual device at its default scaling and zoom, a tape measure, a timer. Brightness at 50%. Repeat once with the room lights dimmed.
- **A. Static.** Open the athlete view on the sample athlete (clearly synthetic), paused in turn at stable, drift and stop. From **3.0 m** (measured to the screen), standing and without leaning, read aloud the state word, the rep count, the instruction, and the record number. Note the time and any error.
- **B. In motion.** Do five bodyweight squats facing the screen from 3.0 m while the demo runs to its stop signal. Call "stop" the moment you see it. Note the delay.
- **C. Far end.** Repeat A at **3.5 m** for the T1 items only.
- **Pass:** every T1 item read correctly within 2 s and every T2 item within 3 s at 3.0 m; T1 items correct at 3.5 m; the stop recognised within 1.5 s in 5 of 5 trials. Use the person's usual glasses or lenses.

| Date | Device | Distance | State word | Rep count | Instruction | Record | Stop delay | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## Results so far (measured 2026-10-08, 15.6-inch laptop, 3.0 m)

The two screens that exist today. "Required" is glyph height in CSS px.

| Item (tier) | Required | Approved board, B1 in-set mock | The session screen in the app now |
|---|---|---|---|
| Rep count (T1) | 105 px | **137 px, 0.59 deg, reads to 3.9 m: pass** | 21.7 px, 0.09 deg, reads to 0.6 m: fail |
| State word (T1) | 105 px | 30 px, 0.13 deg, reads to 0.9 m: fail | 27 px, 0.12 deg, reads to 0.8 m: fail |
| Instruction (T2) | 58 px | 12 px, 0.05 deg, reads to 0.6 m: fail | 10 px, 0.04 deg, reads to 0.5 m: fail |
| Record label (T2) | 58 px | 10 px, 0.04 deg, reads to 0.5 m: fail | 10 px, 0.04 deg, reads to 0.5 m: fail |
| Record marker (G) | 12 px | 3 px, 0.01 deg, reads to 0.8 m: fail | not present |

Contrast passed everywhere except the B1 state plate, which measured 5.2:1 against a 4.5:1 requirement (it passes under the revised T1 contrast; at 7:1 it would not).

What this says:

- The approved board's in-set mock gets **one** thing right from 3 m: the 200 px rep count. The state word, the instruction, the record label and the record marker all read to under a metre. The simulation (`--sim`) shows the same thing: the count is clear; the state plate is a blue block with a smudge for a word; the rest is gone.
- The session screen in the app today is a close-up instrument, as expected before the athlete-view rework.
- To meet the standard on a 15.6-inch laptop the athlete view needs: rep count and state word with glyphs of at least **105 px** (font about 150 px, condensed italic: "STABLE" then fits easily); the instruction at at least **83 px** font if it is shown at T2, or demoted to T3 with the stop carried by the state word and the spoken cue; a record marker at least **12 px** thick with its label at T2 or replaced by a second T2 numeral ("best 8"); and nothing else competing.
- These are measurable constraints, not a design. Reconciling them with "quiet during work" is the athlete view's job; the standard only says what has to be true when it is done, and `scripts/readability.mjs` says whether it is.

## Applying it (deferred)

When `FocusPanel` and `RecordLane` are integrated: run both phone and laptop measurements with `--probe` lines for their real class names, fix what fails, run the real-device check, and record the result in the table above. The B1 and `app-session` presets in `scripts/readability.mjs` keep the before-and-after comparison honest.
