import React from 'react';

/**
 * FilterTabs — segmented pill toggles inside a sunken track.
 * The app uses it for Công an / Điểm CCCD / Gần tôi filters.
 * Each option: { id, label, icon, color }. `selected` is an array
 * of active ids (multi-select toggle).
 */
export function FilterTabs({ options = [], selected = [], onToggle, style }) {
  return (
    <div
      style={{
        display: 'flex', gap: 8, padding: 6,
        background: 'var(--surface-sunken)',
        border: '1px solid var(--glass-stroke)',
        borderRadius: 'var(--radius-pill)',
        ...style,
      }}
    >
      {options.map((opt) => {
        const active = selected.includes(opt.id);
        const accent = opt.color || 'var(--color-primary)';
        return (
          <button
            key={opt.id}
            onClick={() => onToggle && onToggle(opt.id)}
            aria-pressed={active}
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '9px 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
              background: active ? '#fff' : 'transparent',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              transition: 'background var(--dur-base), box-shadow var(--dur-base), color var(--dur-base)',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 20, color: active ? accent : 'var(--slate-400)', fontVariationSettings: "'FILL' 1", transition: 'color var(--dur-base)' }}
            >
              {opt.icon}
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, color: active ? accent : 'var(--slate-500)' }}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
