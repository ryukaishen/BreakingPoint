# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Priority order, confirmed by the owner (2026-10-08):

1. **Athletes** tracking their own long-term performance: personal records, training consistency and progression. They train with a laptop or phone propped up about 2.5–3.5 m away, so during a set they read the screen at a distance and between sets they review results up close.
2. **Coaches**, second: they set up screens for athletes and review results. Squad and coach features are not built yet; the architecture should stay extensible for them.
3. **Long-term progression tracking** is the third priority: history across sessions, records and trends.

The UF Designathon 2026 is over. BreakingPoint is now being developed into a polished, production-quality product, not optimized for a three-minute demo.

## Product Purpose

BreakingPoint learns how an athlete moves when fresh (a personal baseline from a few calibration reps), scores every rep against that baseline with a Movement Drift Score, and uses sequential change detection (EWMA/CUSUM) to flag the rep where fatigue causes persistent movement drift: the breaking point. It then explains what changed and offers a 3-rep recovery check. Success means athletes become stronger, more consistent versions of themselves by raising their sustainable performance over time.

## Positioning

"BreakingPoint doesn't ask whether you move like the ideal athlete. It asks whether you still move like yourself." Comparison is always to the athlete's own baseline and own history, never to a population norm or an "ideal" form.

## Operating Context

- Session workflow: choose sport → protocol → Calibrate (about 6 fresh reps) → Monitor (scored set) → Detect (breaking point) → Recover (3-rep check) → summary/export.
- Live mode uses the device camera with on-device MediaPipe pose; Demo Mode runs a deterministic synthetic athlete through the same pipeline and is always labeled synthetic.
- No backend. Everything runs and is stored on the device (localStorage today); exports are numbers only, never video.
- During a workout the UI must be focused, minimal and immediately understandable at a distance. After a workout it may become more cinematic and gamified: progression visualizations, milestones and achievements.

## Capabilities and Constraints

- Launchable protocols: squat (strength), jump-and-land / countermovement jump (soccer, basketball, volleyball, gymnastics, field), forward lunge (beta: pickleball, tennis, badminton, fencing, strength). Everything else is roadmap and must not be launchable.
- One shared detector for every sport. The detector config `public/breakingpoint_detector_config.json` (UF HiPerGator result), `src/detection/*`, `lab/` and `hpc/` must not be modified without the owner's explicit permission.
- Real per-set data available: reps, scored reps, reps held at baseline before drift, breaking-point rep, estimated drift onset, average drift before/after, ranked feature changes, movement-pattern label, baseline feature medians and spread (including the in-control spread σ₀), recovery percent and status.
- Long-term progression must be built only from stored real session data. Demo/synthetic data never writes to an athlete's records and is always labeled.
- Camera-based measures (e.g. jump height proxy) are relative proxies that depend on camera setup; never present them as absolute strength or lab-grade values.
- Squad and coach competition: planned, not built. Keep data models extensible (athlete identity, per-athlete storage).

## Brand Commitments

- Name: BreakingPoint (wordmark "Breaking**Point**"); component names BreakingPoint Edge (app) and BreakingPoint Lab (validation).
- Language: "movement drift", "personal baseline", "persistent deviation". Footer: "BreakingPoint provides training information and is not a medical diagnosis."
- Visual direction pinned by the owner: a cohesive, original language drawing on the system/progression feel of Solo Leveling and the competitive, kinetic energy of Blue Lock, with no anime artwork, logos, character imagery, manga panels or obvious references. The foundation is deep navy and charcoal, electric blue is the dominant accent, icy cyan is for interaction and focus, and acid lime is used extremely sparingly for meaningful highlights.

## Evidence on Hand

- Validation numbers only from `results/VALIDATION_REPORT.md` (100,000 simulated sessions on UF HiPerGator; held-out false-positive rate 2.2%, detection 89.6%, median delay 4 reps). Synthetic-session validation, not clinical.
- No real athlete data, testimonials, users or benchmarks exist. None may be invented.
- Live webcam mode has not yet been tested on a real camera; forward lunge reliability on real recordings is unestablished (beta).

## Product Principles

1. **The breaking point is a warning, never an achievement.** Never glorify reaching failure or reward ignoring fatigue or recovery signals.
2. **Celebrate sustainable improvement.** Achievements are earned from measured data: new personal records, better form endurance, faster or fuller recovery, improved consistency.
3. **You versus your own records.** Competition means beating your past self. No fabricated leaderboards, XP or arbitrary levels.
4. **Quiet during work, cinematic after.** Mid-set screens are glanceable and calm; drama is reserved for genuine post-workout accomplishments.
5. **Honest by construction.** Every number shown is real or labeled synthetic; proxies are labeled as proxies; no medical claims.

## Accessibility & Inclusion

WCAG 2.1 AA as the floor: 4.5:1 text contrast, keyboard access to every control, visible focus, `prefers-reduced-motion` respected (all kinetic effects must have a static equivalent), and state never conveyed by color alone. In-session state must be legible from about 3 m.
