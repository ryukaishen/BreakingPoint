import type { SVGProps } from 'react';
import { C } from '../ui/theme';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round', strokeLinejoin: 'round',
});

export const LogoMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <path d="M1 1h50l12 12v50H1z" fill={C.abyss} stroke={C.line2} strokeWidth="2" />
    <polyline points="9,41 18,39 26,42 33,37" fill="none" stroke={C.stable} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="37,33 44,26 50,18 56,12" fill="none" stroke={C.break} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="35" cy="35" r="3.6" fill={C.drift} />
  </svg>
);

export const Lock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const Play = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" /></svg>
);
export const Pause = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="6" y="5" width="4" height="14" fill="currentColor" /><rect x="14" y="5" width="4" height="14" fill="currentColor" /></svg>
);
export const Skip = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><polygon points="5 4 15 12 5 20 5 4" fill="currentColor" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
);
export const Camera = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
);
export const Flask = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" /><path d="M7 15h10" /></svg>
);
export const Book = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></svg>
);
export const Reset = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
);
export const Download = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);
export const Close = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);
export const Check = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><polyline points="20 6 9 17 4 12" /></svg>
);
export const Bolt = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none" /></svg>
);
export const Cpu = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" /></svg>
);
export const Heart = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
);
export const Chevron = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><polyline points="9 6 15 12 9 18" /></svg>
);
