import React from 'react';
import { COLORS, FONT_FAMILY } from '../theme';
import { LinkIcon } from '../icons';

export type SourceCitationProps = {
  label: string;
  reveal: number; // 0..1 (spring o component cha)
};

// Chip nguon tham khao hien o cuoi cau tra loi cua chatbot.
export const SourceCitation: React.FC<SourceCitationProps> = ({ label, reveal }) => {
  if (reveal <= 0.01) return null;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 10}px)`,
        background: COLORS.tealBg,
        border: `1.5px solid ${COLORS.tealSoft}`,
        borderRadius: 999,
        padding: '8px 16px',
      }}
    >
      <LinkIcon color={COLORS.teal} size={16} />
      <span style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 600, color: COLORS.deepBlue }}>{label}</span>
    </div>
  );
};
