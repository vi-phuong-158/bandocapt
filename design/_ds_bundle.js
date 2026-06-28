/* @ds-bundle: {"format":3,"namespace":"BNCNgAnSDesignSystem_c0346a","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"ChatBubble","sourcePath":"components/chat/ChatBubble.jsx"},{"name":"ChatLauncher","sourcePath":"components/chat/ChatLauncher.jsx"},{"name":"Badge","sourcePath":"components/data/Badge.jsx"},{"name":"Chip","sourcePath":"components/data/Chip.jsx"},{"name":"InfoRow","sourcePath":"components/data/InfoRow.jsx"},{"name":"ResultCard","sourcePath":"components/data/ResultCard.jsx"},{"name":"FilterTabs","sourcePath":"components/forms/FilterTabs.jsx"},{"name":"SearchBar","sourcePath":"components/forms/SearchBar.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"1c7d3d750dbf","components/buttons/IconButton.jsx":"fa382f6a98f7","components/chat/ChatBubble.jsx":"46adadb2f389","components/chat/ChatLauncher.jsx":"ea5756d472f0","components/data/Badge.jsx":"13f2bc2ac15d","components/data/Chip.jsx":"b219b008cee2","components/data/InfoRow.jsx":"dbcb1790f8b1","components/data/ResultCard.jsx":"a821a62f6fe4","components/forms/FilterTabs.jsx":"d31689b6227c","components/forms/SearchBar.jsx":"e68bcf5e533f","ui_kits/ban-do-cong-an/App.jsx":"c3f7a64846f3","ui_kits/ban-do-cong-an/units.js":"53efb5256963"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.BNCNgAnSDesignSystem_c0346a = window.BNCNgAnSDesignSystem_c0346a || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the app's primary pill action.
 * Variants: primary (solid blue), secondary (soft slate), ghost, amber (CCCD).
 */
function Button({
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
    sm: {
      height: 38,
      padding: '0 16px',
      font: 13
    },
    md: {
      height: 46,
      padding: '0 22px',
      font: 14
    },
    lg: {
      height: 52,
      padding: '0 28px',
      font: 15
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--text-on-brand)',
      boxShadow: '0 8px 20px rgba(29,78,216,0.22)',
      border: '1px solid transparent'
    },
    secondary: {
      background: 'var(--surface-muted)',
      color: 'var(--slate-700)',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border-glass)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-primary)',
      boxShadow: 'none',
      border: '1px solid transparent'
    },
    amber: {
      background: 'var(--color-cccd)',
      color: 'var(--text-on-brand)',
      boxShadow: 'var(--shadow-fab-amber)',
      border: '1px solid transparent'
    },
    soft: {
      background: 'var(--blue-50)',
      color: 'var(--color-primary)',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border-glass)'
    }
  };
  const v = variants[variant] || variants.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    style: {
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
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: s.font + 6,
      fontVariationSettings: "'FILL' 1"
    }
  }, icon), children, iconRight && /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: s.font + 6
    }
  }, iconRight));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — circular icon-only control. Used for map zoom,
 * close, back, and the round map FAB (variant="fab").
 */
function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  fill = false,
  label,
  style,
  ...rest
}) {
  const sizes = {
    sm: 36,
    md: 44,
    lg: 56
  };
  const dim = sizes[size] || sizes.md;
  const iconSize = size === 'lg' ? 26 : size === 'sm' ? 18 : 22;
  const variants = {
    ghost: {
      background: 'transparent',
      color: 'var(--slate-600)',
      boxShadow: 'none',
      border: 'none'
    },
    soft: {
      background: 'var(--surface-sunken)',
      color: 'var(--slate-500)',
      boxShadow: 'none',
      border: 'none'
    },
    glass: {
      background: 'var(--glass-fill-strong)',
      color: 'var(--slate-600)',
      boxShadow: 'var(--shadow-card)',
      border: '1px solid var(--glass-stroke)',
      backdropFilter: 'var(--blur-md)',
      WebkitBackdropFilter: 'var(--blur-md)'
    },
    fab: {
      background: 'var(--color-primary)',
      color: '#fff',
      boxShadow: 'var(--shadow-fab)',
      border: '1px solid rgba(255,255,255,0.1)'
    },
    scrim: {
      background: 'rgba(15,23,42,0.30)',
      color: '#fff',
      boxShadow: 'none',
      border: '1px solid var(--glass-stroke)',
      backdropFilter: 'var(--blur-md)',
      WebkitBackdropFilter: 'var(--blur-md)'
    }
  };
  const v = variants[variant] || variants.ghost;
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    style: {
      width: dim,
      height: dim,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-pill)',
      cursor: 'pointer',
      transition: 'transform var(--dur-fast) var(--ease-smooth), background var(--dur-fast), box-shadow var(--dur-fast)',
      ...v,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: iconSize,
      fontVariationSettings: fill ? "'FILL' 1" : undefined
    }
  }, icon));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/chat/ChatBubble.jsx
