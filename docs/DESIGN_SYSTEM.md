# BreakingPoint design system: "System window"

BreakingPoint is a quiet instrument that watches how you move and speaks up when that movement changes. The interface borrows the *structure* of a game's system interface (crisp windows, status readouts, a visible run of stages, milestones that unlock) and none of its costume. There's no character art, no fantasy vocabulary and no decorative glow.

**One rule decides most choices:** the athlete's movement state is the loudest thing on screen. The interface itself stays in blue-black and steel, and the only saturated colors are the state of your movement (mint, amber, crimson), the system's own voice (electric blue) and progression milestones (violet).

---

## 1. Audit of the previous UI

| Problem | Where | Fix |
|---|---|---|
| Every label shouted. Tracked, uppercase monospace eyebrows sat on nearly every block, so labels competed with content. | `.eyebrow`, `.panel-title`, `.k`, chips, chart heads | Sentence-case labels in the text face. Uppercase is reserved for **status codes** (STABLE, BREAKING POINT, READY, BETA). |
| Gradients as decoration | state cards, hero card, sport/protocol/explore/custom cards, modal, header, primary and "go" buttons, stage radial | Flat surfaces. The only tinted surfaces are the state window and status tags. |
| Twelve different corner radii (6 to 22px, plus pills) | everywhere | Four radii: 2, 4, 6, 8px. Chamfered "system windows" are the single signature shape. |
| Around 80 raw hex values in TSX; violet meant four unrelated things | FormDrawdown, SidePanel, CameraStage, Landing | `src/ui/theme.ts` mirrors the CSS tokens for SVG/canvas. Violet now means **evidence and milestones** only. |
| Predictable card rows: three "how it works" cards, a three-card "diff" strip, a three-column sport grid plus a compact grid, and an explore/custom pair | Landing | Landing rebuilt around the product's real sequence (the session track) and a sport roster list. |
| Session stepper hid its labels below 1700px wide, leaving bare numbers on laptops | Header | Session track with labels always visible (≥1100px) and live per-stage progress. |
| Clickable `div`s (rep timeline cells, lab strip, brand, figures) weren't keyboard-reachable; no focus styles; Escape didn't close modals; 9.5 to 10.5px text in many places | multiple | Real `button`s, a global `:focus-visible` ring, Escape closes dialogs, an 11px floor for any text that carries information. |
| Motion on every hover (cards lifting on hover) | sport cards, timeline cells | Hover changes color or border only. Motion is reserved for state changes the athlete caused. |
| Gamification was traffic-light dots and a ring | SidePanel | Meaningful progression built from real session data (see §5). |

---

## 2. Color tokens

| Token | Hex | Role |
|---|---|---|
| `--void` | `#05070D` | Page background (midnight, near-black) |
| `--abyss` | `#080C16` | Header, sunken wells, chart strip |
| `--panel` | `#0B1120` | Data panels |
| `--panel-2` | `#0F1729` | Raised controls: inputs, chips, table heads |
| `--panel-3` | `#152038` | Hover and pressed fills, meter tracks |
| `--line` | `#18233A` | Hairlines |
| `--line-2` | `#24334F` | Emphasized borders, control outlines |
| `--text` | `#E8EEF7` | Primary text |
| `--text-2` | `#A7B4C8` | Secondary text |
| `--muted` | `#7A89A1` | Labels (≥4.5:1 on `--panel`) |
| `--dim` | `#5D6C85` | Non-essential, decorative, disabled |
| `--sys` | `#3DB8FF` | **Electric blue.** Actions, focus, active navigation, the system's voice |
| `--ice` | `#A5E9FF` | **Icy cyan.** Highlights inside system windows, leading edges of meters |
| `--sys-deep` | `#0D3352` | Accent tracks and selected fills |
| `--violet` | `#9C8AFF` | **Milestones and evidence.** Baseline locked, recovery, personal best, CUSUM, drift onset |
| `--stable` | `#3BE3A8` | Movement state: stable |
| `--drift` | `#FFB547` | Movement state: drift emerging |
| `--break` | `#FF4560` | Movement state: BreakingPoint |

Color is never the only signal. Every state color is paired with a text label (STABLE, DRIFT, BREAKING POINT), and the timeline marks the breaking-point rep with a glyph as well as color.

## 3. Typography

| Role | Face | Setting |
|---|---|---|
| Display, numerals, status codes | **Saira** (variable, `wdth` 50–125) | Condensed width (`font-stretch: 78%`) for big numbers and headlines; semi-condensed for panel titles |
| Text, UI, labels | **IBM Plex Sans** | 400/500/600, `tnum` for numbers in tables |
| Formulas, code | **IBM Plex Mono** | Research modal only |

