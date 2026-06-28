# UI Kit — Bản đồ Công an số (Phú Thọ)

High-fidelity, **mobile-first** recreation of the production civic map app: a
full-bleed Leaflet + OpenStreetMap map, a floating search trigger that expands into
a top search sheet, a unit detail **bottom sheet**, and a full-screen AI
legal-procedures assistant launched from a prominent floating button (mascot
avatar + pulsing ring).

## Files
- `index.html` — entry; loads React, Babel, Leaflet, the design-system bundle, sample data, and `App.jsx`.
- `App.jsx` — orchestrates state and composes the screens (`MapView`, `SidePanel`, `DetailPanel`, `ChatWindow`).
- `units.js` — sample units around Việt Trì (recreation data only).

## Interactions
- Tap the floating search bar → a search sheet slides down with input, filter pills, and results.
- Toggle **Công an / Điểm CCCD / Gần tôi** filter pills (multi-select). "Gần tôi" reveals distance chips.
- Tap a result card **or** a map pin → the unit detail **bottom sheet** rises (photo header, Chỉ đường / Gọi điện, address/phone/hours).
- Tap the prominent **Hỏi đáp AI** launcher (mascot `icon.png`, pulsing) → full-screen assistant with suggestion chips; send a message for a canned RAG-style reply.

## Built from design-system primitives
`SearchBar`, `FilterTabs`, `ResultCard`, `InfoRow`, `Badge`, `Chip`, `IconButton`, `ChatLauncher`, `ChatBubble` — all from `window.BNCNgAnSDesignSystem_c0346a`. The teardrop map markers reuse the brand marker CSS from the original `styles.css`.

> Recreation for design reference. The real app adds Leaflet marker clustering, geolocation, Cloudflare Turnstile, and a streaming Gemini/RAG backend — omitted here.