try { (() => {
/**
 * ChatBubble — a message in the AI assistant. role: 'assistant'
 * (white, left, with avatar + label) or 'user' (blue, right).
 * Supports an optional disclaimer footnote on assistant messages.
 */
function ChatBubble({
  role = 'assistant',
  children,
  label = 'Trợ lý hỗ trợ pháp luật',
  avatar,
  disclaimer,
  style
}) {
  const isUser = role === 'user';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 9,
      alignItems: 'flex-start',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      ...style
    }
  }, !isUser && avatar && /*#__PURE__*/React.createElement("img", {
    src: avatar,
    alt: "",
    style: {
      width: 24,
      height: 24,
      objectFit: 'contain',
      marginTop: 7,
      opacity: 0.9,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'min(86%, 330px)',
      padding: '13px 15px',
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      lineHeight: 1.58,
      wordBreak: 'break-word',
      background: isUser ? 'var(--color-primary)' : '#fff',
      color: isUser ? '#fff' : 'var(--slate-800)',
      border: isUser ? 'none' : '1px solid var(--slate-200)',
      borderRadius: 18,
      borderTopLeftRadius: isUser ? 18 : 5,
      borderTopRightRadius: isUser ? 5 : 18,
      boxShadow: isUser ? '0 8px 26px rgba(29,78,216,0.16)' : '0 4px 20px rgba(15,23,42,0.04)'
    }
  }, !isUser && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 5px',
      fontSize: 12,
      fontWeight: 800,
      color: 'var(--color-primary)'
    }
  }, label), /*#__PURE__*/React.createElement("div", null, children), !isUser && disclaimer && /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 9,
      paddingTop: 9,
      borderTop: '1px solid var(--slate-200)',
      color: 'var(--text-muted)',
      fontSize: 12,
      fontStyle: 'italic'
    }
  }, disclaimer)));
}
Object.assign(__ds_scope, { ChatBubble });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chat/ChatBubble.jsx", error: String((e && e.message) || e) }); }

// components/chat/ChatLauncher.jsx
try { (() => {
/**
 * ChatLauncher — the floating entry point to the AI assistant.
 * Prominent by design: mascot avatar, label + sublabel, an online
 * dot, a pulsing attention ring, and a strong brand glow.
 * Pass `avatar` (e.g. the icon.png mascot); falls back to an icon.
 */
function ChatLauncher({
  label = 'Hỏi đáp AI',
  sublabel = 'Trợ lý pháp luật · 24/7',
  avatar,
  icon = 'chat_bubble',
  pulse = true,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, `@keyframes ds-chat-pulse{0%{transform:scale(0.85);opacity:.55}70%{transform:scale(1.55);opacity:0}100%{opacity:0}}`), pulse && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      left: 4,
      top: '50%',
      width: 56,
      height: 56,
      marginTop: -28,
      borderRadius: '50%',
      background: 'rgba(29,78,216,0.35)',
      animation: 'ds-chat-pulse 2.4s ease-out infinite',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      left: 4,
      top: '50%',
      width: 56,
      height: 56,
      marginTop: -28,
      borderRadius: '50%',
      background: 'rgba(29,78,216,0.30)',
      animation: 'ds-chat-pulse 2.4s ease-out 1.2s infinite',
      pointerEvents: 'none'
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      height: 64,
      padding: '0 22px 0 8px',
      background: 'var(--color-primary)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: 'var(--radius-pill)',
      cursor: 'pointer',
      boxShadow: '0 14px 34px rgba(29,78,216,0.42), inset 0 1px 1px rgba(255,255,255,0.25)',
      transition: 'transform var(--dur-base) var(--ease-spring), box-shadow var(--dur-base)'
    },
    onMouseEnter: e => {
      e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
      e.currentTarget.style.boxShadow = '0 20px 44px rgba(29,78,216,0.5), inset 0 1px 1px rgba(255,255,255,0.25)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = '0 14px 34px rgba(29,78,216,0.42), inset 0 1px 1px rgba(255,255,255,0.25)';
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      width: 48,
      height: 48,
      flexShrink: 0,
      borderRadius: '50%',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 10px rgba(15,23,42,0.18)'
    }
  }, avatar ? /*#__PURE__*/React.createElement("img", {
    src: avatar,
    alt: "",
    style: {
      width: 40,
      height: 40,
      objectFit: 'contain'
    }
  }) : /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: 26,
      color: 'var(--color-primary)'
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 1,
      bottom: 2,
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: 'var(--emerald-500)',
      border: '2.5px solid #fff'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'left',
      lineHeight: 1.2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontSize: 15,
      fontWeight: 800
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 11,
      fontWeight: 600,
      color: 'rgba(255,255,255,0.82)',
      marginTop: 2
    }
  }, sublabel))));
}
Object.assign(__ds_scope, { ChatLauncher });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chat/ChatLauncher.jsx", error: String((e && e.message) || e) }); }

