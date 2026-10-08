// Design tokens for SVG and canvas drawing. These mirror the CSS custom
// properties in src/styles.css (see docs/DESIGN_SYSTEM.md); keep both in sync.

export const C = {
  void: '#05070d',
  abyss: '#080c16',
  panel: '#0b1120',
  panel2: '#0f1729',
  panel3: '#152038',
  line: '#18233a',
  line2: '#24334f',
  text: '#e8eef7',
  text2: '#a7b4c8',
  muted: '#7a89a1',
  dim: '#5d6c85',
  sys: '#3db8ff',
  ice: '#a5e9ff',
  violet: '#9c8aff',
  stable: '#3be3a8',
  drift: '#ffb547',
  break: '#ff4560',
} as const;

export const FONT_DISPLAY = "Saira, 'Barlow Semi Condensed', system-ui, sans-serif";
export const FONT_TEXT = "'IBM Plex Sans', system-ui, sans-serif";
