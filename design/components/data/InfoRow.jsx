import React from 'react';

/**
 * InfoRow — labelled detail line with a round icon medallion.
 * Used in the unit detail panel for address / phone / hours.
 */
export function InfoRow({ icon, label, value, href, style }) {
  const medallion = (
    <span
      style={{
        width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-muted)', border: '1px solid var(--border-glass)',
        color: 'var(--color-primary)', boxShadow: 'var(--shadow-sm)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
    </span>
  );
  const body = (
    <span style={{ paddingTop: 6 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</span>
      <span style={{ display: 'block', fontSize: 15, fontWeight: href ? 700 : 500, color: 'var(--slate-800)', lineHeight: 1.35 }}>{value}</span>
    </span>
  );
  const inner = (<><span style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>{medallion}{body}</span></>);
  if (href) {
    return <a href={href} style={{ textDecoration: 'none', display: 'block', ...style }}>{inner}</a>;
  }
  return <div style={style}>{inner}</div>;
}
