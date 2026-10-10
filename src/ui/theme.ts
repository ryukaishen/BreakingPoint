// Design tokens for SVG and canvas drawing. These mirror the CSS custom
// properties in src/styles.css (Breakaway design system, docs/DESIGN_SYSTEM.md);
// keep both in sync.

export const C = {
  void: '#05070d',
  abyss: '#0a1124',
  panel: '#0d1322',
  panel2: '#121a2e',
  panel3: '#18223a',
  line: '#1c2740',
  line2: '#2a3a5c',
  text: '#eef2f8',
  text2: '#a9b5c7',
  muted: '#7f8ca3',
  dim: '#5d6a82',
  /** Electric cobalt: actions and fills. */
  sys: '#2f5bff',
  /** Cobalt light: the STABLE state and data drawn on dark. */
  stable: '#6b8cff',
  ice: '#8fe9ff',
  /** Detector evidence (CUSUM, onset): quiet steel, never a state colour. */
  violet: '#8a97ad',
  evidence: '#8a97ad',
  drift: '#ffb03a',
  break: '#ff3b57',
  /** Reserved for a genuine new record. */
  lime: '#c8ff2e',
} as const;

export const FONT_DISPLAY = "'Mona Sans Variable', system-ui, sans-serif";
export const FONT_NUM = "'Anybody Variable', 'Mona Sans Variable', system-ui, sans-serif";
export const FONT_TEXT = "'Mona Sans Variable', system-ui, sans-serif";
