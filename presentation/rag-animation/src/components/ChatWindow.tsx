import React from 'react';
import { COLORS, FONT_FAMILY, RADIUS, SHADOW } from '../theme';
import { ChatIcon } from '../icons';
import { UserQuestion } from './UserQuestion';
import { SourceCitation } from './SourceCitation';
import { VerifiedLocation } from './VerifiedLocation';

export type ChatWindowProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  entrance: number; // 0..1 xuat hien khung chat
  questionText: string;
  questionReveal: number;
  statusOpacity: number;
  statusDots: string; // '.', '..', '...' — tinh theo frame % o component cha
  answerOpacity: number;
  answerText: string; // da duoc cat (slice) theo so ky tu hien tai o component cha
  citations: { label: string; reveal: number }[];
  location: { name: string; address: string; reveal: number }; // tru so da xac minh
};

// Khung mo phong giao dien chatbot: header + khu vuc tin nhan (cau hoi / trang thai /
// cau tra loi + trich dan) + o nhap tinh. Moi trang thai duoc dieu khien qua props
// (opacity/reveal) da tinh san boi RagSlideAnimation theo frame.
export const ChatWindow: React.FC<ChatWindowProps> = ({
  x,
  y,
  width,
  height,
  entrance,
  questionText,
  questionReveal,
  statusOpacity,
  statusDots,
  answerOpacity,
  answerText,
  citations,
  location,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 24}px)`,
        background: COLORS.white,
        border: `2px solid ${COLORS.panelBorder}`,
        borderRadius: RADIUS.card,
        boxShadow: SHADOW.raised,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '22px 26px',
          borderBottom: `2px solid ${COLORS.panelBorder}`,
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            background: COLORS.deepBlue,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChatIcon color={COLORS.white} size={24} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: FONT_FAMILY, fontSize: 21, fontWeight: 700, color: COLORS.ink }}>Trợ lý AI</span>
          <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 500, color: COLORS.teal }}>● Đang hoạt động</span>
        </div>
      </div>

      {/* Khu vuc tin nhan */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 16,
          padding: '24px 26px',
          minHeight: 0,
        }}
      >
        <UserQuestion text={questionText} reveal={questionReveal} />

        {statusOpacity > 0.01 ? (
          <div
            style={{
              alignSelf: 'flex-start',
              opacity: statusOpacity,
              background: COLORS.tealBg,
              borderRadius: '4px 18px 18px 18px',
              padding: '14px 20px',
              fontFamily: FONT_FAMILY,
              fontSize: 19,
              fontWeight: 600,
              color: COLORS.deepBlue,
            }}
          >
            {`Đang truy xuất dữ liệu${statusDots}`}
          </div>
        ) : null}

        {answerOpacity > 0.01 ? (
          <div
            style={{
              alignSelf: 'flex-start',
              opacity: answerOpacity,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              maxWidth: '96%',
            }}
          >
            <div
              style={{
                background: COLORS.tealBg,
                borderRadius: '4px 18px 18px 18px',
                padding: '16px 20px',
                fontFamily: FONT_FAMILY,
                fontSize: 21,
                fontWeight: 600,
                lineHeight: 1.5,
                color: COLORS.ink,
              }}
            >
              {answerText}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {citations.map((c) => (
                <SourceCitation key={c.label} label={c.label} reveal={c.reveal} />
              ))}
            </div>
            <VerifiedLocation name={location.name} address={location.address} reveal={location.reveal} />
          </div>
        ) : null}
      </div>

      {/* O nhap cau hoi (thanh phan UI tinh, luon hien dien) */}
      <div style={{ padding: '0 26px 26px 26px' }}>
        <div
          style={{
            border: `2px solid ${COLORS.panelBorder}`,
            borderRadius: 999,
            padding: '16px 22px',
            fontFamily: FONT_FAMILY,
            fontSize: 18,
            fontWeight: 500,
            color: COLORS.muted,
          }}
        >
          Nhập câu hỏi của bạn...
        </div>
      </div>
    </div>
  );
};
