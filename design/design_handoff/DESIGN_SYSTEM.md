# DESIGN_SYSTEM.md — Bản đồ Công an số UI Kit

> **Dành cho Claude Code / Codex:** Đọc file này trước khi sửa bất kỳ giao diện nào trong
> `index.html`, `app.js`, `js/chatbot.js`, hoặc bất kỳ file HTML/CSS nào.

---

## 1. Tổng quan

Dự án có một **Design System riêng** đã được build sẵn, bao gồm:
- CSS tokens (màu, chữ, spacing, shadow)
- React components (Button, SearchBar, ResultCard, Badge, Chip, InfoRow, FilterTabs, ChatBubble, ChatLauncher, IconButton)
- UI Kit hoàn chỉnh mô phỏng app thực tế

**Nguyên tắc:** Khi sửa UI, **không tự chọn màu, font, kích thước, shadow** — luôn dùng CSS
variables từ design system. Mọi giá trị "magic number" trong CSS đều là vi phạm.

---

## 2. CSS Tokens — Dùng biến này, không hardcode

### Màu sắc

```css
/* Brand chính — xanh công an */
--color-primary: #1d4ed8;        /* nền button chính, icon active, link */
--color-primary-hover: #1e40af;  /* hover state */
--color-accent:  #2563eb;        /* accent nhẹ hơn */

/* CCCD / Căn cước */
--color-cccd: #d97706;           /* amber — điểm cấp CCCD */

/* Gần tôi */
--color-nearby: #047857;         /* emerald — "gần tôi", online */

/* Surfaces */
--bg-app: #f4f4f5;               /* nền toàn app */
--surface-card: #ffffff;         /* nền card */
--surface-muted: #f8fafc;        /* input, chip */
--surface-sunken: #f1f5f9;       /* khu vực lõm */

/* Text */
--text-strong: #0f172a;          /* tiêu đề chính */
--text-body:   #1e293b;          /* body text */
--text-muted:  #64748b;          /* phụ, địa chỉ, meta */
--text-on-brand: #ffffff;        /* chữ trên nền màu */

/* Glass / Frosted (dùng trên bản đồ) */
--glass-fill: rgba(255,255,255,0.70);
--glass-fill-strong: rgba(255,255,255,0.90);
--glass-stroke: rgba(255,255,255,0.40);
--scrim: rgba(15,23,42,0.40);    /* overlay tối */

/* Borders */
--border-hairline: #e2e8f0;
--border-glass: rgba(255,255,255,0.50);
```

### Typography

```css
--font-display: 'Be Vietnam Pro', system-ui, sans-serif;  /* tiêu đề */
--font-body:    'Be Vietnam Pro', system-ui, sans-serif;  /* body */
--font-icon:    'Material Symbols Outlined';              /* ICON DUY NHẤT được dùng */

/* Scale */
--text-2xs: 11px;   /* chip status, eyebrow */
--text-xs:  12px;   /* label, meta */
--text-sm:  13px;   /* địa chỉ, text phụ */
--text-base: 15px;  /* body, input */
--text-md:  16px;   /* tiêu đề card */
--text-lg:  18px;   /* tiêu đề panel */
--text-xl:  22px;
--text-2xl: 26px;   /* tiêu đề detail */

/* Weight */
--weight-regular: 400;
--weight-medium:  500;
--weight-semibold: 600;
--weight-bold:    700;
--weight-extrabold: 800;
```

### Spacing & Radii

```css
/* Spacing (4px base) */
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 20px;  --space-6: 24px;  --space-7: 28px;  --space-8: 32px;

/* Radii — Soft UI lấy cảm hứng tròn */
--radius-sm:   8px;    /* icon nhỏ */
--radius-md:   12px;   /* icon box */
--radius-lg:   16px;   /* card, result item */
--radius-xl:   20px;   /* sheet, chat window */
--radius-2xl:  24px;
--radius-pill: 9999px; /* search bar, chip, FAB, button */

/* Control sizes */
--control-h: 46px;   /* chiều cao input, button */
--fab-size:  56px;   /* FAB (Floating Action Button) */
--hit-min:   44px;   /* touch target tối thiểu — KHÔNG nhỏ hơn */
```

