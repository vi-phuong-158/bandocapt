import React from 'react';

/**
 * IconButton — circular icon-only control. Used for map zoom,
 * close, back, and the round map FAB (variant="fab").
 */
export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  fill = false,
  label,
  style,
  ...rest
}) {
  const sizes = { sm: 36, md: 44, lg: 56 };
  const dim = sizes[size] || sizes.md;
  const iconSize = size === 'lg' ? 26 : size === 'sm' ? 18 : 22;

  const variants = {
    ghost: { background: 'transparent', color: 'var(--slate-600)', boxShadow: 'none', border: 'none' },
    soft: { background: 'var(--surface-sunken)', color: 'var(--slate-500)', boxShadow: 'none', border: 'none' },
    glass: {
      background: 'var(--glass-fill-strong)', color: 'var(--slate-600)',
      boxShadow: 'var(--shadow-card)', border: '1px solid var(--glass-stroke)',
      backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)',
    },
    fab: {
      background: 'var(--color-primary)', color: '#fff',
      boxShadow: 'var(--shadow-fab)', border: '1px solid rgba(255,255,255,0.1)',
    },
    scrim: {
      background: 'rgba(15,23,42,0.30)', color: '#fff',
      boxShadow: 'none', border: '1px solid var(--glass-stroke)',
      backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)',
    },
  };
  const v = variants[variant] || variants.ghost;

  return (
    <button
      aria-label={label}
      style={{
        width: dim, height: dim,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        transition: 'transform var(--dur-fast) var(--ease-smooth), background var(--dur-fast), box-shadow var(--dur-fast)',
        ...v,
        ...style,
      }}
      {...rest}
    >
      <span className="material-symbols-outlined" style={{ fontSize: iconSize, fontVariationSettings: fill ? "'FILL' 1" : undefined }}>{icon}</span>
    </button>
  );
}
