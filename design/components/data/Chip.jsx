import React from 'react';

/**
 * Chip — fully-rounded pill, e.g. the emerald distance tag or a
 * frosted glass overlay tag on the detail image. tone + glass.
 */
export function Chip({ children, tone = 'nearby', glass = false, icon, style }) {
  const tones = {
    nearby: ['var(--emerald-100)', 'var(--emerald-700)'],
    primary: ['var(--blue-50)', 'var(--color-primary)'],
    amber: ['var(--amber-50)', 'var(--amber-700)'],
    neutral: ['var(--surface-sunken)', 'var(--slate-600)'],
  };
  const [bg, fg] = tones[tone] || tones.nearby;
  const glassStyle = glass
    ? { background: 'var(--glass-fill-strong)', color: 'var(--color-primary)', boxShadow: 'var(--shadow-card)', border: '1px solid var(--glass-stroke)', backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)' }
    : { background: bg, color: fg };
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 12px',
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
        borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap', lineHeight: 1.3,
        ...glassStyle, ...style,
      }}
    >
      {icon && <span className="material-symbols-outlined" style={{ fontSize: 15, fontVariationSettings: "'FILL' 1" }}>{icon}</span>}
      {children}
    </span>
  );
}
