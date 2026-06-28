const { useState, useEffect, useRef } = React;
const DS = window.BNCNgAnSDesignSystem_c0346a;
const { SearchBar, FilterTabs, ResultCard, InfoRow, Badge, Chip, IconButton, ChatLauncher, ChatBubble } = DS;

const FILTERS = [
  { id: 'police', label: 'Công an', icon: 'local_police' },
  { id: 'cccd', label: 'Điểm CCCD', icon: 'badge', color: 'var(--color-cccd)' },
  { id: 'nearby', label: 'Gần tôi', icon: 'near_me', color: 'var(--color-nearby)' },
];

function markerHtml(type, selected) {
  const color = type === 'cccd' ? '#d97706' : '#1d4ed8';
  const icon = type === 'cccd' ? 'badge' : 'local_police';
  return `<div class="marker-container ${selected ? 'sel' : ''}">
    <div class="marker-icon" style="background:${color}"><span class="marker-inner material-symbols-outlined">${icon}</span></div>
  </div>`;
}

/* ---------------- Leaflet map (full-bleed background) ---------------- */
function MapView({ units, selectedId, onSelect }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  useEffect(() => {
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false })
      .setView([21.3227, 105.4019], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    units.forEach((u) => {
      const m = L.marker([u.lat, u.lng], { icon: L.divIcon({ className: 'transparent-leaflet-icon', html: markerHtml(u.type, false), iconSize: [44, 44], iconAnchor: [22, 40] }) }).addTo(map);
      m.on('click', () => onSelect(u.id));
      markersRef.current[u.id] = m;
    });
    return () => map.remove();
  }, []);
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, m]) => {
      const u = units.find((x) => x.id === Number(id));
      m.setIcon(L.divIcon({ className: 'transparent-leaflet-icon', html: markerHtml(u.type, Number(id) === selectedId), iconSize: [44, 44], iconAnchor: [22, 40] }));
    });
    if (selectedId && mapRef.current) {
      const u = units.find((x) => x.id === selectedId);
      if (u) mapRef.current.setView([u.lat, u.lng], 15, { animate: true });
    }
  }, [selectedId]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />;
}

/* ---------------- Top floating search trigger ---------------- */
function SearchTrigger({ onOpen }) {
  return (
    <button onClick={onOpen} style={{
      position: 'absolute', top: 16, left: 14, right: 14, height: 56, zIndex: 30,
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 0 14px',
      background: 'var(--glass-fill-strong)', backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)',
      border: '1px solid var(--glass-stroke)', borderRadius: 'var(--radius-pill)', boxShadow: 'var(--shadow-card)', cursor: 'pointer',
    }}>
      <img src="../../assets/logo.png" alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
      <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 600, color: 'var(--slate-500)' }}>Khám phá đơn vị…</span>
      <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--blue-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span>
      </span>
    </button>
  );
}

