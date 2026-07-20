import React from 'react';
import { Point, quadraticPoint } from '../geometry';
import { COLORS } from '../theme';

export type MovingDataPacketProps = {
  p0: Point;
  p1: Point;
  p2: Point;
  progress: number; // 0..1, da duoc interpolate() theo frame o component cha
  color?: string;
  size?: number;
};

// Goi du lieu nho di chuyen theo duong cong Bezier bac 2 giua hai thanh phan.
// Vi tri tinh thuan tuy theo `progress` (khong dung ref/DOM) => on dinh moi frame.
export const MovingDataPacket: React.FC<MovingDataPacketProps> = ({
  p0,
  p1,
  p2,
  progress,
  color = COLORS.teal,
  size = 16,
}) => {
  if (progress <= 0 || progress >= 1) return null;
  const point = quadraticPoint(progress, p0, p1, p2);
  // Mo dan o hai dau quy dao de goi "xuat hien" va "bien mat" muot, khong giat.
  const edgeFade = Math.min(progress / 0.08, (1 - progress) / 0.08, 1);

  return (
    <div
      style={{
        position: 'absolute',
        left: point.x - size / 2,
        top: point.y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        opacity: edgeFade,
        boxShadow: `0 0 0 6px ${color}22`,
      }}
    />
  );
};