### Shadows & Effects

```css
--shadow-sm: 0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
--shadow-card: 0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
--shadow-card-hover: 0 8px 28px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06);
--shadow-sheet: 0 -4px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04);
--shadow-fab: 0 6px 24px rgba(29,78,216,0.35);

--blur-sm: blur(8px);
--blur-md: blur(16px);    /* glass panels trên bản đồ */

--dur-fast: 120ms;
--dur-base: 200ms;
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 3. Dùng Components React (nếu app dùng React)

Nếu refactor `app.js` hoặc bất kỳ phần nào sang React, load bundle và dùng component:

```html
<!-- Trong <head> -->
<link rel="stylesheet" href="path/to/design-system/styles.css">
<script src="path/to/design-system/_ds_bundle.js"></script>
```

```js
const {
  Button, IconButton,
  SearchBar, FilterTabs,
  ResultCard, Badge, Chip, InfoRow,
  ChatBubble, ChatLauncher,
} = window.BNCNgAnSDesignSystem_c0346a;
```

### Ví dụ dùng component

```jsx
// Button
<Button variant="primary" icon="search">Tìm kiếm</Button>
<Button variant="secondary" size="sm">Huỷ</Button>
<Button variant="amber" icon="badge">Cấp CCCD</Button>
// variant: 'primary' | 'secondary' | 'ghost' | 'amber' | 'soft'
// size: 'sm' | 'md' | 'lg'

// SearchBar
<SearchBar
  placeholder="Nhập tên đơn vị..."
  value={q}
  onChange={e => setQ(e.target.value)}
/>

// ResultCard
<ResultCard
  title="Công an Phường Gia Cẩm"
  address="Khu 5, Phường Gia Cẩm, TP. Việt Trì"
  type="police"   // 'police' | 'cccd'
  distance="1.2 km"
  onClick={handleSelect}
/>

// Badge
<Badge tone="police">Công an</Badge>
<Badge tone="cccd">CCCD</Badge>
<Badge tone="nearby">Gần tôi</Badge>
// tone: 'police' | 'cccd' | 'nearby' | 'warn' | 'neutral'

// Chip (filter pill, distance chip)
<Chip tone="police" icon="local_police">Công an</Chip>
<Chip active>Đang chọn</Chip>

// InfoRow (trong detail sheet)
<InfoRow icon="location_on" label="Địa chỉ">Khu 5, Gia Cẩm</InfoRow>
<InfoRow icon="phone" label="Điện thoại">0210 3846 000</InfoRow>
<InfoRow icon="schedule" label="Giờ làm việc">07:30 – 11:30, 13:30 – 17:00</InfoRow>

// FilterTabs
<FilterTabs
  tabs={[
    { key: 'police', label: 'Công an', icon: 'local_police' },
    { key: 'cccd',   label: 'Điểm CCCD', icon: 'badge' },
    { key: 'nearby', label: 'Gần tôi',  icon: 'near_me' },
  ]}
  value={activeFilters}
  multi
  onChange={setActiveFilters}
/>

// ChatBubble
<ChatBubble role="user">Thủ tục đăng ký thường trú?</ChatBubble>
<ChatBubble role="assistant" avatar="/icon.png">Để đăng ký thường trú...</ChatBubble>

