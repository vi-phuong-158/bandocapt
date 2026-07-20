import React from 'react';
import { COLORS, FONT_FAMILY, SHADOW } from '../theme';
import { CpuIcon } from '../icons';

export type LlmProcessorProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  active: number; // 0..1
  pulse: number; // 0..1 dao dong "dang xu ly" — tinh theo frame o component cha
  entrance: number; // 0..1
};

// Node mo hinh ngon ngu: vong tron ben ngoai "tho" theo pulse khi active,
// bieu thi qua trinh sinh cau tra loi tu goi ngu canh da nhan.
export const LlmProcessor: React.FC<LlmProcessorProps> = ({ x, y, width, height, active, pulse, entrance }) => {
  const isActive = active > 0.02;
  const ringScale = 1 + pulse * active * 0.08;
  const ringOpacity = 0.22 + pulse * active * 0.35;
  const borderColor = `rgba(13, 156, 134, ${Math.min(1, active).toFixed(3)})`;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        opacity: entrance,
        transform: `scale(${0.94 + entrance * 0.06})`,
        transformOrigin: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 24,
          border: `2px solid ${COLORS.teal}`,
          opacity: ringOpacity,
          transform: `scale(${ringScale})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isActive ? COLORS.white : COLORS.idleFill,
          border: `2.5px solid ${borderColor}`,
          borderRadius: 22,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          boxShadow: isActive ? SHADOW.active : SHADOW.idle,
        }}
      >
        <div
          style={{
            width: 66,
            height: 66,
            borderRadius: 16,
            background: isActive ? COLORS.teal : COLORS.blueSoft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CpuIcon color={COLORS.white} size={32} />
        </div>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 24, fontWeight: 700, letterSpacing: -0.3, color: COLORS.ink }}>
          Mô hình ngôn ngữ
        </span>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 500, color: COLORS.muted }}>
          Sinh câu trả lời có căn cứ
        </span>
      </div>
    </div>
  );
};