// components/data/Badge.jsx
try { (() => {
/**
 * Badge — small status/category label. tone: primary | amber |
 * nearby | neutral. Use solid over imagery, soft on light surfaces.
 */
function Badge({
  children,
  tone = 'primary',
  soft = false,
  icon,
  style
}) {
  const tones = {
    primary: {
      solid: ['var(--color-primary)', '#fff'],
      soft: ['var(--blue-50)', 'var(--color-primary)']
    },
    amber: {
      solid: ['var(--color-cccd)', '#fff'],
      soft: ['var(--amber-50)', 'var(--amber-700)']
    },
    nearby: {
      solid: ['var(--color-nearby)', '#fff'],
      soft: ['var(--emerald-100)', 'var(--emerald-700)']
    },
    neutral: {
      solid: ['var(--slate-700)', '#fff'],
      soft: ['var(--surface-sunken)', 'var(--slate-600)']
    }
  };
  const [bg, fg] = (tones[tone] || tones.primary)[soft ? 'soft' : 'solid'];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: icon ? '4px 11px 4px 9px' : '4px 11px',
      background: bg,
      color: fg,
      fontFamily: 'var(--font-body)',
      fontSize: 12,
      fontWeight: 700,
      borderRadius: 'var(--radius-sm)',
      whiteSpace: 'nowrap',
      lineHeight: 1.3,
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: 15,
      fontVariationSettings: "'FILL' 1"
    }
  }, icon), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data/Chip.jsx
try { (() => {
/**
 * Chip — fully-rounded pill, e.g. the emerald distance tag or a
 * frosted glass overlay tag on the detail image. tone + glass.
 */
function Chip({
  children,
  tone = 'nearby',
  glass = false,
  icon,
  style
}) {
  const tones = {
    nearby: ['var(--emerald-100)', 'var(--emerald-700)'],
    primary: ['var(--blue-50)', 'var(--color-primary)'],
    amber: ['var(--amber-50)', 'var(--amber-700)'],
    neutral: ['var(--surface-sunken)', 'var(--slate-600)']
  };
  const [bg, fg] = tones[tone] || tones.nearby;
  const glassStyle = glass ? {
    background: 'var(--glass-fill-strong)',
    color: 'var(--color-primary)',
    boxShadow: 'var(--shadow-card)',
    border: '1px solid var(--glass-stroke)',
    backdropFilter: 'var(--blur-md)',
    WebkitBackdropFilter: 'var(--blur-md)'
  } : {
    background: bg,
    color: fg
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 12px',
      fontFamily: 'var(--font-body)',
      fontSize: 12,
      fontWeight: 700,
      borderRadius: 'var(--radius-pill)',
      whiteSpace: 'nowrap',
      lineHeight: 1.3,
      ...glassStyle,
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: 15,
      fontVariationSettings: "'FILL' 1"
    }
  }, icon), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Chip.jsx", error: String((e && e.message) || e) }); }

// components/data/InfoRow.jsx
try { (() => {
/**
 * InfoRow — labelled detail line with a round icon medallion.
 * Used in the unit detail panel for address / phone / hours.
 */
function InfoRow({
  icon,
  label,
  value,
  href,
  style
}) {
  const medallion = /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      flexShrink: 0,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-muted)',
      border: '1px solid var(--border-glass)',
      color: 'var(--color-primary)',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: 20
    }
  }, icon));
  const body = /*#__PURE__*/React.createElement("span", {
    style: {
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--text-muted)',
      marginBottom: 2
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 15,
      fontWeight: href ? 700 : 500,
      color: 'var(--slate-800)',
      lineHeight: 1.35
    }
  }, value));
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 16,
      alignItems: 'flex-start'
    }
  }, medallion, body));
  if (href) {
    return /*#__PURE__*/React.createElement("a", {
      href: href,
      style: {
        textDecoration: 'none',
        display: 'block',
        ...style
      }
    }, inner);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: style
  }, inner);
}
Object.assign(__ds_scope, { InfoRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/InfoRow.jsx", error: String((e && e.message) || e) }); }

// components/data/ResultCard.jsx
try { (() => {
/**
 * ResultCard — a search result row: colored icon box, title,
 * address, optional distance chip. Glassy, lifts on hover.
 * type: 'police' | 'cccd' drives the icon + color.
 */
function ResultCard({
  title,
  address,
  type = 'police',
  distance,
  onClick,
  style
}) {
  const conf = {
    police: {
      color: 'var(--color-primary)',
      icon: 'local_police'
    },
    cccd: {
      color: 'var(--color-cccd)',
      icon: 'badge'
    }
  }[type] || {
    color: 'var(--color-primary)',
    icon: 'local_police'
  };
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      width: '100%',
      display: 'flex',
      gap: 14,
      alignItems: 'flex-start',
      padding: '16px 14px',
      textAlign: 'left',
      background: 'var(--glass-fill)',
      backdropFilter: 'var(--blur-sm)',
      WebkitBackdropFilter: 'var(--blur-sm)',
      border: '1px solid var(--border-glass)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-card)',
      cursor: 'pointer',
      font: 'inherit',
      transition: 'transform var(--dur-base) var(--ease-smooth), box-shadow var(--dur-base), background var(--dur-base)',
      ...style
    },
    onMouseEnter: e => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
      e.currentTarget.style.background = '#fff';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = 'var(--shadow-card)';
      e.currentTarget.style.background = 'var(--glass-fill)';
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 44,
      flexShrink: 0,
      borderRadius: 'var(--radius-md)',
      background: conf.color,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: 22,
      fontVariationSettings: "'FILL' 1"
    }
  }, conf.icon)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      paddingTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 16,
      color: 'var(--slate-800)',
      letterSpacing: '-0.2px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      marginBottom: 4
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--slate-500)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, address), distance && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    tone: "nearby",
    icon: "near_me"
  }, distance))));
}
Object.assign(__ds_scope, { ResultCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ResultCard.jsx", error: String((e && e.message) || e) }); }

// components/forms/FilterTabs.jsx
try { (() => {
/**
 * FilterTabs — segmented pill toggles inside a sunken track.
 * The app uses it for Công an / Điểm CCCD / Gần tôi filters.
 * Each option: { id, label, icon, color }. `selected` is an array
 * of active ids (multi-select toggle).
 */
function FilterTabs({
  options = [],
  selected = [],
  onToggle,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: 6,
      background: 'var(--surface-sunken)',
      border: '1px solid var(--glass-stroke)',
      borderRadius: 'var(--radius-pill)',
      ...style
    }
  }, options.map(opt => {
    const active = selected.includes(opt.id);
    const accent = opt.color || 'var(--color-primary)';
    return /*#__PURE__*/React.createElement("button", {
      key: opt.id,
      onClick: () => onToggle && onToggle(opt.id),
      "aria-pressed": active,
      style: {
        flex: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding: '9px 14px',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        background: active ? '#fff' : 'transparent',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        transition: 'background var(--dur-base), box-shadow var(--dur-base), color var(--dur-base)',
        whiteSpace: 'nowrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "material-symbols-outlined",
      style: {
        fontSize: 20,
        color: active ? accent : 'var(--slate-400)',
        fontVariationSettings: "'FILL' 1",
        transition: 'color var(--dur-base)'
      }
    }, opt.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontWeight: 700,
        color: active ? accent : 'var(--slate-500)'
      }
    }, opt.label));
  }));
}
Object.assign(__ds_scope, { FilterTabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FilterTabs.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * SearchBar — the app's rounded-full search input with a leading
 * Material Symbols icon. Frosted, soft-shadowed, brand focus ring.
 */
function SearchBar({
  placeholder = 'Nhập tên đơn vị, phường xã...',
  value,
  defaultValue,
  onChange,
  icon = 'search',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      position: 'absolute',
      left: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: 22,
      color: 'var(--slate-400)',
      pointerEvents: 'none'
    }
  }, icon), /*#__PURE__*/React.createElement("input", _extends({
    type: "text",
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    style: {
      width: '100%',
      height: 'var(--control-h)',
      boxSizing: 'border-box',
      padding: '0 18px 0 46px',
      background: 'var(--surface-muted)',
      border: '1px solid var(--border-glass)',
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-body)',
      fontSize: 15,
      fontWeight: 500,
      color: 'var(--slate-800)',
      boxShadow: 'var(--shadow-sm)',
      outline: 'none',
      transition: 'border-color var(--dur-base), box-shadow var(--dur-base), background var(--dur-base)'
    },
    onFocus: e => {
      e.target.style.background = '#fff';
      e.target.style.borderColor = 'var(--color-primary)';
      e.target.style.boxShadow = 'var(--ring-primary)';
    },
    onBlur: e => {
      e.target.style.background = 'var(--surface-muted)';
      e.target.style.borderColor = 'var(--border-glass)';
      e.target.style.boxShadow = 'var(--shadow-sm)';
    }
  }, rest)));
}
Object.assign(__ds_scope, { SearchBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ban-do-cong-an/App.jsx
try { (() => {
const {
  useState,
  useEffect,
  useRef
} = React;
const DS = window.BNCNgAnSDesignSystem_c0346a;
const {
  SearchBar,
  FilterTabs,
  ResultCard,
  InfoRow,
  Badge,
  Chip,
  IconButton,
  ChatLauncher,
  ChatBubble
} = DS;
const FILTERS = [{
  id: 'police',
  label: 'Công an',
  icon: 'local_police'
}, {
  id: 'cccd',
  label: 'Điểm CCCD',
  icon: 'badge',
  color: 'var(--color-cccd)'
}, {
  id: 'nearby',
  label: 'Gần tôi',
  icon: 'near_me',
  color: 'var(--color-nearby)'
}];
function markerHtml(type, selected) {
  const color = type === 'cccd' ? '#d97706' : '#1d4ed8';
  const icon = type === 'cccd' ? 'badge' : 'local_police';
  return `<div class="marker-container ${selected ? 'sel' : ''}">
    <div class="marker-icon" style="background:${color}"><span class="marker-inner material-symbols-outlined">${icon}</span></div>
  </div>`;
}

/* ---------------- Leaflet map (full-bleed background) ---------------- */
function MapView({
  units,
  selectedId,
  onSelect
}) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  useEffect(() => {
    const map = L.map(ref.current, {
      zoomControl: false,
      attributionControl: false
    }).setView([21.3227, 105.4019], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);
    mapRef.current = map;
    units.forEach(u => {
      const m = L.marker([u.lat, u.lng], {
        icon: L.divIcon({
          className: 'transparent-leaflet-icon',
          html: markerHtml(u.type, false),
          iconSize: [44, 44],
          iconAnchor: [22, 40]
        })
      }).addTo(map);
      m.on('click', () => onSelect(u.id));
      markersRef.current[u.id] = m;
    });
    return () => map.remove();
  }, []);
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, m]) => {
      const u = units.find(x => x.id === Number(id));
      m.setIcon(L.divIcon({
        className: 'transparent-leaflet-icon',
        html: markerHtml(u.type, Number(id) === selectedId),
        iconSize: [44, 44],
        iconAnchor: [22, 40]
      }));
    });
    if (selectedId && mapRef.current) {
      const u = units.find(x => x.id === selectedId);
      if (u) mapRef.current.setView([u.lat, u.lng], 15, {
        animate: true
      });
    }
  }, [selectedId]);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 0
    }
  });
}