// ChatLauncher (nút AI nổi)
<ChatLauncher avatar="/icon.png" onClick={openChat} />
// Tự có hiệu ứng pulsing ring
```

---

## 4. Nếu app KHÔNG dùng React (vanilla JS/HTML)

App hiện tại (`index.html` + `app.js`) dùng Tailwind + vanilla JS. Khi sửa style, **không dùng
Tailwind class tùy tiện** — map Tailwind vào design-system token như sau:

| Tailwind class tránh dùng | Thay bằng CSS variable |
|---|---|
| `bg-blue-700` | `background: var(--color-primary)` |
| `text-slate-800` | `color: var(--text-body)` |
| `text-slate-500` | `color: var(--text-muted)` |
| `rounded-full` | `border-radius: var(--radius-pill)` |
| `rounded-2xl` | `border-radius: var(--radius-xl)` |
| `shadow-md` | `box-shadow: var(--shadow-card)` |
| `gap-2` | `gap: var(--space-2)` |
| `p-4` | `padding: var(--space-4)` |
| `text-sm` | `font-size: var(--text-sm)` |
| `font-bold` | `font-weight: var(--weight-bold)` |

**Cách load token trong vanilla:**
```html
<link rel="stylesheet" href="styles.css">
<!-- hoặc trong Tailwind input.css: -->
@import './tokens/colors.css';
@import './tokens/typography.css';
@import './tokens/spacing.css';
@import './tokens/effects.css';
```

---

## 5. Icon — CHỈ dùng Material Symbols Outlined

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"/>
```

```html
<!-- Cú pháp dùng icon -->
<span class="material-symbols-outlined">local_police</span>
<span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1">search</span>
```

**Icon được dùng trong app:**

| Icon name | Dùng cho |
|---|---|
| `local_police` | Công an / trụ sở |
| `badge` | Điểm CCCD |
| `near_me` | Gần tôi / khoảng cách |
| `search` | Tìm kiếm |
| `location_on` | Địa chỉ |
| `phone` | Điện thoại |
| `schedule` | Giờ làm việc |
| `directions` | Chỉ đường |
| `chat` | Chat / hỏi đáp |
| `close` | Đóng |
| `arrow_back` | Quay lại |
| `my_location` | Vị trí tôi |
| `filter_list` | Bộ lọc |
| `send` | Gửi tin |
| `smart_toy` | AI / chatbot |

**Không dùng Font Awesome, Heroicons, hoặc icon set khác.**

---

## 6. Map Markers — 3 loại chính

```css
/* Teardrop pin — dùng cho marker Leaflet */
.marker-police  { background: var(--color-primary);  /* xanh */ }
.marker-cccd    { background: var(--color-cccd);     /* amber */ }
.marker-me      { background: var(--color-nearby);   /* emerald */ }

/* Shape: border-radius 50% 50% 50% 0, rotate -45deg */
```

---

## 7. Quy tắc sửa UI

1. **Màu:** chỉ dùng CSS variables từ token. Không dùng `#hex` trần.
2. **Font:** `Be Vietnam Pro` cho tất cả text. `Material Symbols Outlined` cho icon.
3. **Border-radius:** dùng `--radius-*`. Không hardcode `px`.
4. **Shadow:** dùng `--shadow-*`. Không tự viết `box-shadow`.
5. **Touch target:** mọi element bấm được phải ≥ `var(--hit-min)` = 44px.
6. **Glass panels** (overlay trên bản đồ): `background: var(--glass-fill); backdrop-filter: var(--blur-md)`.
7. **Animation:** dùng `var(--dur-fast)` / `var(--dur-base)` + `var(--ease-smooth)`.
8. **Không thêm Tailwind class mới** cho UI đã có — nếu phải thêm, dùng CSS inline hoặc custom property.

---

## 8. Màu marker bản đồ — ví dụ Leaflet

```js
// Tạo icon teardrop cho Leaflet
function createMarker(type) {
  const colors = {
    police: 'var(--color-primary)',  // #1d4ed8
    cccd:   'var(--color-cccd)',     // #d97706
    me:     'var(--color-nearby)',   // #047857
  };
  // Dùng L.divIcon với class marker-{type} đã có trong styles.css
  return L.divIcon({ className: `marker marker-${type}`, iconSize: [28, 36] });
}
```

---

## 9. Tham khảo UI Kit đầy đủ

File UI Kit hoàn chỉnh (React, mobile 412×820) nằm ở:
```
ui_kits/ban-do-cong-an/index.html   ← mở trực tiếp trên browser
ui_kits/ban-do-cong-an/App.jsx      ← source React đầy đủ
ui_kits/ban-do-cong-an/units.js     ← sample data
```

Trước khi thêm màn hình / component mới, **xem UI Kit** để biết pattern đã có.
