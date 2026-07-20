import React from 'react';
import { COLORS, FONT_FAMILY, SHADOW } from '../theme';
import { IconProps } from '../icons';

export type RagNodeProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  subLabel?: string;
  Icon: React.FC<IconProps>;
  activeAmount: number; // 0 = idle, 1 = dang hoat dong / da hoan tat
  entrance: number; // 0..1 tien do xuat hien (spring o component cha)
};

// Card node dung chung cho cac buoc pipeline RAG (Truy hoi phan tang, Cham diem lai...).
export const RagNode: React.FC<RagNodeProps> = ({
  x,
  y,
  width,
  height,
  label,
  subLabel,
  Icon,
  activeAmount,
  entrance,
}) => {
  // Elevation = trang thai: idle khong vien/khong shadow (chi nen nhat "im lang"),
  // active moi noi vien + nen trang + shadow — the hien phan cap thay vi trang tri co dinh.
  // Vien mo dan theo activeAmount (khong nhay bac) de chuyen trang thai muot.
  const isActive = activeAmount > 0.02;
  const borderColor = `rgba(13, 156, 134, ${Math.min(1, activeAmount).toFixed(3)})`;
  const iconBg = isActive ? COLORS.teal : COLORS.blueSoft;
  const scale = 0.94 + entrance * 0.06;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        opacity: entrance,
        transform: `scale(${scale})`,
        transformOrigin: 'center',
        background: isActive ? COLORS.white : COLORS.idleFill,
        border: `2.5px solid ${borderColor}`,
        borderRadius: 18,
        boxShadow: isActive ? SHADOW.active : SHADOW.idle,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '0 22px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          minWidth: 58,
          borderRadius: 14,
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={COLORS.white} size={28} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: -0.3,
            color: COLORS.ink,
            lineHeight: 1.15,
          }}
        >
          {label}
        </span>
        {subLabel ? (
          <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 500, color: COLORS.muted }}>{subLabel}</span>
        ) : null}
      </div>
    </div>
  );
};