/* ---------------- Top floating search trigger ---------------- */
function SearchTrigger({
  onOpen
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onOpen,
    style: {
      position: 'absolute',
      top: 16,
      left: 14,
      right: 14,
      height: 56,
      zIndex: 30,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 8px 0 14px',
      background: 'var(--glass-fill-strong)',
      backdropFilter: 'var(--blur-md)',
      WebkitBackdropFilter: 'var(--blur-md)',
      border: '1px solid var(--glass-stroke)',
      borderRadius: 'var(--radius-pill)',
      boxShadow: 'var(--shadow-card)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.png",
    alt: "",
    style: {
      width: 34,
      height: 34,
      objectFit: 'contain'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      textAlign: 'left',
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--slate-500)'
    }
  }, "Kh\xE1m ph\xE1 \u0111\u01A1n v\u1ECB\u2026"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: '50%',
      background: 'var(--blue-50)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--color-primary)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: 20
    }
  }, "search")));
}

/* ---------------- Search sheet (slides from top) ---------------- */
function SearchSheet({
  open,
  units,
  filters,
  onToggleFilter,
  query,
  setQuery,
  onSelect,
  onClose
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'var(--scrim)',
      backdropFilter: 'blur(2px)',
      opacity: open ? 1 : 0,
      pointerEvents: open ? 'auto' : 'none',
      transition: 'opacity var(--dur-base)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 41,
      maxHeight: '88%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface-card)',
      borderBottomLeftRadius: 'var(--radius-2xl)',
      borderBottomRightRadius: 'var(--radius-2xl)',
      boxShadow: '0 16px 40px rgba(15,23,42,0.18)',
      transform: open ? 'translateY(0)' : 'translateY(-104%)',
      transition: 'transform var(--dur-slow) var(--ease-sheet)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 16px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.png",
    alt: "",
    style: {
      width: 40,
      height: 40,
      objectFit: 'contain'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 17,
      fontWeight: 800,
      color: 'var(--slate-800)',
      lineHeight: 1.1
    }
  }, "B\u1EA3n \u0111\u1ED3 C\xF4ng an s\u1ED1"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 12.5,
      color: 'var(--text-muted)'
    }
  }, "T\u1EC9nh Ph\xFA Th\u1ECD")), /*#__PURE__*/React.createElement(IconButton, {
    variant: "soft",
    icon: "close",
    label: "\u0110\xF3ng",
    onClick: onClose
  })), /*#__PURE__*/React.createElement(SearchBar, {
    value: query,
    onChange: e => setQuery(e.target.value),
    autoFocus: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(FilterTabs, {
    options: FILTERS,
    selected: filters,
    onToggle: onToggleFilter
  }))), /*#__PURE__*/React.createElement("div", {
    className: "custom-scrollbar",
    style: {
      overflowY: 'auto',
      padding: '4px 14px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, units.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '48px 20px',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: 52,
      opacity: 0.25
    }
  }, "search_off"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontWeight: 600
    }
  }, "Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n v\u1ECB ph\xF9 h\u1EE3p")), units.map(u => /*#__PURE__*/React.createElement(ResultCard, {
    key: u.id,
    type: u.type,
    title: u.name,
    address: u.address,
    distance: filters.includes('nearby') ? u.distance : undefined,
    onClick: () => onSelect(u.id)
  })))));
}