One display family that changes width does the work of two: condensed Saira gives the rep counter and state readouts a broadcast-scoreboard density, and wider Saira handles headings. Plex keeps long text credible and readable.

Scale (px): 11 micro (chart ticks only) · 12 label · 13 small · 14 body · 15 prose · 16 panel title · 20 section · 28 page title · 36 state readout · 56–72 display · 84 rep counter.

## 4. Space, shape, depth, motion

- **Spacing:** 4px base. Steps of 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64. Panels pad 16, and the dashboard gap is 12.
- **Radii:** 2px tags and meter cells · 4px buttons, inputs, chips · 6px panels · 8px stage and modals.
- **System window:** panels where the *system tells you something* (the state readout, toasts, dialogs and the landing preview) get a 12px chamfer at the top-right and a 1px top rule in their tone color. Ordinary data panels stay square-cornered at 6px. The shape encodes information: chamfer means "message", square means "data".
- **Depth:** no drop shadows on panels. Dialogs get one deep shadow. Glass (`backdrop-filter`) appears only where there's something behind it: HUD chips over the camera stage and the dialog backdrop.
- **Glow** is allowed in exactly three places: the focus ring, the active movement-state indicator and the breaking-point alarm.
- **Motion:** `--t-fast` 120ms (press, color) · `--t-base` 200ms (tabs, state color) · `--t-slow` 360ms (meter fills, transforms only) · `--t-alert` 900ms (the alarm). Easing `cubic-bezier(.2,.8,.2,1)`. Motion only answers events the athlete caused: a rep lands and its meter cell charges, the state changes and the window re-scans, the breaking point fires the stage alarm. `prefers-reduced-motion` removes all of it.

## 5. Gamification that maps to the real workflow

BreakingPoint's actual loop is **Calibrate → Monitor → Detect → Recover**. Every progression element below is computed from data the engine already produces. There are no XP points, no levels and no invented scores.

| Element | Where | Data behind it | Why it helps |
|---|---|---|---|
| **Session track**: four stages, each pending, active or complete, with live progress (e.g. *Calibrate 4/6*) | Header, and mirrored on the landing page | `snap.phase`, rep counts | You always know where you are and what's next. |
| **Baseline sync meter**: one cell per calibration rep | Calibration panel | `calibrationReps` vs `calibrationTarget` | Replaces an abstract ring with the reps you actually did. |
| **Baseline locked** milestone (violet) | Baseline panel, set record | baseline exists, `nReps` | Marks the moment personalization happens. |
| **Reps held at baseline**: consecutive STABLE reps from the start of the set; freezes when drift begins | State window, set record | per-rep `step.state` | The single most motivating true number in a set: how long you kept moving like yourself. |
| **Personal best for reps held** (live sessions only, per movement, stored on-device) | State window, set record | local record | Real progression across sessions of the same protocol. Never written from demo runs. |
| **Margin meter**: smoothed drift against the warning and breaking-point lines | Monitor panel | EWMA level, thresholds | Shows how close you are to the line, not just whether you crossed it. |
| **Set record**: milestones Baseline locked · Reps held · Breaking point located · Recovery checked | Summary dialog | summary, recovery | Turns the summary into a completion record that points at the next step. |
| **Protocol availability**: Ready, Beta or Roadmap, with a lock on roadmap items | Sport roster, protocol list, library | protocol status | Honest about what can be launched today. |

Never gamified: the movement state itself, "breaking" more or less, or comparisons with other athletes. BreakingPoint compares you to you.

## 6. Page proposals

**Landing.** A two-part hero. On the left is the promise (*Your movement. Your baseline.*) with one primary action (run the soccer demo) and the other demos as a compact secondary list. On the right is a **system window** running the real demo pipeline headlessly: state readout, pattern, form drawdown and top changes. Below that sits the **session track** (the same four stages the app header uses, so the landing page teaches the product's own navigation), then a **sport roster** (a hairline-separated list rather than a card grid), then one split statement ("Most form apps ask… / BreakingPoint asks…") with the Lab validation readout.

**Sport page.** A header with the sport and its disciplines as segmented tabs. Protocols become **briefing rows**: status, name and purpose on the left, measured metrics in the middle, actions on the right. Roadmap rows are visibly locked.

**Session.** The layout stays (stage · state column · drawdown). The stage gets viewfinder corner marks (it's a camera) and condensed HUD numerals. The side column leads with the **state window** (status code, held-rep count, pattern), then the margin meters, the ranked changes and the sport focus stats. The chart keeps its semantics with tokenized colors.

**Dialogs.** Summary becomes the **set record**. Research, Library and Lab share one dialog shell: chamfered window, sticky header, Escape to close.

**Mobile (≤640px).** Single column. The header collapses to brand, track and menu actions. Touch targets are ≥44px on coarse pointers. No horizontal scroll.
