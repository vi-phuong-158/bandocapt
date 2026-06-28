import React from 'react';

/**
 * SearchBar — the app's rounded-full search input with a leading
 * Material Symbols icon. Frosted, soft-shadowed, brand focus ring.
 */
export function SearchBar({
  placeholder = 'Nhập tên đơn vị, phường xã...',
  value,
  defaultValue,
  onChange,
  icon = 'search',
  style,
  ...rest
}) {
  return (
    <div style={{ position: 'relative', width: '100%', ...style }}>
      <span
        className="material-symbols-outlined"
        style={{
          position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
          fontSize: 22, color: 'var(--slate-400)', pointerEvents: 'none',
        }}
      >
        {icon}
      </span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        style={{
          width: '100%', height: 'var(--control-h)', boxSizing: 'border-box',
          padding: '0 18px 0 46px',
          background: 'var(--surface-muted)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--radius-pill)',
          fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
          color: 'var(--slate-800)',
          boxShadow: 'var(--shadow-sm)',
          outline: 'none',
          transition: 'border-color var(--dur-base), box-shadow var(--dur-base), background var(--dur-base)',
        }}
        onFocus={(e) => {
          e.target.style.background = '#fff';
          e.target.style.borderColor = 'var(--color-primary)';
          e.target.style.boxShadow = 'var(--ring-primary)';
        }}
        onBlur={(e) => {
          e.target.style.background = 'var(--surface-muted)';
          e.target.style.borderColor = 'var(--border-glass)';
          e.target.style.boxShadow = 'var(--shadow-sm)';
        }}
        {...rest}
      />
    </div>
  );
}