/* ---------------- Detail bottom sheet ---------------- */
function DetailSheet({
  unit,
  onClose
}) {
  const open = !!unit;
  const isCccd = unit && unit.type === 'cccd';
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 44,
      background: 'var(--scrim)',
      opacity: open ? 1 : 0,
      pointerEvents: open ? 'auto' : 'none',
      transition: 'opacity var(--dur-base)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 45,
      height: '82%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--surface-card)',
      borderTopLeftRadius: 'var(--radius-2xl)',
      borderTopRightRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-sheet)',
      transform: open ? 'translateY(0)' : 'translateY(104%)',
      transition: 'transform var(--dur-slow) var(--ease-sheet)'
    }
  }, unit && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 200,
      flexShrink: 0,
      background: 'var(--slate-900)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=900&q=70",
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      opacity: 0.85
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to top, rgba(15,23,42,1), rgba(15,23,42,0.3) 55%, transparent)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 10,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 44,
      height: 5,
      borderRadius: 999,
      background: 'rgba(255,255,255,0.6)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 14,
      right: 14
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    variant: "scrim",
    icon: "close",
    label: "\u0110\xF3ng",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 18,
      left: 18,
      right: 80,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: isCccd ? 'amber' : 'primary'
  }, isCccd ? 'Điểm cấp CCCD' : 'Trụ sở Công an')), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 23,
      fontWeight: 800,
      lineHeight: 1.15,
      textShadow: '0 2px 8px rgba(0,0,0,0.4)'
    }
  }, unit.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 18,
      right: 18
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    glass: true,
    icon: "near_me"
  }, unit.distance))), /*#__PURE__*/React.createElement("div", {
    className: "custom-scrollbar",
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '22px 20px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 26
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      textDecoration: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      background: 'var(--blue-50)',
      color: 'var(--color-primary)',
      padding: '14px 0',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border-glass)',
      fontWeight: 700,
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: 22,
      fontVariationSettings: "'FILL' 1"
    }
  }, "directions"), "Ch\u1EC9 \u0111\u01B0\u1EDDng"), /*#__PURE__*/React.createElement("a", {
    href: `tel:${unit.phone.replace(/\s/g, '')}`,
    style: {
      textDecoration: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      background: 'var(--surface-muted)',
      color: 'var(--slate-700)',
      padding: '14px 0',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border-glass)',
      fontWeight: 700,
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined",
    style: {
      fontSize: 20,
      fontVariationSettings: "'FILL' 1"
    }
  }, "call"), "G\u1ECDi \u0111i\u1EC7n")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement(InfoRow, {
    icon: "location_on",
    label: "\u0110\u1ECBa ch\u1EC9",
    value: unit.address
  }), /*#__PURE__*/React.createElement(InfoRow, {
    icon: "phone",
    label: "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i",
    value: unit.phone,
    href: `tel:${unit.phone.replace(/\s/g, '')}`
  }), /*#__PURE__*/React.createElement(InfoRow, {
    icon: "schedule",
    label: "Gi\u1EDD l\xE0m vi\u1EC7c",
    value: unit.hours
  }))))));
}

