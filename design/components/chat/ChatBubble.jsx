import React from 'react';

/**
 * ChatBubble — a message in the AI assistant. role: 'assistant'
 * (white, left, with avatar + label) or 'user' (blue, right).
 * Supports an optional disclaimer footnote on assistant messages.
 */
export function ChatBubble({ role = 'assistant', children, label = 'Trợ lý hỗ trợ pháp luật', avatar, disclaimer, style }) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex', gap: 9, alignItems: 'flex-start',
        justifyContent: isUser ? 'flex-end' : 'flex-start', ...style,
      }}
    >
      {!isUser && avatar && (
        <img src={avatar} alt="" style={{ width: 24, height: 24, objectFit: 'contain', marginTop: 7, opacity: 0.9, flexShrink: 0 }} />
      )}
      <div
        style={{
          maxWidth: 'min(86%, 330px)', padding: '13px 15px',
          fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.58, wordBreak: 'break-word',
          background: isUser ? 'var(--color-primary)' : '#fff',
          color: isUser ? '#fff' : 'var(--slate-800)',
          border: isUser ? 'none' : '1px solid var(--slate-200)',
          borderRadius: 18,
          borderTopLeftRadius: isUser ? 18 : 5,
          borderTopRightRadius: isUser ? 5 : 18,
          boxShadow: isUser ? '0 8px 26px rgba(29,78,216,0.16)' : '0 4px 20px rgba(15,23,42,0.04)',
        }}
      >
        {!isUser && (
          <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 800, color: 'var(--color-primary)' }}>{label}</p>
        )}
        <div>{children}</div>
        {!isUser && disclaimer && (
          <p style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--slate-200)', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>{disclaimer}</p>
        )}
      </div>
    </div>
  );
}
