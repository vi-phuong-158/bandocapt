import { BE_VIETNAM_PRO } from './load-font';

// Bang mau: xanh duong dam + xanh ngoc + trang, khong gradient, khong 3D.
export const COLORS = {
  background: '#F4F7FC',
  panelDivider: '#DCE6F5',
  panelBorder: '#DCE6F5',
  deepBlue: '#0B3C8C',
  blueSoft: '#3E6CC4',
  teal: '#0D9C86',
  tealSoft: '#CFF3EC',
  tealBg: '#E8FAF6',
  white: '#FFFFFF',
  // Nen "im lang" cho card o trang thai idle — khong dung trang thuan de card
  // khong "hien dien" bang duong vien nhu nhau, chi noi bat khi active (elevation
  // = phan cap thong tin, khong phai trang tri mac dinh).
  idleFill: '#F8FAFE',
  ink: '#0F1E3D',
  slate: '#4B5A78',
  muted: '#8493AC',
  dotGrid: '#D7E2F5',
} as const;

// Shadow 2 lop (ambient rong + contact sat vien), tint theo hue nen thay vi
// den chung chung — mo phong mot huong sang duy nhat, nhat quan toan bo scene.
export const SHADOW = {
  idle: 'none',
  raised: '0 1px 2px rgba(15, 30, 61, 0.06), 0 10px 22px rgba(20, 40, 90, 0.08)',
  active: '0 2px 4px rgba(11, 60, 140, 0.10), 0 16px 34px rgba(11, 60, 140, 0.16)',
  teal: '0 2px 4px rgba(13, 156, 134, 0.12), 0 16px 30px rgba(13, 156, 134, 0.18)',
} as const;

export const FONT_FAMILY = `${BE_VIETNAM_PRO}, 'Segoe UI', sans-serif`;

export const RADIUS = { card: 18, chip: 12, bubble: 16 } as const;