/* ---------------- Chat (full-screen on mobile) ---------------- */
function ChatScreen({
  onClose
}) {
  const [msgs, setMsgs] = useState([{
    role: 'assistant',
    text: 'Xin chào! Tôi là Trợ lý ảo tư vấn tự động các thủ tục hành chính. Tôi có thể giúp gì cho bạn hôm nay?',
    disclaimer: 'Nội dung tổng hợp bằng AI nên có thể có sai sót, vui lòng kiểm chứng lại thông tin.'
  }]);
  const [val, setVal] = useState('');
  const bodyRef = useRef(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs]);
  const send = () => {
    if (!val.trim()) return;
    const q = val.trim();
    setMsgs(m => [...m, {
      role: 'user',
      text: q
    }]);
    setVal('');
    setTimeout(() => setMsgs(m => [...m, {
      role: 'assistant',
      text: 'Để làm thẻ CCCD, công dân cần mang theo: (1) Sổ hộ khẩu hoặc giấy xác nhận cư trú, (2) CMND/CCCD cũ nếu có. Lệ phí cấp mới là 30.000đ. Bạn có thể đến điểm cấp gần nhất trên bản đồ.',
      disclaimer: 'Nội dung tổng hợp bằng AI nên có thể có sai sót, vui lòng kiểm chứng lại thông tin.'
    }]), 650);
  };
  const SUGGEST = ['Thủ tục làm CCCD?', 'Đăng ký tạm trú', 'Mức phạt vi phạm giao thông'];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 60,
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fbfa'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 14px',
      background: '#fff',
      borderBottom: '1px solid #eef2f7',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 44,
      height: 44,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/icon.png",
    alt: "",
    style: {
      width: 38,
      height: 38,
      objectFit: 'contain',
      filter: 'drop-shadow(0 2px 4px rgba(15,23,42,0.16))'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 2,
      bottom: 4,
      width: 11,
      height: 11,
      borderRadius: 999,
      background: '#22c55e',
      border: '2px solid #fff'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 15,
      color: 'var(--slate-900)'
    }
  }, "Tr\u1EE3 l\xFD h\u1ED7 tr\u1EE3 ph\xE1p lu\u1EADt"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 2,
      fontSize: 11,
      fontWeight: 800,
      color: 'var(--color-primary)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em'
    }
  }, "S\u1EB5n s\xE0ng h\u1ED7 tr\u1EE3")), /*#__PURE__*/React.createElement(IconButton, {
    variant: "soft",
    icon: "close",
    label: "\u0110\xF3ng",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    ref: bodyRef,
    className: "custom-scrollbar",
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, msgs.map((m, i) => /*#__PURE__*/React.createElement(ChatBubble, {
    key: i,
    role: m.role,
    avatar: m.role === 'assistant' ? '../../assets/icon.png' : undefined,
    disclaimer: m.disclaimer
  }, m.text))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '0 14px 8px',
      overflowX: 'auto'
    }
  }, SUGGEST.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: () => setVal(s),
    style: {
      flexShrink: 0,
      padding: '8px 13px',
      borderRadius: 'var(--radius-pill)',
      border: '1px solid var(--slate-200)',
      background: '#fff',
      color: 'var(--color-primary)',
      fontFamily: 'var(--font-body)',
      fontSize: 12.5,
      fontWeight: 700,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, s))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 14px calc(12px + env(safe-area-inset-bottom,0px))',
      borderTop: '1px solid #eef2f7',
      background: '#fff',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: val,
    onChange: e => setVal(e.target.value),
    onKeyDown: e => e.key === 'Enter' && send(),
    placeholder: "Nh\u1EADp c\xE2u h\u1ECFi c\u1EE7a b\u1EA1n...",
    style: {
      flex: 1,
      height: 46,
      padding: '0 16px',
      border: '1px solid var(--slate-200)',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-muted)',
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      outline: 'none'
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    variant: "fab",
    icon: "send",
    label: "G\u1EEDi",
    onClick: send
  })));
}

