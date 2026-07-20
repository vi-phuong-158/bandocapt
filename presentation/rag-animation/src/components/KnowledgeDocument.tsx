import React from 'react';
import { COLORS, FONT_FAMILY, SHADOW } from '../theme';
import { DocumentIcon } from '../icons';

export type KnowledgeDocumentProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  opacity: number; // gia tri cuoi cung, tinh san o component cha (reveal * dim)
  scale: number; // 0.85..1 hieu ung xuat hien
  highlighted: boolean;
};

// The tai lieu nho trong kho ngu lieu; tai lieu duoc chon (highlighted) giu vien
// xanh ngoc + do net, cac tai lieu con lai duoc lam mo dan (opacity tinh o cha).
export const KnowledgeDocument: React.FC<KnowledgeDocumentProps> = ({
  x,
  y,
  width,
  height,
  label,
  opacity,
  scale,
  highlighted,
}) => {
  if (opacity <= 0.01) return null;
  // Tai lieu thuong: nen nhat, khong vien, khong shadow — "im lang" trong nen.
  // Tai lieu duoc chon: nen trang + vien xanh ngoc + shadow — elevation bao hieu "day la bang chung".
  const borderColor = highlighted ? COLORS.teal : 'transparent';
  const iconColor = highlighted ? COLORS.teal : COLORS.blueSoft;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center',
        background: highlighted ? COLORS.white : COLORS.idleFill,
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 8,
        padding: '0 14px',
        boxSizing: 'border-box',
        boxShadow: highlighted ? SHADOW.teal : SHADOW.idle,
      }}
    >
      <DocumentIcon color={iconColor} size={20} />
      <span
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 15,
          fontWeight: 600,
          color: COLORS.ink,
          lineHeight: 1.25,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {label}
      </span>
    </div>
  );
};
