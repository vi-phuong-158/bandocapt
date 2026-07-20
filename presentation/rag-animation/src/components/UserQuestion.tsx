import React from 'react';
import { COLORS, FONT_FAMILY } from '../theme';

export type UserQuestionProps = {
  text: string;
  reveal: number; // 0..1 (spring o component cha)
};

// Bong tin nhan cua nguoi dung trong ChatWindow.
export const UserQuestion: React.FC<UserQuestionProps> = ({ text, reveal }) => (
  <div
    style={{
      alignSelf: 'flex-end',
      maxWidth: '86%',
      opacity: reveal,
      transform: `translateY(${(1 - reveal) * 16}px) scale(${0.92 + reveal * 0.08})`,
      transformOrigin: 'right center',
      background: COLORS.deepBlue,
      color: COLORS.white,
      borderRadius: '18px 18px 4px 18px',
      padding: '16px 20px',
      fontFamily: FONT_FAMILY,
      fontSize: 24,
      fontWeight: 600,
      lineHeight: 1.35,
    }}
  >
    {text}
  </div>
);