/* ---------------- App (mobile-first) ---------------- */
function App() {
  const all = window.SAMPLE_UNITS;
  const [filters, setFilters] = useState(['police', 'cccd']);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const toggleFilter = id => setFilters(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  const visible = all.filter(u => {
    const typeOk = u.type === 'police' && filters.includes('police') || u.type === 'cccd' && filters.includes('cccd');
    const q = query.trim().toLowerCase();
    const qOk = !q || u.name.toLowerCase().includes(q) || u.address.toLowerCase().includes(q);
    return typeOk && qOk;
  });
  const selected = all.find(u => u.id === selectedId);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      background: 'var(--bg-app)'
    }
  }, /*#__PURE__*/React.createElement(MapView, {
    units: all,
    selectedId: selectedId,
    onSelect: id => {
      setSelectedId(id);
      setSearchOpen(false);
    }
  }), /*#__PURE__*/React.createElement(SearchTrigger, {
    onOpen: () => setSearchOpen(true)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 14,
      bottom: 110,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      zIndex: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--glass-fill-strong)',
      borderRadius: 'var(--radius-pill)',
      boxShadow: 'var(--shadow-card)',
      border: '1px solid var(--glass-stroke)',
      overflow: 'hidden',
      backdropFilter: 'var(--blur-md)'
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    variant: "ghost",
    icon: "add",
    label: "Ph\xF3ng to"
  }), /*#__PURE__*/React.createElement(IconButton, {
    variant: "ghost",
    icon: "remove",
    label: "Thu nh\u1ECF"
  })), /*#__PURE__*/React.createElement(IconButton, {
    variant: "fab",
    icon: "my_location",
    fill: true,
    label: "T\xECm v\u1ECB tr\xED c\u1EE7a t\xF4i",
    size: "lg"
  })), !chatOpen && !selected && !searchOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 14,
      bottom: 22,
      zIndex: 30
    }
  }, /*#__PURE__*/React.createElement(ChatLauncher, {
    avatar: "../../assets/icon.png",
    onClick: () => setChatOpen(true)
  })), /*#__PURE__*/React.createElement(SearchSheet, {
    open: searchOpen,
    units: visible,
    filters: filters,
    onToggleFilter: toggleFilter,
    query: query,
    setQuery: setQuery,
    onSelect: id => {
      setSelectedId(id);
      setSearchOpen(false);
    },
    onClose: () => setSearchOpen(false)
  }), /*#__PURE__*/React.createElement(DetailSheet, {
    unit: selected,
    onClose: () => setSelectedId(null)
  }), chatOpen && /*#__PURE__*/React.createElement(ChatScreen, {
    onClose: () => setChatOpen(false)
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ban-do-cong-an/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ban-do-cong-an/units.js
try { (() => {
// Sample units around Việt Trì, Phú Thọ — for the UI-kit recreation only.
window.SAMPLE_UNITS = [{
  id: 1,
  type: 'police',
  name: 'Công an phường Việt Trì',
  address: 'Số 12 Đại lộ Hùng Vương, P. Việt Trì',
  phone: '0210 3845 678',
  hours: 'Thứ 2 – Thứ 6: 7:30 – 17:00',
  lat: 21.3227,
  lng: 105.4019,
  distance: '0.8 km'
}, {
  id: 2,
  type: 'cccd',
  name: 'Điểm cấp CCCD Thanh Miếu',
  address: '45 Trần Phú, P. Thanh Miếu',
  phone: '0210 3811 222',
  hours: 'Thứ 2 – Thứ 7: 8:00 – 16:30',
  lat: 21.2986,
  lng: 105.4072,
  distance: '1.4 km'
}, {
  id: 3,
  type: 'police',
  name: 'Công an phường Nông Trang',
  address: '88 Nguyễn Tất Thành, P. Nông Trang',
  phone: '0210 3852 145',
  hours: 'Thứ 2 – Thứ 6: 7:30 – 17:00',
  lat: 21.3338,
  lng: 105.3949,
  distance: '2.1 km'
}, {
  id: 4,
  type: 'police',
  name: 'Công an phường Gia Cẩm',
  address: '201 Hùng Vương, P. Gia Cẩm',
  phone: '0210 3846 900',
  hours: 'Thứ 2 – Thứ 6: 7:30 – 17:00',
  lat: 21.3155,
  lng: 105.4093,
  distance: '2.6 km'
}, {
  id: 5,
  type: 'cccd',
  name: 'Điểm cấp CCCD Tiên Cát',
  address: '12 Châu Phong, P. Tiên Cát',
  phone: '0210 3818 334',
  hours: 'Thứ 2 – Thứ 7: 8:00 – 16:30',
  lat: 21.3089,
  lng: 105.3998,
  distance: '3.0 km'
}, {
  id: 6,
  type: 'police',
  name: 'Công an xã Trưng Vương',
  address: 'QL2, xã Trưng Vương',
  phone: '0210 3860 071',
  hours: 'Thứ 2 – Thứ 6: 7:30 – 17:00',
  lat: 21.3402,
  lng: 105.4181,
  distance: '3.7 km'
}];
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ban-do-cong-an/units.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.ChatBubble = __ds_scope.ChatBubble;

__ds_ns.ChatLauncher = __ds_scope.ChatLauncher;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.InfoRow = __ds_scope.InfoRow;

__ds_ns.ResultCard = __ds_scope.ResultCard;

__ds_ns.FilterTabs = __ds_scope.FilterTabs;

__ds_ns.SearchBar = __ds_scope.SearchBar;

})();
