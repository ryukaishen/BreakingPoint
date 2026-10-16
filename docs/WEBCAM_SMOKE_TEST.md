# Physical webcam smoke test

A short manual check of the live camera path on a real laptop, with a real webcam and a real person. It
confirms the redesigned live screens (M4 to M7) work end to end. It is not an accuracy study: it produces
no detection rates, and its results must not be quoted as validation of the detector.

Background: an earlier version was tried by hand with a physical webcam and real movements, and it worked.
Since the M4 and M5 redesign, every automated live check has used Chromium's fake camera with the app's
synthetic athlete. This test closes that gap for the current build. Release risks 1 and 3 in
`TECHNICAL_NOTES.md` section 16 depend on it.

## Set-up

- The Vercel Preview of the build under test (or `npm run dev`), in Chrome or Edge on a laptop.
- Room for a side view of your whole body, about 2 to 3 m from the camera, with even light.
- A private window for steps 1 to 3, so you start with no athlete and no saved permission.
- Note the browser, its version, the laptop and the camera in the results table.

## Steps

1. **No athlete yet.** On the Entry page choose *Start with your camera*. Expected: the Add athlete dialog
   opens. Add a name. The live Bodyweight Squat set-up opens and the browser asks for the camera.
2. **Permission refused.** Block the camera at the prompt. Expected: *Permission denied*, with what to do
   next. Allow the camera in the site settings, then choose *Try again*. Expected: the camera starts.
3. **Starting.** Expected: *Starting tracking*, then the camera picture with the pose drawn on it and a
   feed label reading "fps, on-device pose model".
4. **Empty room.** Step completely out of view for about 10 s. Expected: the set-up checklist does not tick
   and calibration does not start. (Release risk 1 is about an empty camera still reporting an athlete.)
5. **Ready.** Stand side-on, whole body in view. Expected: the checklist ticks and the screen reads
   *Ready*.
6. **Calibration.** Choose *Start calibration* (or turn on *Hands-free* and stand still). Do 5 to 8
   controlled squats. Expected: the count rises once per squat; *Finish calibration* appears after 5;
   *Baseline locked* follows.
7. **Monitoring.** Choose *Start the set now*. Do about 6 normal squats. Expected: *Stable*, and the rep
   count matches what you did. Write down any missed or extra reps.
8. **Form change.** Keep going for 6 to 10 reps with a clear change: shallower, more forward lean, slower
   up. Expected: *Form changing*, and possibly *Stop* with the red band and *End set*. Whether an alert
   fires depends on the change; record what happened and at which rep, either way.
9. **Tracking lost.** Mid-set, walk out of view for about 5 s. Expected: *Tracking lost* within a few
   seconds; it clears when you step back in. Note roughly how long it took.
10. **End set.** Choose *End set*. Expected: the post-workout system opens on Recovery (after an alert) or
    Summary. The rest timer counts up.
11. **Recovery check.** Choose *Start recovery check (3 reps)* and do 3 controlled squats. Expected: each
    rep fills a node, then a result (back to your usual form, partly back or still different) with its
    percentage.
12. **Summary and exports.** Open Summary. Expected: the rail and rep chart match the set. *Export JSON*
    and *Export CSV* download files that contain numbers only (no images or video).
13. **History and storage.** Open History. Expected: the set is listed under your athlete. Reload the page
    and open History again: it is still there.
14. **Camera released.** Leave the session (Exit, or another section). Expected: the camera light goes off
    within a couple of seconds.
15. **Optional: camera lost mid-set.** With an external webcam, unplug it during a set. Expected:
    *Camera stopped*, with *Try again* and *End set* both visible without scrolling; *End set* keeps the
    reps so far.
16. **Optional: phone.** Open the Preview on a phone, upright and held sideways, and repeat steps 3, 5 and
    14.

## Recorded run, 2026-10-16

Reported by the project owner, Adam Tang: the smoke test was run on the M7 build on an ASUS ProArt laptop
with a physical webcam and real movements, and everything tested worked.

This is the owner's report of a manual functional check. It does not record which steps were run, the
browser and version, rep counts or timings, and nobody else observed the run. It measures nothing about
detection accuracy and is not validation of the detector. The table below is a template for the next run.

## Results

| Step | Result (pass / fail / not run) | Notes |
|---|---|---|
| Browser, version, laptop, camera | | |
| 1 No athlete yet | | |
| 2 Permission refused | | |
| 3 Starting | | |
| 4 Empty room | | |
| 5 Ready | | |
| 6 Calibration | | |
| 7 Monitoring (reps counted / reps done) | | |
| 8 Form change (alert at rep, or none) | | |
| 9 Tracking lost (about how many seconds) | | |
| 10 End set | | |
| 11 Recovery check | | |
| 12 Summary and exports | | |
| 13 History and storage | | |
| 14 Camera released | | |
| 15 Camera lost mid-set (optional) | | |
| 16 Phone (optional) | | |

Anything that fails, looks wrong or is slow: note what you saw, and a screenshot if you can.
