# Bản đồ Công an số — Design System

A design system for **Bản đồ Công an số tỉnh Phú Thọ** ("Digital Police Map of
Phú Thọ province") — a Vietnamese civic web app that lets residents locate police
stations and CCCD (national ID) issuance points on an interactive map, and ask an
AI assistant about administrative procedures.

The aesthetic is a clean, trustworthy **"Soft UI"**: frosted-glass panels floating
over a live map, fully-rounded pill controls, soft layered shadows, and a sharp
public-security blue as the lead color.

## Product context
- **What it is:** A fully static frontend (vanilla HTML/CSS/JS + TailwindCSS) on Vercel. A Leaflet + OpenStreetMap map with clustered teardrop markers, a search/results side panel, a unit detail sheet, and a RAG chatbot (Gemini 2.5 Flash + Pinecone) that answers procedure questions in vi/en/zh/ko with citations.
- **Primary users:** Phú Thọ residents finding the nearest station; foreigners/businesses asking about procedures and fines; police staff updating data via Google Sheets.
- **Two location categories** drive most of the visual coding: **Công an** (police, blue) and **Điểm CCCD** (ID points, amber). A third "Gần tôi" (near me) state uses emerald.

## Sources
This system was reverse-engineered from the project's real codebase and assets:
- **GitHub:** https://github.com/vi-phuong-158/bandocapt — explore further for the
  full app (`index.html`, `styles.css`, `tailwind.config.js`, `js/`, `docs/brain/`)
  to deepen any recreation.
- Brand assets copied verbatim: `assets/logo.png` (Công an Nhân dân emblem),
  `assets/icon.png` (3D police-officer assistant mascot).

---

## CONTENT FUNDAMENTALS

**Language:** Vietnamese-first, always. English/other languages appear only inside
the multilingual chatbot replies. UI chrome is Vietnamese.

**Tone:** Official but warm and service-minded — a helpful public service, not a
cold bureaucracy. The assistant greets ("Xin chào!"), offers help ("Tôi có thể
giúp gì cho bạn hôm nay?"), and addresses the user politely.

**Casing:** Sentence case for body and labels. Vietnamese proper nouns and unit
names keep their natural capitalization ("Công an phường Việt Trì"). UPPERCASE is
reserved for tiny eyebrow/status labels with letter-spacing ("SẴN SÀNG HỖ TRỢ").
No ALL-CAPS headlines.

**Voice:** First-person singular for the assistant ("Tôi là Trợ lý ảo…"); the user
is addressed as "bạn". Short, scannable sentences. Numbered steps for procedures.

**Honesty / disclaimers:** AI content always carries a soft italic disclaimer —
*"Nội dung tổng hợp bằng AI nên có thể có sai sót, vui lòng kiểm chứng lại thông
tin."* Trust matters; never present AI output as authoritative without it.

**Microcopy examples**
- Search placeholder: *"Nhập tên đơn vị, phường xã..."*
- Filters: *"Công an" · "Điểm CCCD" · "Gần tôi"*
- Actions: *"Chỉ đường" · "Gọi điện"*
- Detail labels: *"Địa chỉ" · "Số điện thoại" · "Giờ làm việc"*
- Empty state: *"Không tìm thấy đơn vị phù hợp"*
- Assistant title: *"Trợ lý hỗ trợ pháp luật"* / subtitle *"Sẵn sàng hỗ trợ"*

**Emoji:** None. Iconography is carried entirely by Material Symbols. No emoji in UI.

---

## VISUAL FOUNDATIONS

**Color.** One dominant brand hue: public-security blue (`--color-primary #1d4ed8`,
`--color-accent #2563eb`). Category accents: amber `#d97706` for CCCD, emerald
`#047857` for "near me"/online. Neutrals are a cool zinc/slate ramp; app background
is near-white `#f4f4f5`, surfaces are white. Color is used sparingly and
semantically — mostly the UI is white/glass + slate text, with blue for actions and
the two category colors for wayfinding. No purple, no rainbow gradients.

**Type.** A single, genuinely-Vietnamese family: **Be Vietnam Pro** (by Bê Trần),
used across both display and body. Headings use 700/800 with tight tracking (−0.2 to
−0.4px); body/UI use 400–600 with generous line-height (1.58). Full Vietnamese
diacritic coverage is essential and native here. One family keeps the civic tone
cohesive and modern.

**Backgrounds.** The hero surface is a *live map* (OSM raster tiles), never a flat
color or illustration. Everything else floats above it on **frosted glass**
(`backdrop-filter: blur(12–16px)`, white at 70–90% opacity). No full-bleed photos
except the unit detail header (a darkened photo with a bottom-up scrim). No
decorative gradients, textures, or patterns.

**Shape & radius.** Soft UI leans round: controls and chips are full pills
(`9999px`); cards and sheets are 16–20px; icon boxes 12px. Nothing is sharp-cornered.

**Shadows.** Soft, layered, low-opacity — `--shadow-card` for resting cards,
`--shadow-pop` for the chat window, and tinted glows under brand buttons
(`--shadow-fab`, blue at 22–35% alpha). The glass shadow adds an inner top
highlight (`inset 0 1px 1px rgba(255,255,255,.5)`).

**Borders.** Hairline and pale — `1px` of `--slate-200` or a translucent white
`--glass-stroke` on frosted surfaces. Borders define glass edges more than they box
content.

**Motion.** Spring and smooth, never harsh. Bottom sheets slide on
`cubic-bezier(0.32,0.72,0,1)`; buttons and chips use a gentle overshoot spring
(`cubic-bezier(0.34,1.56,0.64,1)`); messages fade-and-rise in. Selected map markers
emit a pulsing ring. Durations 150–400ms. Respect reduced-motion.

**Hover / press.** Cards lift `−2px` and brighten to opaque white on hover; buttons
deepen their tint and gain shadow; press states scale down `~0.97–0.98`. FABs lift
`−2px` on hover.

**Focus.** Visible brand ring — `box-shadow: 0 0 0 4px rgba(29,78,216,0.12)` on
inputs, `3px` outline offsets on cards. Accessibility is taken seriously (skip
links, ARIA, ≥44px hit targets).

**Map markers.** Teardrop pins (`border-radius:50% 50% 50% 0` rotated −45°) with a
white ring and a Material Symbol inside; blue for police, amber for CCCD; the user's
own location is a pulsing blue dot.

---

## ICONOGRAPHY

**One system: Material Symbols Outlined** (Google), loaded from the Google Fonts
CSS API — the variable axis is `opsz,wght,FILL,GRAD@24,400,0..1,0`. Glyphs are
rendered via `<span class="material-symbols-outlined">name</span>`; `FILL 1` is used
for emphasis (active filters, FAB, badges). No SVG icon files, no icon sprites, no
PNG icons, no emoji, no unicode-symbol hacks.

Common glyphs: `search`, `local_police`, `badge`, `near_me`, `my_location`,
`location_on`, `directions`, `call`, `phone`, `schedule`, `chat_bubble`, `send`,
`arrow_back`, `close`, `add`, `remove`, `menu`.

Two raster brand marks live in `assets/`: **logo.png** (the CAND emblem — gold rice
wreath, red star) used in the panel header at ~44px; **icon.png** (a friendly 3D
police-officer mascot) used as the AI assistant avatar. Both should sit on light
surfaces with no recoloring.

---

## INDEX / MANIFEST

**Root**
- `styles.css` — global entry point (imports only). Link this one file.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `fonts.css`.
- `assets/` — `logo.png`, `icon.png`.
- `SKILL.md` — Agent-Skills wrapper.

**Foundations** (`guidelines/`, shown in the Design System tab)
- Colors: Brand Blue · Category Colors · Neutral Ink & Slate · Glass Surfaces
- Type: Display · Body · Type Scale
- Spacing: Spacing Scale · Corner Radii · Shadow & Elevation
- Brand: Logo & Mascot · Map Markers · Iconography

**Components** (`components/`, namespace `window.BNCNgAnSDesignSystem_c0346a`)
- `buttons/` — **Button** (pill, 5 variants), **IconButton** (fab/glass/scrim/…)
- `forms/` — **SearchBar**, **FilterTabs** (segmented multi-select)
- `data/` — **ResultCard**, **InfoRow**, **Badge**, **Chip**
- `chat/` — **ChatBubble**, **ChatLauncher**

**UI Kits** (`ui_kits/`)
- `ban-do-cong-an/` — full interactive map app (search → results → detail → chatbot) on a real Leaflet map.

> Fonts are Google webfonts (Be Vietnam Pro, Material Symbols), loaded via CDN — no
> local font binaries are shipped. If you need offline fonts, ask and they can be
> self-hosted.
