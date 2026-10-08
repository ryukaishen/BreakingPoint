import { C } from '../ui/theme';
import { CONNECTIONS, LEFT_SIDE, LM, RIGHT_SIDE, type Pose } from './landmarks';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largest rect of the given aspect ratio centered inside (w, h) — like object-fit: contain. */
export function containRect(w: number, h: number, aspect: number): Rect {
  if (w / h > aspect) {
    const cw = h * aspect;
    return { x: (w - cw) / 2, y: 0, w: cw, h };
  }
  const ch = w / aspect;
  return { x: 0, y: (h - ch) / 2, w, h: ch };
}

export interface DrawOptions {
  mirror: boolean;
  color: string;
  /** Landmark pairs to emphasise (top contributing segments). */
  highlight?: [number, number][];
  highlightColor?: string;
  visMin?: number;
}

/** Map feature keys to the body segments that explain them on the overlay. */
export function segmentsForFeatures(keys: string[]): [number, number][] {
  const out: [number, number][] = [];
  for (const k of keys) {
    if (k === 'trunkLean') out.push([LM.leftHip, LM.leftShoulder], [LM.rightHip, LM.rightShoulder]);
    if (k === 'kneeRomL' || k === 'depth' || k === 'hipRom' || k === 'countermovementDepth' || k === 'landingKneeFlex')
      out.push([LM.leftHip, LM.leftKnee], [LM.leftKnee, LM.leftAnkle]);
    if (k === 'kneeRomR' || k === 'asymmetry') out.push([LM.rightHip, LM.rightKnee], [LM.rightKnee, LM.rightAnkle]);
  }
  return out;
}

export function drawPose(ctx: CanvasRenderingContext2D, pose: Pose, rect: Rect, o: DrawOptions) {
  const visMin = o.visMin ?? 0.35;
  const P = (i: number) => {
    const p = pose[i];
    const x = o.mirror ? rect.x + rect.w - p.x * rect.w : rect.x + p.x * rect.w;
    return { x, y: rect.y + p.y * rect.h, v: p.visibility };
  };
  const scale = rect.h / 720;
  const hl = new Set((o.highlight ?? []).map(([a, b]) => `${a}-${b}`));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // far side first (dimmer), then near side
  const order = [...CONNECTIONS].sort((a, b) => {
    const fa = RIGHT_SIDE.has(a[0]) ? 0 : 1;
    const fb = RIGHT_SIDE.has(b[0]) ? 0 : 1;
    return fa - fb;
  });
  for (const [a, b] of order) {
    const pa = P(a);
    const pb = P(b);
    if (Math.min(pa.v, pb.v) < visMin) continue;
    const isHl = hl.has(`${a}-${b}`) || hl.has(`${b}-${a}`);
    const far = RIGHT_SIDE.has(a) && RIGHT_SIDE.has(b);
    ctx.strokeStyle = isHl ? (o.highlightColor ?? C.break) : o.color;
    ctx.globalAlpha = far ? 0.45 : 0.95;
    ctx.lineWidth = (isHl ? 9 : 6) * scale;
    ctx.shadowColor = isHl ? (o.highlightColor ?? C.break) : o.color;
    ctx.shadowBlur = (isHl ? 22 : 12) * scale;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // head
  const ear = pose[LM.leftEar].visibility >= pose[LM.rightEar].visibility ? P(LM.leftEar) : P(LM.rightEar);
  const nose = P(LM.nose);
  const sh = pose[LM.leftShoulder].visibility >= pose[LM.rightShoulder].visibility ? P(LM.leftShoulder) : P(LM.rightShoulder);
  if (ear.v >= visMin && sh.v >= visMin) {
    const hx = nose.v >= visMin ? (ear.x * 2 + nose.x) / 3 : ear.x;
    const hy = nose.v >= visMin ? (ear.y * 2 + nose.y) / 3 : ear.y;
    const r = Math.max(6 * scale, Math.hypot(ear.x - sh.x, ear.y - sh.y) * 0.42);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = C.abyss;
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 3 * scale;
    ctx.shadowColor = o.color;
    ctx.shadowBlur = 12 * scale;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  const joints = [...LEFT_SIDE, ...RIGHT_SIDE].filter((i) => i !== LM.leftEar && i !== LM.rightEar);
  for (const i of joints) {
    const p = P(i);
    if (p.v < visMin) continue;
    const far = RIGHT_SIDE.has(i);
    ctx.globalAlpha = far ? 0.5 : 1;
    ctx.fillStyle = C.abyss;
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Studio backdrop for demo mode (floor line + measurement grid). */
export function drawStudio(ctx: CanvasRenderingContext2D, rect: Rect, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const floorY = rect.y + rect.h * 0.905;
  ctx.save();
  ctx.strokeStyle = 'rgba(140, 180, 230, 0.06)';
  ctx.lineWidth = 1;
  const step = rect.h / 12;
  for (let x = rect.x + (rect.w / 2) % step; x < rect.x + rect.w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, floorY);
    ctx.stroke();
  }
  for (let y = floorY; y > rect.y; y -= step) {
    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, floorY, 0, rect.y + rect.h);
  g.addColorStop(0, 'rgba(61, 184, 255, 0.08)');
  g.addColorStop(1, 'rgba(61, 184, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, floorY, rect.w, rect.y + rect.h - floorY);
  ctx.strokeStyle = 'rgba(61, 184, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w * 0.12, floorY);
  ctx.lineTo(rect.x + rect.w * 0.88, floorY);
  ctx.stroke();
  ctx.restore();
}
