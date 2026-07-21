import React from 'react';

// Bo icon SVG flat, net mong (khong 3D, khong gradient), mau truyen qua prop color.
export type IconProps = { color: string; size?: number };

export const SearchIcon: React.FC<IconProps> = ({ color, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth="2" />
    <line x1="15.4" y1="15.4" x2="21" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const LayersIcon: React.FC<IconProps> = ({ color, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <polygon points="12,3 21,8 12,13 3,8" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <polyline points="3,13 12,18 21,13" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    <polyline points="3,17.5 12,22.3 21,17.5" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
  </svg>
);

export const DocumentIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M6 2.5H14L19 7.5V21.5H6V2.5Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <path d="M14 2.5V7.5H19" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <line x1="8.4" y1="12" x2="16.6" y2="12" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <line x1="8.4" y1="15.3" x2="16.6" y2="15.3" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <line x1="8.4" y1="18.6" x2="13.6" y2="18.6" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const CpuIcon: React.FC<IconProps> = ({ color, size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="7" y="7" width="10" height="10" rx="1.5" stroke={color} strokeWidth="2" />
    <rect x="10" y="10" width="4" height="4" rx="0.8" stroke={color} strokeWidth="2" />
    <line x1="2.4" y1="8" x2="7" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="2.4" y1="12" x2="7" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="2.4" y1="16" x2="7" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="17" y1="8" x2="21.6" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="17" y1="12" x2="21.6" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="17" y1="16" x2="21.6" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="8" y1="2.4" x2="8" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="2.4" x2="16" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="8" y1="17" x2="8" y2="21.6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="17" x2="16" y2="21.6" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const ChatIcon: React.FC<IconProps> = ({ color, size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M4 5.5C4 4.4 4.9 3.5 6 3.5H18C19.1 3.5 20 4.4 20 5.5V14.5C20 15.6 19.1 16.5 18 16.5H9L5 20V16.5H6C4.9 16.5 4 15.6 4 14.5V5.5Z"
      stroke={color}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export const MapPinIcon: React.FC<IconProps> = ({ color, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 21.5C12 21.5 19 15.5 19 9.5C19 5.63 15.87 2.5 12 2.5C8.13 2.5 5 5.63 5 9.5C5 15.5 12 21.5 12 21.5Z"
      stroke={color}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="9.5" r="2.6" stroke={color} strokeWidth="2" />
  </svg>
);

export const NavigationIcon: React.FC<IconProps> = ({ color, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M21 3L3 10.5L11 13L13.5 21L21 3Z" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

export const LinkIcon: React.FC<IconProps> = ({ color, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M10 14L14 10" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <path
      d="M11.5 6.5L13 5C14.66 3.34 17.34 3.34 19 5C20.66 6.66 20.66 9.34 19 11L17.5 12.5"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M12.5 17.5L11 19C9.34 20.66 6.66 20.66 5 19C3.34 17.34 3.34 14.66 5 13L6.5 11.5"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
