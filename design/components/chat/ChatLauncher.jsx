import React from 'react';

/**
 * ChatLauncher — the floating entry point to the AI assistant.
 * Prominent by design: mascot avatar, label + sublabel, an online
 * dot, a pulsing attention ring, and a strong brand glow.
 * Pass `avatar` (e.g. the icon.png mascot); falls back to an icon.
 */
export function ChatLauncher({
  label = 'Hỏi đáp AI',
  sublabel = 'Trợ lý pháp luật · 24/7',
  avatar,
  icon = 'chat_bubble',
  pulse = true,
  onClick,
  style,
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', ...style }}>
      <style>{`@keyframes ds-chat-pulse{0%{transform:scale(0.85);opacity:.55}70%{transform:scale(1.55);opacity:0}100%{opacity:0}}`}</style>
      {pulse && (
        <>
          <span aria-hidden="true" style={{ position: 'absolute', left: 4, top: '50%', width: 56, height: 56, marginTop: -28, borderRadius: '50%', background: 'rgba(29,78,216,0.35)', animation: 'ds-chat-pulse 2.4s ease-out infinite', pointerEvents: 'none' }} />
          <span aria-hidden="true" style={{ position: 'absolute', left: 4, top: '50%', width: 56, height: 56, marginTop: -28, borderRadius: '50%', background: 'rgba(29,78,216,0.30)', animation: 'ds-chat-pulse 2.4s ease-out 1.2s infinite', pointerEvents: 'none' }} />
        </>
      )}
      <button
        onClick={onClick}
        style={{
          position: 'relative', zIndex: 1,
          display: 'inline-flex', alignItems: 'center', gap: 12,
          height: 64, padding: '0 22px 0 8px',
          background: 'var(--color-primary)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.14)', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
          boxShadow: '0 14px 34px rgba(29,78,216,0.42), inset 0 1px 1px rgba(255,255,255,0.25)',
          transition: 'transform var(--dur-base) var(--ease-spring), box-shadow var(--dur-base)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 20px 44px rgba(29,78,216,0.5), inset 0 1px 1px rgba(255,255,255,0.25)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 14px 34px rgba(29,78,216,0.42), inset 0 1px 1px rgba(255,255,255,0.25)'; }}
      >
        <span style={{ position: 'relative', width: 48, height: 48, flexShrink: 0, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(15,23,42,0.18)' }}>
          {avatar
            ? <img src={avatar} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            : <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--color-primary)' }}>{icon}</span>}
          <span style={{ position: 'absolute', right: 1, bottom: 2, width: 12, height: 12, borderRadius: '50%', background: 'var(--emerald-500)', border: '2.5px solid #fff' }} />
        </span>
        <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800 }}>{label}</span>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>{sublabel}</span>
        </span>
      </button>
    </div>
  );
}
