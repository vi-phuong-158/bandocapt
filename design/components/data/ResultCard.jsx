import React from 'react';
import { Chip } from './Chip.jsx';

/**
 * ResultCard — a search result row: colored icon box, title,
 * address, optional distance chip. Glassy, lifts on hover.
 * type: 'police' | 'cccd' drives the icon + color.
 */
export function ResultCard({ title, address, type = 'police', distance, onClick, style }) {
  const conf = {
    police: { color: 'var(--color-primary)', icon: 'local_police' },
    cccd: { color: 'var(--color-cccd)', icon: 'badge' },
  }[type] || { color: 'var(--color-primary)', icon: 'local_police' };

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', gap: 14, alignItems: 'flex-start',
        padding: '16px 14px', textAlign: 'left',
        background: 'var(--glass-fill)', backdropFilter: 'var(--blur-sm)', WebkitBackdropFilter: 'var(--blur-sm)',
        border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)', cursor: 'pointer', font: 'inherit',
        transition: 'transform var(--dur-base) var(--ease-smooth), box-shadow var(--dur-base), background var(--dur-base)',
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)'; e.currentTarget.style.background = '#fff'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; e.currentTarget.style.background = 'var(--glass-fill)'; }}
    >
      <span
        style={{
          width: 44, height: 44, flexShrink: 0, borderRadius: 'var(--radius-md)',
          background: conf.color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>{conf.icon}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
        <span style={{
          display: 'block', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
          color: 'var(--slate-800)', letterSpacing: '-0.2px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4,
        }}>{title}</span>
        <span style={{
          display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--slate-500)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{address}</span>
        {distance && <span style={{ display: 'inline-block', marginTop: 8 }}><Chip tone="nearby" icon="near_me">{distance}</Chip></span>}
      </span>
    </button>
  );
}
