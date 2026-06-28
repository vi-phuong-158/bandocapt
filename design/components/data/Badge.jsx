import React from 'react';

/**
 * Badge — small status/category label. tone: primary | amber |
 * nearby | neutral. Use solid over imagery, soft on light surfaces.
 */
export function Badge({ children, tone = 'primary', soft = false, icon, style }) {
  const tones = {
    primary: { solid: ['var(--color-primary)', '#fff'], soft: ['var(--blue-50)', 'var(--color-primary)'] },
    amber: { solid: ['var(--color-cccd)', '#fff'], soft: ['var(--amber-50)', 'var(--amber-700)'] },
    nearby: { solid: ['var(--color-nearby)', '#fff'], soft: ['var(--emerald-100)', 'var(--emerald-700)'] },
    neutral: { solid: ['var(--slate-700)', '#fff'], soft: ['var(--surface-sunken)', 'var(--slate-600)'] },
  };
  const [bg, fg] = (tones[tone] || tones.primary)[soft ? 'soft' : 'solid'];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: icon ? '4px 11px 4px 9px' : '4px 11px',
        background: bg, color: fg,
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
        borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap', lineHeight: 1.3,
        ...style,
      }}
    >
      {icon && <span className="material-symbols-outlined" style={{ fontSize: 15, fontVariationSettings: "'FILL' 1" }}>{icon}</span>}
      {children}
    </span>
  );
}
