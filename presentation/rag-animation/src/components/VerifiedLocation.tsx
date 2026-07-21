import React from 'react';
import { COLORS, FONT_FAMILY } from '../theme';
import { MapPinIcon, NavigationIcon } from '../icons';

export type VerifiedLocationProps = {
  name: string;
  address: string;
  reveal: number; // 0..1 (spring o component cha)
};

// The "tru so da xac minh" hien o cuoi cau tra loi — mo phong dung cach he thong
// that gan vi tri tu Published_Locations kem nut "Chi duong". Vien trai mau teal
// de phan biet voi bong bong cau tra loi; icon ghim + nut chi duong bang SVG.
export const VerifiedLocation: React.FC<VerifiedLocationProps> = ({ name, address, reveal }) => {
  if (reveal <= 0.01) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 12}px)`,
        background: COLORS.white,
        border: `1.5px solid ${COLORS.tealSoft}`,
        borderLeft: `4px solid ${COLORS.teal}`,
        borderRadius: 14,
        padding: '14px 18px',
        maxWidth: '96%',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 10,
          background: COLORS.tealBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MapPinIcon color={COLORS.teal} size={22} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.teal, letterSpacing: 0.4 }}>
          TRỤ SỞ ĐÃ XÁC MINH
        </span>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 17, fontWeight: 700, color: COLORS.ink }}>{name}</span>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 500, color: COLORS.muted }}>{address}</span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          flexShrink: 0,
          background: COLORS.teal,
          borderRadius: 999,
          padding: '9px 16px',
        }}
      >
        <NavigationIcon color={COLORS.white} size={15} />
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 700, color: COLORS.white }}>Chỉ đường</span>
      </div>
    </div>
  );
};
