// The live camera runner's failure paths (audit findings 1 and 5). The browser camera, the video element,
// animation frames and the MediaPipe pose engine are stand-ins; the runner, pipeline and engine are real.
// A camera that was granted must never be left running behind an error, and an error while tracking must
// stop processing visibly rather than leave the set looking "Stable" with nothing measured.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDetectorConfig } from '../src/detection/config';
import { SessionEngine } from '../src/session/engine';

vi.mock('../src/pose/poseEngine', () => ({
  PoseEngine: class {
    status = 'idle';
    init = vi.fn(async () => {});
    detect = vi.fn(() => null);
    close = vi.fn();
  },
}));

const { CameraError, LiveRunner } = await import('../src/session/runners');

const config = parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')));

let track: { readyState: string; stop: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> };
let video: { srcObject: unknown; muted: boolean; playsInline: boolean; play: ReturnType<typeof vi.fn>; videoWidth: number; videoHeight: number; readyState: number };
let frames: FrameRequestCallback[];

beforeEach(() => {
  track = {
    readyState: 'live',
    stop: vi.fn(() => {
      track.readyState = 'ended';
    }),
    addEventListener: vi.fn(),
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  video = { srcObject: null, muted: false, playsInline: false, play: vi.fn(async () => {}), videoWidth: 1280, videoHeight: 720, readyState: 4 };
  frames = [];
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

const runner = () => new LiveRunner(new SessionEngine('squat', config, 'Athlete', 'live'), video as unknown as HTMLVideoElement);
/** Runs the newest scheduled animation frame, as the browser would. */
const nextFrame = () => frames[frames.length - 1](performance.now());

describe('a live camera that fails to start after it was granted', () => {
  it('the pose model failing to load turns the camera off and detaches it before reporting', async () => {
    const r = runner();
    r.pose.init = vi.fn(async () => {
      throw new Error('model download failed');
    });
    await expect(r.start()).rejects.toMatchObject({ problem: 'model' });
    expect(track.stop).toHaveBeenCalled();
    expect(track.readyState).toBe('ended');
    expect(video.srcObject).toBeNull();
    expect(r.pose.close).toHaveBeenCalled();
  });

  it('a video that will not play releases the camera too', async () => {
    const r = runner();
    video.play = vi.fn(async () => {
      throw new Error('play() was interrupted');
    });
    const err = await r.start().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CameraError);
    expect((err as InstanceType<typeof CameraError>).problem).toBe('other');
    expect(track.readyState).toBe('ended');
    expect(video.srcObject).toBeNull();
  });

  it('leaving while the model loads releases the camera', async () => {
    const r = runner();
    let finish = () => {};
    r.pose.init = vi.fn(() => new Promise<void>((done) => (finish = done)));
    const started = r.start();
    await vi.waitFor(() => expect(r.pose.init).toHaveBeenCalled());
    r.stop();
    finish();
    await started;
    expect(track.readyState).toBe('ended');
    expect(video.srcObject).toBeNull();
    expect(frames).toHaveLength(0);
  });
});

describe('an error while tracking', () => {
  it('stops processing, turns the camera off and reports it, and the session keeps its state', async () => {
    const r = runner();
    const onFailed = vi.fn();
    await r.start(undefined, undefined, onFailed);
    expect(video.srcObject).not.toBeNull();
    nextFrame(); // a normal frame
    expect(r.pose.detect).toHaveBeenCalledTimes(1);
    const scheduled = frames.length;

    r.pose.detect = vi.fn(() => {
      throw new Error('detectForVideo failed');
    });
    nextFrame();
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(track.readyState).toBe('ended');
    expect(video.srcObject).toBeNull();
    expect(r.pose.close).toHaveBeenCalled();
    // No further frames are processed: nothing new is scheduled, and a stray callback does nothing.
    expect(frames).toHaveLength(scheduled);
    nextFrame();
    expect(r.pose.detect).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });
});

// Live, then Demo, then Live again (audit round 2): both runners share the one <video> element. A start
// that finishes or fails late, after the runner was replaced, must never touch the new runner's camera.
describe('an old camera start that settles after a new one has begun', () => {
  const camera = () => {
    const track = {
      readyState: 'live',
      stop: vi.fn(() => {
        track.readyState = 'ended';
      }),
      addEventListener: vi.fn(),
    };
    return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } };
  };
  const deferred = () => {
    let resolve = () => {};
    let reject: (e: unknown) => void = () => {};
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  /** Starts an old runner that stalls at `stall`, leaves it (Live to Demo), then starts the new runner (Demo to Live). */
  async function replaceWhileStarting(stall: 'model' | 'video') {
    const a = camera();
    const b = camera();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValueOnce(a.stream).mockResolvedValueOnce(b.stream) } });
    const late = deferred();
    const old = runner();
    if (stall === 'model') old.pose.init = vi.fn(() => late.promise);
    else video.play = vi.fn(() => late.promise);
    const oldStart = old.start();
    await vi.waitFor(() => expect(stall === 'model' ? old.pose.init : video.play).toHaveBeenCalled());
    old.stop();
    expect(a.track.readyState).toBe('ended');
    video.play = vi.fn(async () => {});
    const fresh = runner();
    await fresh.start();
    expect(video.srcObject).toBe(b.stream);
    return { a, b, late, old, oldStart, fresh };
  }

  /** The new camera is still on, still shown, and still feeding pose tracking. */
  function expectNewCameraRunning(b: ReturnType<typeof camera>, fresh: ReturnType<typeof runner>) {
    expect(video.srcObject).toBe(b.stream);
    expect(b.track.readyState).toBe('live');
    expect(b.track.stop).not.toHaveBeenCalled();
    expect(fresh.pose.close).not.toHaveBeenCalled();
    nextFrame();
    expect(fresh.pose.detect).toHaveBeenCalledWith(video, expect.any(Number));
  }

  it('the old pose model finishing late leaves the new camera alone', async () => {
    const { b, late, old, oldStart, fresh } = await replaceWhileStarting('model');
    late.resolve();
    await oldStart;
    expectNewCameraRunning(b, fresh);
    expect(old.pose.detect).not.toHaveBeenCalled();
  });

  it('the old pose model failing late leaves the new camera alone, and reports nothing', async () => {
    const { b, late, oldStart, fresh } = await replaceWhileStarting('model');
    late.reject(new Error('model download failed'));
    await expect(oldStart).resolves.toBeUndefined();
    expectNewCameraRunning(b, fresh);
  });

  it('the old video’s play() aborted by the new stream leaves the new camera alone', async () => {
    const { b, late, oldStart, fresh } = await replaceWhileStarting('video');
    late.reject(new DOMException('The play() request was interrupted by a new load request.', 'AbortError'));
    await expect(oldStart).resolves.toBeUndefined();
    expectNewCameraRunning(b, fresh);
  });

  it('an old permission prompt answered late turns its own camera off and never shows it', async () => {
    const a = camera();
    const b = camera();
    const prompt = deferred();
    let calls = 0;
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(() => (++calls === 1 ? prompt.promise.then(() => a.stream) : Promise.resolve(b.stream))) },
    });
    const old = runner();
    const oldStart = old.start();
    old.stop();
    const fresh = runner();
    await fresh.start();
    prompt.resolve();
    await oldStart;
    expect(a.track.readyState).toBe('ended');
    expectNewCameraRunning(b, fresh);
  });
});
