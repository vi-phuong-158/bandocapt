import React from 'react';

/**
 * Button — the app's primary pill action.
 * Variants: primary (solid blue), secondary (soft slate), ghost, amber (CCCD).
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  fullWidth = false,
  disabled = false,
  style,
  ...rest
}) {
  const sizes = {
    sm: { height: 38, padding: '0 16px', font: 13 },
    md: { height: 46, padding: '0 22px', font: 14 },
    lg: { height: 52, padding: '0 28px', font: 15 },
  };
  const s = sizes[size] || sizes.md;

  const variants = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--text-on-brand)',
      boxShadow: '0 8px 20px rgba(29,78,216,0.22)',
      border: '1px solid transparent',
    },
    secondary: {
      background: 'var(--surface-muted)',
      color: 'var(--slate-700)',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border-glass)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-primary)',
      boxShadow: 'none',
      border: '1px solid transparent',
    },
    amber: {
      background: 'var(--color-cccd)',
      color: 'var(--text-on-brand)',
      boxShadow: 'var(--shadow-fab-amber)',
      border: '1px solid transparent',
    },
    soft: {
      background: 'var(--blue-50)',
      color: 'var(--color-primary)',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border-glass)',
    },
  };
  const v = variants[variant] || variants.primary;

  return (
    <button
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        height: s.height,
        padding: s.padding,
        fontFamily: 'var(--font-body)',
        fontSize: s.font,
        fontWeight: 700,
        lineHeight: 1,
        borderRadius: 'var(--radius-pill)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
        transition: 'transform var(--dur-fast) var(--ease-smooth), box-shadow var(--dur-fast), background var(--dur-fast)',
        width: fullWidth ? '100%' : undefined,
        ...v,
        ...style,
      }}
      {...rest}
    >
      {icon && <span className="material-symbols-outlined" style={{ fontSize: s.font + 6, fontVariationSettings: "'FILL' 1" }}>{icon}</span>}
      {children}
      {iconRight && <span className="material-symbols-outlined" style={{ fontSize: s.font + 6 }}>{iconRight}</span>}
    </button>
  );
}
