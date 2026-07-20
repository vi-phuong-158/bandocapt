import React from 'react';
import { Point, approxCurveLength, quadraticPathD } from '../geometry';
import { COLORS } from '../theme';

export type RetrievalBeamProps = {
  id: string; // dinh danh duy nhat (dung cho SVG marker id, tranh trung giua nhieu beam)
  p0: Point;
  p1: Point;
  p2: Point;
  progress: number; // 0..1 muc do "ve" duong noi, tinh theo frame o component cha
  dashed?: boolean; // true = duong tham chieu mong (vd. beam trich dan nguoc)
  color?: string;
  opacity?: number;
};

// Duong ket noi co huong (SVG) giua hai thanh phan trong pipeline, kem mui ten
// khi da ve gan xong. Dung chung do dai uoc luong tu da giac dieu khien
// (khong can do DOM) de dieu khien hieu ung "ve dan" bang stroke-dasharray.
export const RetrievalBeam: React.FC<RetrievalBeamProps> = ({
  id,
  p0,
  p1,
  p2,
  progress,
  dashed = false,
  color = COLORS.blueSoft,
  opacity = 1,
}) => {
  if (progress <= 0) return null;
  const d = quadraticPathD(p0, p1, p2);
  const length = approxCurveLength(p0, p1, p2);
  const markerId = `beam-arrow-${id}`;

  const dashArray = dashed ? '10 9' : `${length} ${length}`;
  const dashOffset = dashed ? 0 : length * (1 - progress);
  const strokeOpacity = dashed ? Math.min(progress, 1) * opacity : opacity;

  return (
    <svg
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
      width="1"
      height="1"
    >
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill={color} />
        </marker>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={dashed ? 2.5 : 3}
        strokeLinecap="round"
        strokeDasharray={dashArray}
        strokeDashoffset={dashOffset}
        opacity={strokeOpacity}
        markerEnd={progress > 0.92 ? `url(#${markerId})` : undefined}
      />
    </svg>
  );
};
