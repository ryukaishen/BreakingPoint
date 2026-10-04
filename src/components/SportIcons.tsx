import type { SportIconId } from '../protocols/sports';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function SportIcon({ id, size = 28 }: { id: SportIconId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {id === 'soccer' && (
        <g {...P}>
          <circle cx="16" cy="16" r="12" />
          <polygon points="16,10.5 21,14.2 19.1,20 12.9,20 11,14.2" />
          <path d="M16 10.5V4.2M21 14.2l6-2M19.1 20l3.8 5.2M12.9 20l-3.8 5.2M11 14.2l-6-2" />
        </g>
      )}
      {id === 'basketball' && (
        <g {...P}>
          <circle cx="16" cy="16" r="12" />
          <path d="M4 16h24M16 4v24M7.5 7.5c3.6 3.6 3.6 13.4 0 17M24.5 7.5c-3.6 3.6-3.6 13.4 0 17" />
        </g>
      )}
      {id === 'volleyball' && (
        <g {...P}>
          <circle cx="16" cy="16" r="12" />
          <path d="M16 16c0-5 2-9 6.5-11.2M16 16c-4.3 2.5-8.8 2.7-12 0M16 16c4.3 2.5 6.8 6.3 7 10.8" />
          <path d="M16 4c-3 3-4 7.5-3 12M4.6 20.4c3.8 0.4 7.6-1.2 11.4-4.4" />
        </g>
      )}
      {id === 'racquet' && (
        <g {...P}>
          <ellipse cx="13" cy="12" rx="7.5" ry="8.5" transform="rotate(-35 13 12)" />
          <path d="M8.6 9.2l8.8 5.6M10.5 6.2l8.8 5.6M7.6 12.7l7.6 4.8" opacity="0.6" />
          <path d="M18 18.5l7.5 8" strokeWidth="2.4" />
          <circle cx="25" cy="8" r="2.4" />
        </g>
      )}
      {id === 'strength' && (
        <g {...P}>
          <path d="M5 16h22" strokeWidth="2" />
          <rect x="7" y="10" width="3" height="12" rx="1" />
          <rect x="22" y="10" width="3" height="12" rx="1" />
          <rect x="3.5" y="12.5" width="2.5" height="7" rx="0.8" />
          <rect x="26" y="12.5" width="2.5" height="7" rx="0.8" />
        </g>
      )}
      {id === 'martial' && (
        <g {...P}>
          <path d="M6 26L24 6M26 26L8 6" strokeWidth="1.9" />
          <path d="M9.5 19.5l3 3M22.5 19.5l-3 3" />
          <circle cx="24.5" cy="5.5" r="1.4" />
          <circle cx="7.5" cy="5.5" r="1.4" />
        </g>
      )}
      {id === 'running' && (
        <g {...P}>
          <circle cx="19" cy="6" r="2.4" />
          <path d="M17.5 10.5l-4 6 5 2.5-2 7.5M13.5 16.5l-5 1.5M17.5 10.5l5 4.5 4-1M18.5 19l3.5 2" />
        </g>
      )}
      {id === 'gymnastics' && (
        <g {...P}>
          <path d="M10 3v13M22 3v13" />
          <circle cx="10" cy="20" r="4" />
          <circle cx="22" cy="20" r="4" />
          <path d="M4 3h24" />
        </g>
      )}
      {id === 'field' && (
        <g {...P}>
          <path d="M9 4v16M23 4v16M9 13h14M5 27h22" />
          <ellipse cx="16" cy="23.5" rx="3.2" ry="2" transform="rotate(-20 16 23.5)" />
        </g>
      )}
    </svg>
  );
}
