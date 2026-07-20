import React from 'react';
import { COLORS, FONT_FAMILY, SHADOW } from '../theme';
import { DocumentIcon, LayersIcon } from '../icons';

export type ContextBuilderProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  buildProgress: number; // 0..1 — tien do gom 2 tai lieu thanh 1 goi ngu canh
  slotLabels: [string, string];
  entrance: number; // 0..1
};

// Card "Xay ngu canh": lap ghep 2 tai lieu da chon thanh mot goi du lieu duy nhat
// truoc khi chuyen cho LlmProcessor. Cac o (slot) xuat hien so le theo buildProgress.
export const ContextBuilder: React.FC<ContextBuilderProps> = ({
  x,
  y,
  width,
  height,
  buildProgress,
  slotLabels,
  entrance,
}) => {
  const slot1 = Math.min(1, Math.max(0, buildProgress / 0.55));
  const slot2 = Math.min(1, Math.max(0, (buildProgress - 0.35) / 0.55));
  const isActive = buildProgress > 0.02;
  const borderColor = `rgba(13, 156, 134, ${Math.min(1, buildProgress * 3).toFixed(3)})`;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        opacity: entrance,
        background: isActive ? COLORS.white : COLORS.idleFill,
        border: `2.5px solid ${borderColor}`,
        borderRadius: 18,
        boxShadow: isActive ? SHADOW.active : SHADOW.idle,
        boxSizing: 'border-box',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <LayersIcon color={isActive ? COLORS.teal : COLORS.blueSoft} size={22} />
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 700, color: COLORS.ink }}>Xây ngữ cảnh</span>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {[slot1, slot2].map((slotReveal, i) => (
          <div
            key={slotLabels[i]}
            style={{
              flex: 1,
              opacity: slotReveal,
              transform: `translateY(${(1 - slotReveal) * 14}px)`,
              background: COLORS.tealBg,
              border: `1.5px solid ${COLORS.tealSoft}`,
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <DocumentIcon color={COLORS.teal} size={18} />
            <span style={{ fontFamily: FONT_FAMILY, fontSize: 14.5, fontWeight: 600, color: COLORS.ink, lineHeight: 1.25 }}>
              {slotLabels[i]}
            </span>
          </div>
        ))}
      </div>
      <div style={{ height: 8, borderRadius: 4, background: COLORS.tealBg, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${buildProgress * 100}%`, background: COLORS.teal }} />
      </div>
    </div>
  );
};
