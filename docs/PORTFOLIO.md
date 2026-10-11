# BreakingPoint: portfolio text

Short descriptions for applications, résumés and portfolio pages. Every number here comes from the simulation study in [`results/`](../results/). The motion-capture results are described in words only, until their presentation has been reviewed; the full numbers are in the [README](../README.md#evidence).

## One line

BreakingPoint is a browser app that learns how an athlete moves when fresh and flags sustained changes in their form during a set, using on-device pose tracking.

## Short paragraph

BreakingPoint learns an athlete's usual squat or jump form from a few fresh reps, scores every later rep against it, and raises an alert when the change keeps growing. It runs in the browser (React, TypeScript, MediaPipe) and the video never leaves the device. I chose the detector settings in a Monte Carlo study on UF HiPerGator and then ran an exploratory evaluation on two public motion-capture datasets. Validation on real webcam footage is the next step.

## Résumé bullets

- Built BreakingPoint, a React and TypeScript web app that uses on-device MediaPipe pose tracking to learn an athlete's usual movement from 5 to 8 reps and flag sustained changes in form with an EWMA change detector.
- Selected the detector settings in a Monte Carlo study on UF HiPerGator: 100,000 simulated squat-feature sessions and 25,280 configurations, with 2.2% false alerts and 89.6% detection on held-out simulated sessions. A parity test keeps the TypeScript and Python implementations identical to 1e-9.
- Ran an exploratory evaluation on two public motion-capture datasets, with protocols and analysis code frozen before the outcome labels were used. Personal baselines separated deliberate squat technique errors much better than population norms; changes after a jump fatigue protocol were small and not significant after correction.
- Shipped it as a static site with pinned, checksum-verified model assets, session protection for live sets, and automated browser tests for the main user journeys.

## Wording to avoid

- "Detects fatigue", "predicts injury", or anything clinical. The app detects changes in form relative to the athlete's own fresh reps.
- "Validated" on its own. Say what was validated: a synthetic simulation of squat-like measurements.
- Combining the simulation numbers with the motion-capture results.