/* ---------------- Search sheet (slides from top) ---------------- */
function SearchSheet({ open, units, filters, onToggleFilter, query, setQuery, onSelect, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'var(--scrim)', backdropFilter: 'blur(2px)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity var(--dur-base)' }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 41, maxHeight: '88%',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-card)', borderBottomLeftRadius: 'var(--radius-2xl)', borderBottomRightRadius: 'var(--radius-2xl)',
        boxShadow: '0 16px 40px rgba(15,23,42,0.18)',
        transform: open ? 'translateY(0)' : 'translateY(-104%)', transition: 'transform var(--dur-slow) var(--ease-sheet)',
      }}>
        <div style={{ padding: '20px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <img src="../../assets/logo.png" alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, color: 'var(--slate-800)', lineHeight: 1.1 }}>Bản đồ Công an số</h1>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>Tỉnh Phú Thọ</p>
            </div>
            <IconButton variant="soft" icon="close" label="Đóng" onClick={onClose} />
          </div>
          <SearchBar value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div style={{ marginTop: 14 }}>
            <FilterTabs options={FILTERS} selected={filters} onToggle={onToggleFilter} />
          </div>
        </div>
        <div className="custom-scrollbar" style={{ overflowY: 'auto', padding: '4px 14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {units.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 52, opacity: 0.25 }}>search_off</span>
              <p style={{ fontWeight: 600 }}>Không tìm thấy đơn vị phù hợp</p>
            </div>
          )}
          {units.map((u) => (
            <ResultCard key={u.id} type={u.type} title={u.name} address={u.address}
              distance={filters.includes('nearby') ? u.distance : undefined} onClick={() => onSelect(u.id)} />
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------- Detail bottom sheet ---------------- */
function DetailSheet({ unit, onClose }) {
  const open = !!unit;
  const isCccd = unit && unit.type === 'cccd';
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 44, background: 'var(--scrim)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity var(--dur-base)' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 45, height: '82%',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--surface-card)', borderTopLeftRadius: 'var(--radius-2xl)', borderTopRightRadius: 'var(--radius-2xl)',
        boxShadow: 'var(--shadow-sheet)',
        transform: open ? 'translateY(0)' : 'translateY(104%)', transition: 'transform var(--dur-slow) var(--ease-sheet)',
      }}>
        {unit && (<>
          <div style={{ position: 'relative', height: 200, flexShrink: 0, background: 'var(--slate-900)' }}>
            <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=900&q=70" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,23,42,1), rgba(15,23,42,0.3) 55%, transparent)' }} />
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 44, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.6)' }} />
            <div style={{ position: 'absolute', top: 14, right: 14 }}>
              <IconButton variant="scrim" icon="close" label="Đóng" onClick={onClose} />
            </div>
            <div style={{ position: 'absolute', bottom: 18, left: 18, right: 80, color: '#fff' }}>
              <span style={{ display: 'inline-block', marginBottom: 8 }}><Badge tone={isCccd ? 'amber' : 'primary'}>{isCccd ? 'Điểm cấp CCCD' : 'Trụ sở Công an'}</Badge></span>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 23, fontWeight: 800, lineHeight: 1.15, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>{unit.name}</h1>
            </div>
            <div style={{ position: 'absolute', bottom: 18, right: 18 }}><Chip glass icon="near_me">{unit.distance}</Chip></div>
          </div>
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '22px 20px 32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 26 }}>
              <a href="#" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: 'var(--blue-50)', color: 'var(--color-primary)', padding: '14px 0', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-glass)', fontWeight: 700, fontSize: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>directions</span>Chỉ đường
              </a>
              <a href={`tel:${unit.phone.replace(/\s/g, '')}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: 'var(--surface-muted)', color: 'var(--slate-700)', padding: '14px 0', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-glass)', fontWeight: 700, fontSize: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>call</span>Gọi điện
              </a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <InfoRow icon="location_on" label="Địa chỉ" value={unit.address} />
              <InfoRow icon="phone" label="Số điện thoại" value={unit.phone} href={`tel:${unit.phone.replace(/\s/g, '')}`} />
              <InfoRow icon="schedule" label="Giờ làm việc" value={unit.hours} />
            </div>
          </div>
        </>)}
      </div>
    </>
  );
}

/* ---------------- Chat (full-screen on mobile) ---------------- */
function ChatScreen({ onClose }) {
  const [msgs, setMsgs] = useState([
    { role: 'assistant', text: 'Xin chào! Tôi là Trợ lý ảo tư vấn tự động các thủ tục hành chính. Tôi có thể giúp gì cho bạn hôm nay?', disclaimer: 'Nội dung tổng hợp bằng AI nên có thể có sai sót, vui lòng kiểm chứng lại thông tin.' },
  ]);
  const [val, setVal] = useState('');
  const bodyRef = useRef(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs]);
  const send = () => {
    if (!val.trim()) return;
    const q = val.trim();
    setMsgs((m) => [...m, { role: 'user', text: q }]); setVal('');
    setTimeout(() => setMsgs((m) => [...m, { role: 'assistant', text: 'Để làm thẻ CCCD, công dân cần mang theo: (1) Sổ hộ khẩu hoặc giấy xác nhận cư trú, (2) CMND/CCCD cũ nếu có. Lệ phí cấp mới là 30.000đ. Bạn có thể đến điểm cấp gần nhất trên bản đồ.', disclaimer: 'Nội dung tổng hợp bằng AI nên có thể có sai sót, vui lòng kiểm chứng lại thông tin.' }]), 650);
  };
  const SUGGEST = ['Thủ tục làm CCCD?', 'Đăng ký tạm trú', 'Mức phạt vi phạm giao thông'];
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', background: '#f8fbfa' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', background: '#fff', borderBottom: '1px solid #eef2f7', flexShrink: 0 }}>
        <div style={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="../../assets/icon.png" alt="" style={{ width: 38, height: 38, objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(15,23,42,0.16))' }} />
          <span style={{ position: 'absolute', right: 2, bottom: 4, width: 11, height: 11, borderRadius: 999, background: '#22c55e', border: '2px solid #fff' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--slate-900)' }}>Trợ lý hỗ trợ pháp luật</div>
          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sẵn sàng hỗ trợ</div>
        </div>
        <IconButton variant="soft" icon="close" label="Đóng" onClick={onClose} />
      </div>
      <div ref={bodyRef} className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {msgs.map((m, i) => (
          <ChatBubble key={i} role={m.role} avatar={m.role === 'assistant' ? '../../assets/icon.png' : undefined} disclaimer={m.disclaimer}>{m.text}</ChatBubble>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 14px 8px', overflowX: 'auto' }}>
        {SUGGEST.map((s) => (
          <button key={s} onClick={() => setVal(s)} style={{ flexShrink: 0, padding: '8px 13px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--slate-200)', background: '#fff', color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{s}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px calc(12px + env(safe-area-inset-bottom,0px))', borderTop: '1px solid #eef2f7', background: '#fff', flexShrink: 0 }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Nhập câu hỏi của bạn..." style={{ flex: 1, height: 46, padding: '0 16px', border: '1px solid var(--slate-200)', borderRadius: 'var(--radius-pill)', background: 'var(--surface-muted)', fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none' }} />
        <IconButton variant="fab" icon="send" label="Gửi" onClick={send} />
      </div>
    </div>
  );
}

/* ---------------- App (mobile-first) ---------------- */
function App() {
  const all = window.SAMPLE_UNITS;
  const [filters, setFilters] = useState(['police', 'cccd']);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);

  const toggleFilter = (id) => setFilters((f) => f.includes(id) ? f.filter((x) => x !== id) : [...f, id]);
  const visible = all.filter((u) => {
    const typeOk = (u.type === 'police' && filters.includes('police')) || (u.type === 'cccd' && filters.includes('cccd'));
    const q = query.trim().toLowerCase();
    const qOk = !q || u.name.toLowerCase().includes(q) || u.address.toLowerCase().includes(q);
    return typeOk && qOk;
  });
  const selected = all.find((u) => u.id === selectedId);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--bg-app)' }}>
      <MapView units={all} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setSearchOpen(false); }} />

      <SearchTrigger onOpen={() => setSearchOpen(true)} />

      {/* Map FABs */}
      <div style={{ position: 'absolute', right: 14, bottom: 110, display: 'flex', flexDirection: 'column', gap: 12, zIndex: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--glass-fill-strong)', borderRadius: 'var(--radius-pill)', boxShadow: 'var(--shadow-card)', border: '1px solid var(--glass-stroke)', overflow: 'hidden', backdropFilter: 'var(--blur-md)' }}>
          <IconButton variant="ghost" icon="add" label="Phóng to" />
          <IconButton variant="ghost" icon="remove" label="Thu nhỏ" />
        </div>
        <IconButton variant="fab" icon="my_location" fill label="Tìm vị trí của tôi" size="lg" />
      </div>

      {/* Prominent AI launcher, bottom-left so it doesn't collide with FABs */}
      {!chatOpen && !selected && !searchOpen && (
        <div style={{ position: 'absolute', left: 14, bottom: 22, zIndex: 30 }}>
          <ChatLauncher avatar="../../assets/icon.png" onClick={() => setChatOpen(true)} />
        </div>
      )}

      <SearchSheet open={searchOpen} units={visible} filters={filters} onToggleFilter={toggleFilter}
        query={query} setQuery={setQuery} onSelect={(id) => { setSelectedId(id); setSearchOpen(false); }} onClose={() => setSearchOpen(false)} />

      <DetailSheet unit={selected} onClose={() => setSelectedId(null)} />

      {chatOpen && <ChatScreen onClose={() => setChatOpen(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
