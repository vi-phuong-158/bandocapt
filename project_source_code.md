# TỔNG HỢP MÃ NGUỒN DỰ ÁN BẢN ĐỒ CÔNG AN SỐ

Dưới đây là toàn bộ mã nguồn của dự án được tổng hợp vào một file duy nhất.

---

## 1. index.html

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Bản đồ Công an số</title>
    <meta name="description" content="Hệ thống Bản đồ Công an số và Điểm cấp CCCD tỉnh Phú Thọ. Soft UI Mod.">

    <!-- Fonts: Space Grotesk for Display, Inter for Body -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700;800&display=swap" rel="stylesheet">

    <!-- Material Symbols -->
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=swap" rel="stylesheet" />

    <!-- Leaflet CSS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />

    <!-- Static Compiled Tailwind CSS to optimize performance -->
    <link rel="stylesheet" href="output.css" />
    
    <!-- Custom Styles -->
    <link rel="stylesheet" href="styles.css" />
</head>
<body class="bg-background font-body text-textMain h-screen w-screen overflow-hidden flex relative antialiased selection:bg-primary/20">

    <!-- BASE MAP -->
    <!-- Thêm will-change-transform cho lớp chứa bản đồ lớn -->
    <div id="map" class="absolute inset-0 z-0 bg-slate-200 transform-gpu will-change-transform"></div>

    <!-- UI OVERLAY -->
    <div class="absolute inset-0 z-20 pointer-events-none flex flex-col md:flex-row overflow-hidden">
        
        <!-- Mobile Overlay -->
        <div id="mobile-overlay" class="md:hidden absolute inset-0 bg-slate-900/40 z-20 hidden backdrop-blur-sm transition-opacity opacity-0 pointer-events-auto transform-gpu"></div>

        <!-- ========================================== -->
        <!-- SEARCH PANEL -->
        <!-- ========================================== -->
        <!-- Soft UI: rounded-2xl, background-blur-md, bg-surface/90, shadow-lg, border border-white/20, transform-gpu -->
        <div id="search-panel" class="pointer-events-auto absolute md:relative top-0 left-0 w-full md:w-[420px] h-[85vh] md:h-[calc(100vh-48px)] flex flex-col transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] transform -translate-y-[120%] md:translate-y-0 z-40 bg-surface/90 backdrop-blur-md rounded-b-2xl md:rounded-2xl md:my-6 md:ml-6 border border-white/20 shadow-lg transform-gpu will-change-transform overflow-hidden pb-4 md:pb-0">
            
            <div class="flex-none px-6 pt-7 pb-5 z-10">
                <div class="flex justify-between items-start mb-6">
                    <div class="flex items-center gap-3.5">
                        <div class="w-11 h-11 bg-primary text-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/30">
                            <span class="material-symbols-outlined text-[22px]" style="font-variation-settings: 'FILL' 1;">shield</span>
                        </div>
                        <div>
                            <h1 class="font-display text-[18px] font-bold text-slate-800 leading-tight">Bản đồ Công an số</h1>
                            <p class="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Tỉnh Phú Thọ</p>
                        </div>
                    </div>
                    
                    <button id="close-search-btn" class="md:hidden w-9 h-9 bg-slate-100/80 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-500 transition-colors">
                        <span class="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <!-- Modern Search Bar (rounded-full) -->
                <div class="relative group mt-2">
                    <input type="text" id="search-input" placeholder="Nhập tên đơn vị, phường xã..." class="w-full pl-12 pr-4 py-3.5 bg-slate-50/80 border border-white/40 focus:border-primary rounded-full focus:outline-none focus:ring-4 focus:ring-primary/10 text-[15px] transition-all font-medium text-slate-800 placeholder-slate-400 shadow-sm">
                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span class="material-symbols-outlined text-slate-400 text-[22px] group-focus-within:text-primary transition-colors">search</span>
                    </div>
                </div>

                <!-- Custom Filters (rounded-full) -->
                <div class="flex gap-2.5 mt-5 bg-slate-100/60 p-1.5 rounded-full border border-white/30 backdrop-blur-sm">
                    <label class="flex-1 flex justify-center items-center gap-2 cursor-pointer py-2.5 bg-transparent hover:bg-white/50 rounded-full transition-all group has-[:checked]:bg-white has-[:checked]:shadow-sm">
                        <input type="checkbox" id="filter-police" checked class="hidden peer">
                        <span class="material-symbols-outlined text-[20px] text-slate-400 peer-checked:text-primary transition-colors" style="font-variation-settings: 'FILL' 1;">local_police</span>
                        <span class="text-[13px] font-bold text-slate-500 peer-checked:text-primary transition-colors">Công an</span>
                    </label>
                    <label class="flex-1 flex justify-center items-center gap-2 cursor-pointer py-2.5 bg-transparent hover:bg-white/50 rounded-full transition-all group has-[:checked]:bg-white has-[:checked]:shadow-sm">
                        <input type="checkbox" id="filter-id" checked class="hidden peer">
                        <span class="material-symbols-outlined text-[20px] text-slate-400 peer-checked:text-accent transition-colors" style="font-variation-settings: 'FILL' 1;">badge</span>
                        <span class="text-[13px] font-bold text-slate-500 peer-checked:text-accent transition-colors">Điểm CCCD</span>
                    </label>
                </div>

                <!-- Security Announcement Banner (rounded-xl) -->
                <div id="announcement-banner" class="mt-5 bg-amber-50/90 border border-amber-200/60 p-3.5 rounded-xl flex items-start gap-3 cursor-pointer hover:bg-amber-100 transition-colors shadow-sm" style="display: none;">
                    <span class="material-symbols-outlined text-accent mt-0.5" style="font-variation-settings: 'FILL' 1;">warning</span>
                    <div class="flex-1">
                        <p class="text-[14px] font-bold text-amber-900 leading-tight" id="announcement-banner-text">0 đơn vị có chú ý</p>
                        <p class="text-[12px] text-amber-800/80 mt-1 font-medium">Theo dõi thông tin mới nhất.</p>
                    </div>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar p-4 will-change-[contents]" id="results-list">
                <!-- Data goes here -->
            </div>
        </div>

        <!-- ========================================== -->
        <!-- DETAIL PANEL (Bottom Sheet / Floating) -->
        <!-- ========================================== -->
        <!-- Soft UI: rounded-2xl, background-blur-md, bg-surface/90, shadow-lg, border border-white/20, transform-gpu -->
        <div id="detail-panel" class="pointer-events-auto absolute md:relative bottom-0 md:top-auto md:bottom-auto md:my-auto md:ml-8 w-full md:w-[440px] h-[85vh] md:h-auto md:max-h-[85vh] flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] transform translate-y-full md:translate-y-0 md:-translate-x-[120%] z-40 bg-surface/90 backdrop-blur-md rounded-t-2xl md:rounded-2xl border border-white/20 shadow-lg transform-gpu will-change-transform overflow-hidden">
            
            <div id="drag-handle" class="md:hidden w-full h-8 flex items-center justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing absolute top-0 z-50 transform-gpu">
                <div class="w-12 h-1.5 bg-white/50 backdrop-blur rounded-full"></div>
            </div>

            <!-- Header Image -->
            <div class="flex-none relative w-full h-[220px] md:h-[240px] bg-slate-900 shrink-0 transform-gpu" style="perspective: 1000px;">
                <img id="detail-image" alt="Hình ảnh trụ sở" class="w-full h-full object-cover opacity-90 transform-gpu" src="https://ui-avatars.com/api/?name=Police&background=random" />
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>

                <button id="back-to-list-btn" class="absolute top-4 left-4 w-10 h-10 rounded-full bg-slate-900/30 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-slate-900/50 transition-colors z-10 transform-gpu">
                    <span class="material-symbols-outlined hidden md:block">arrow_back</span>
                    <span class="material-symbols-outlined md:hidden">close</span>
                </button>

                <!-- Status & Title -->
                <div class="absolute bottom-6 left-6 right-24 z-10 text-white transform-gpu">
                    <!-- detail-badge content generated via JS includes rounded-full/rounded-md -> set fixed styles locally if needed or let bg-primary do it (We did inline-block rounded-md in JS update, so it's fine) -->
                    <span id="detail-badge" class="inline-block px-3 py-1.5 bg-primary/90 backdrop-blur-md rounded-md text-[10px] font-bold uppercase tracking-widest mb-2 border border-blue-400/20 text-blue-50 shadow-lg transform-gpu">Loại đơn vị</span>
                    <h1 id="detail-title" class="font-display text-[26px] md:text-[28px] font-bold leading-tight drop-shadow-md text-white transform-gpu">Tên trụ sở</h1>
                </div>

                <!-- Distance (rounded-full) -->
                <div class="absolute bottom-6 right-6 z-10">
                    <span id="detail-distance-badge" class="inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-md text-primary text-[13px] font-bold px-3.5 py-2 rounded-full shadow-lg border border-white/30 hidden transform-gpu">
                        <span class="material-symbols-outlined text-[16px] text-primary" style="font-variation-settings: 'FILL' 1;">near_me</span>
                        <span id="detail-distance-text">-- km</span>
                    </span>
                </div>
            </div>

            <!-- Detailed Content -->
            <div class="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-8 pt-7 pb-24 md:pb-8 will-change-[contents]">
                
                <!-- Quick Actions Block (rounded-xl) -->
                <div class="grid grid-cols-2 gap-4 mb-8">
                    <a id="action-directions" href="#" target="_blank" class="flex items-center justify-center gap-2.5 bg-blue-50/80 hover:bg-blue-100 text-primary py-3.5 rounded-xl transition-colors shadow-sm border border-white/50">
                        <span class="material-symbols-outlined text-[22px]" style="font-variation-settings: 'FILL' 1;">directions</span>
                        <span class="text-[14px] font-bold">Chỉ đường</span>
                    </a>
                    <a id="action-call" href="#" class="flex items-center justify-center gap-2.5 bg-slate-50/80 hover:bg-slate-100 text-slate-700 py-3.5 rounded-xl transition-colors shadow-sm border border-white/50">
                        <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">call</span>
                        <span class="text-[14px] font-bold">Gọi điện</span>
                    </a>
                </div>

                <!-- Announcement Display (rounded-xl) -->
                <div id="detail-announcement" class="bg-amber-50/80 rounded-xl p-5 border border-white/50 shadow-sm mb-8 hidden backdrop-blur-sm">
                    <div class="flex flex-col gap-1.5">
                        <div class="flex items-center gap-2 text-accent">
                            <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">error</span>
                            <h3 id="ann-title" class="font-display font-bold text-[15px]">Tiêu đề hộp thoại</h3>
                        </div>
                        <p id="ann-content" class="text-[14px] text-amber-900/80 leading-relaxed mt-1">Nội dung chi tiết...</p>
                        <hr class="border-amber-200/60 my-2 mt-3">
                        <p id="ann-time" class="text-[12px] font-semibold text-amber-700/80">Hết hiệu lực: --</p>
                    </div>
                </div>

                <!-- Attributes -->
                <div class="flex flex-col gap-6">
                    <div class="flex items-start gap-4">
                        <div class="w-10 h-10 rounded-full bg-slate-50/80 border border-white/50 flex items-center justify-center text-primary shrink-0 shadow-sm">
                            <span class="material-symbols-outlined text-[20px]">location_on</span>
                        </div>
                        <div class="pt-2">
                            <p class="text-[12px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Địa chỉ</p>
                            <p id="detail-address" class="text-[15px] font-medium text-slate-800 leading-snug">--</p>
                        </div>
                    </div>
                    
                    <a id="detail-phone-link" href="#" class="flex items-start gap-4 group">
                        <div class="w-10 h-10 rounded-full bg-slate-50/80 border border-white/50 group-hover:bg-blue-50/80 flex items-center justify-center text-primary shrink-0 transition-colors shadow-sm">
                            <span class="material-symbols-outlined text-[20px]">phone</span>
                        </div>
                        <div class="pt-2">
                            <p class="text-[12px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Số điện thoại</p>
                            <p id="detail-phone" class="text-[15px] font-bold text-slate-800 group-hover:text-primary transition-colors">--</p>
                        </div>
                    </a>

                    <div id="detail-hours-container" class="flex items-start gap-4">
                        <div class="w-10 h-10 rounded-full bg-slate-50/80 border border-white/50 flex items-center justify-center text-primary shrink-0 shadow-sm">
                            <span class="material-symbols-outlined text-[20px]">schedule</span>
                        </div>
                        <div class="pt-2">
                            <p class="text-[12px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Giờ làm việc</p>
                            <p id="detail-hours" class="text-[14px] font-medium text-slate-600 leading-relaxed">--</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ========================================== -->
    <!-- FLOATING MAP CONTROLS -->
    <!-- ========================================== -->
    
    <!-- Mobile Fake Search Button -->
    <button id="mobile-search-btn" class="md:hidden absolute top-5 left-4 right-4 z-10 h-14 bg-surface/90 backdrop-blur-md rounded-full shadow-lg flex items-center px-4 gap-3 text-slate-500 pointer-events-auto active:scale-[0.98] transition-all border border-white/20 transform-gpu will-change-transform">
        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <span class="material-symbols-outlined text-[18px]">menu</span>
        </div>
        <span class="flex-1 text-left text-[15px] font-medium">Khám phá đơn vị...</span>
        <div class="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center border border-white/50 shadow-sm">
            <span class="material-symbols-outlined text-[18px] text-slate-400">search</span>
        </div>
    </button>

    <!-- Map Actions (Bottom Right) -->
    <div class="absolute bottom-8 right-5 md:right-8 flex flex-col gap-3 pointer-events-auto z-20">
        
        <button id="find-location-btn" class="w-14 h-14 bg-primary text-white rounded-full shadow-[0_8px_24px_rgba(30,58,138,0.3)] hover:shadow-[0_12px_28px_rgba(30,58,138,0.4)] flex items-center justify-center transition-all md:hover:-translate-y-1 active:scale-95 group border border-white/10 transform-gpu will-change-transform">
            <span id="location-icon" class="material-symbols-outlined text-[26px]" style="font-variation-settings: 'FILL' 1;">my_location</span>
        </button>

        <div class="hidden md:flex flex-col bg-surface/90 backdrop-blur-md rounded-full shadow-lg border border-white/20 overflow-hidden mt-2 transform-gpu will-change-transform">
            <button id="zoom-in-btn" class="w-14 h-14 hover:bg-slate-50/50 text-slate-600 hover:text-primary flex items-center justify-center transition-colors border-b border-white/40">
                <span class="material-symbols-outlined text-[24px]">add</span>
            </button>
            <button id="zoom-out-btn" class="w-14 h-14 hover:bg-slate-50/50 text-slate-600 hover:text-primary flex items-center justify-center transition-colors">
                <span class="material-symbols-outlined text-[24px]">remove</span>
            </button>
        </div>
    </div>

    <!-- Scripts -->
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="data.js"></script>
    <script src="app.js"></script>

</body>
</html>
```

---

## 2. styles.css

```css
/* ==========================================
   STYLES.CSS - Bản đồ Công an số Theme (Soft UI + Performance Mod)
   ========================================== */

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(15, 23, 42, 0.1); 
    border-radius: 20px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(15, 23, 42, 0.2);
}

.pb-safe { padding-bottom: env(safe-area-inset-bottom); }

:root {
    --sheet-height: 85vh;
    --sheet-translate: 100%;
}

@media (max-width: 767px) {
    #detail-panel {
        height: var(--sheet-height) !important;
        /* PERFORMANCE OPTIMIZATION: Bổ sung translate3d ép tăng tốc GPU để sửa lỗi giật lag (repaint) khi kéo thả bottom sheet */
        transform: translate3d(0, var(--sheet-translate), 0) !important;
        -webkit-transform: translate3d(0, var(--sheet-translate), 0) !important;
        border-top-left-radius: 1.5rem !important; /* rounded-3xl / 2xl tuỳ khung */
        border-top-right-radius: 1.5rem !important;
        will-change: transform, contents;
        box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.12);
        background-color: rgba(255, 255, 255, 0.95) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
    }
    #detail-panel.transitioning { 
        transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1); 
    }
    #search-panel { 
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
        will-change: transform;
    }
}

.transparent-leaflet-icon {
    background: transparent !important;
    border: none !important;
}

.leaflet-control-zoom, .leaflet-control-attribution { display: none !important; }

/* --- Map Marker Styles (Drop/Pin) --- */
.marker-container { position: relative; width: 44px; height: 44px; display: flex; justify-content: center; align-items: center; will-change: transform; }
.marker-icon {
    width: 38px; height: 38px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg) translateZ(0); display: flex; justify-content: center; align-items: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); border: 2px solid white; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); z-index: 10;
}
.marker-container:hover .marker-icon { transform: rotate(-45deg) scale(1.1) translateZ(0); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2); }
.marker-inner { transform: rotate(45deg); color: white; display: flex; justify-content: center; align-items: center; }

/* Colors: Primary (Police Blue), Accent (Amber) */
.marker-police .marker-icon { background: #1e3a8a; } /* Blue 900 */
.marker-id .marker-icon { background: #d97706; } /* Amber 600 */

@keyframes pulse-ring-blue { 0% { transform: scale(0.8) translateZ(0); opacity: 0.8; } 100% { transform: scale(3.5) translateZ(0); opacity: 0; } }
@keyframes pulse-ring-amber { 0% { transform: scale(0.8) translateZ(0); opacity: 0.8; } 100% { transform: scale(3.5) translateZ(0); opacity: 0; } }

.marker-selected .marker-icon {
    transform: rotate(-45deg) scale(1.2) translateZ(0); box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.9), 0 8px 24px rgba(0, 0, 0, 0.25); z-index: 999 !important;
}
.marker-selected::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; border-radius: 50%; z-index: 1; }
.marker-selected.marker-police::before { background-color: rgba(30, 58, 138, 0.4); animation: pulse-ring-blue 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite; }
.marker-selected.marker-id::before { background-color: rgba(217, 119, 6, 0.4); animation: pulse-ring-amber 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite; }

.marker-has-announcement::after {
    content: '!'; position: absolute; top: -6px; right: -6px; background: #dc2626; color: white; font-size: 13px; font-weight: 800; font-family: 'Inter', sans-serif;
    width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; z-index: 20; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); animation: bounce 2s infinite; will-change: transform;
}
@keyframes bounce { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(0, -4px, 0); } }

/* --- Label hiển thị tên  --- */
.marker-label {
    position: absolute; top: -36px; left: 50%; transform: translate3d(-50%, 0, 0); background: white; color: #0f172a; padding: 6px 14px; border-radius: 16px; /* Soft UI: 16px */
    font-size: 13px; font-weight: 700; white-space: nowrap; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); opacity: 0; pointer-events: none; transition: opacity 0.2s, transform 0.2s; z-index: 30; font-family: 'Inter', sans-serif; border: 1px solid rgba(0, 0, 0, 0.05);
    will-change: transform, opacity;
}
.marker-label::after {
    content: ''; position: absolute; bottom: -5px; left: 50%; margin-left: -5px; border-width: 5px 5px 0; border-style: solid; border-color: white transparent transparent transparent;
}
@media (hover: hover) { .marker-container:hover .marker-label { opacity: 1; transform: translate3d(-50%, -6px, 0); } }
.marker-selected .marker-label { opacity: 1; transform: translate3d(-50%, -10px, 0); }

/* Vị trí người dùng */
.user-marker { background: #2563eb; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 16px rgba(37, 99, 235, 0.5); position: relative; will-change: transform; }
.user-marker::before { content: ''; position: absolute; top: -14px; left: -14px; right: -14px; bottom: -14px; border-radius: 50%; background-color: rgba(37, 99, 235, 0.2); animation: pulse-ring-blue 2s infinite; }

/* --- Kết quả tìm kiếm (Cards) --- */
/* Nâng cấp giao diện Soft UI cho Card: rounded-xl (16px) */
.result-item {
    padding: 16px 14px; border-radius: 16px; margin-bottom: 8px; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.5); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; display: flex; gap: 14px; align-items: flex-start; box-shadow: 0 4px 16px -2px rgba(0,0,0,0.05);
    will-change: transform;
    transform: translateZ(0);
}
.result-item:hover, .result-item:active { background: #ffffff; transform: translate3d(0, -2px, 0); box-shadow: 0 8px 24px -4px rgba(0,0,0,0.08); border-color: rgba(255, 255, 255, 1); }
.result-item.has-ann { background: rgba(255, 251, 235, 0.9); border-color: rgba(253, 230, 138, 0.6); }

.result-icon-box {
    width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: white;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}
.bg-police { background-color: #1e3a8a; }
.bg-id { background-color: #d97706; }

.result-content { flex: 1; min-width: 0; padding-top: 2px; }
.result-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; letter-spacing: -0.2px; }
.result-address { font-size: 13px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }

.result-dist { font-size: 12px; font-weight: 700; color: #047857; background: #d1fae5; padding: 4px 10px; border-radius: 9999px; /* Soft UI: rounded-full */ margin-top: 8px; display: inline-block; }
.result-ann-tag { font-size: 13px; font-weight: 600; color: #b45309; gap: 4px; margin-top: 8px; background: #fef3c7; padding: 4px 10px; border-radius: 9999px; /* Soft UI: rounded-full */ display: inline-flex; align-items: center; }
.result-ann-tag span { font-size: 16px; font-variation-settings: 'FILL' 1; }

.empty-state { text-align: center; padding: 80px 20px; color: #94a3b8; }
.empty-state span { font-size: 64px; opacity: 0.2; margin-bottom: 20px; color: #cbd5e1; display: block; }
.empty-state p { font-weight: 600; font-size: 16px; font-family: 'Inter', sans-serif;}
```

---

## 3. tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./*.js"],
  theme: {
    extend: {
      colors: {
        primary: "#1e3a8a", // blue-900 (Police Blue)
        secondary: "#047857", // emerald-700 
        accent: "#d97706", // amber-600
        surface: "#ffffff",
        background: "#f1f5f9", // slate-100
        textMain: "#0f172a", // slate-900
        textMuted: "#64748b", // slate-500
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
        sheet: "0 -8px 30px rgba(0, 0, 0, 0.12)",
        card: "0 4px 16px -2px rgba(0, 0, 0, 0.05)",
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      }
    },
  },
  plugins: [],
}
```

---

[Tiếp tục phần sau...]

## 4. app.js

```javascript
// ==========================================
// APP.JS - Logic chính Bản đồ số Công an Phú Thọ (V2)
// Hệ thống tương tác kéo Mobile Bottom Sheet
// ==========================================

const CONFIG = {
  center: [21.325, 105.365],
  defaultZoom: 12,
  sheetId: "1qkResomTlk3tLeoyz1HFFScwswxPIa8L4bySUammLSs", // THAY BẰNG ID GOOGLE SHEET THÔNG BÁO THỰC TẾ
  sheetName: "DaXacThuc",
  hqSheetId: "1qkResomTlk3tLeoyz1HFFScwswxPIa8L4bySUammLSs",
  hqSheetName: "Form_Responses",
  announcementRefreshInterval: 5 * 60 * 1000,
};

// ==========================================
// 1. DOM Elements
// ==========================================
const searchPanel = document.getElementById("search-panel");
const detailPanel = document.getElementById("detail-panel");
const mobileOverlay = document.getElementById("mobile-overlay");
const mobileSearchBtn = document.getElementById("mobile-search-btn");
const closeSearchBtn = document.getElementById("close-search-btn");

const searchInput = document.getElementById("search-input");
const resultsList = document.getElementById("results-list");
const announcementBanner = document.getElementById("announcement-banner");
const announcementBannerText = document.getElementById(
  "announcement-banner-text",
);

// Detail Panel Elements
const detailTitle = document.getElementById("detail-title");
const detailBadge = document.getElementById("detail-badge");
const detailAddress = document.getElementById("detail-address");
const detailPhone = document.getElementById("detail-phone");
const detailPhoneLink = document.getElementById("detail-phone-link");
const detailHours = document.getElementById("detail-hours");
const detailHoursContainer = document.getElementById("detail-hours-container");
const detailImage = document.getElementById("detail-image");
const actionDirections = document.getElementById("action-directions");
const actionCall = document.getElementById("action-call");
const backToListBtn = document.getElementById("back-to-list-btn");

const detailAnnBox = document.getElementById("detail-announcement");
const annTitle = document.getElementById("ann-title");
const annContent = document.getElementById("ann-content");
const annTime = document.getElementById("ann-time");

const detailDistanceBadge = document.getElementById("detail-distance-badge");
const detailDistanceText = document.getElementById("detail-distance-text");
const dragHandle = document.getElementById("drag-handle");

// ==========================================
// 2. State & Constants
// ==========================================
let activeAnnouncements = {};
let userMarker = null;
let userLat = null;
let userLng = null;
let currentlySelectedLocation = null;
let previousSelectedLocation = null;

const STATE = {
  HIDDEN: "100%",
  COLLAPSED: "50%", // Thò lên một nửa
  EXPANDED: "0%", // Kéo full màn hình
};

// ==========================================
// 3. Khởi tạo Bản đồ
// ==========================================
const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
  zoomSnap: 0.5,
  zoomDelta: 0.5,
}).setView(CONFIG.center, CONFIG.defaultZoom);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  pane: "tilePane",
}).addTo(map);

document
  .getElementById("zoom-in-btn")
  .addEventListener("click", () => map.zoomIn());
document
  .getElementById("zoom-out-btn")
  .addEventListener("click", () => map.zoomOut());

// ==========================================
// 4. Icons & Layers
// ==========================================
function createCustomIcon(loc) {
  const isPolice = loc.type === "police_station";
  const hasAnn = !!activeAnnouncements[loc.name];
  const isSelected =
    currentlySelectedLocation && currentlySelectedLocation.id === loc.id;

  let wrapperClass = "marker-container";
  if (isSelected) wrapperClass += " marker-selected";
  wrapperClass += isPolice ? " marker-police" : " marker-id";

  let iconClass = "marker-icon";
  if (hasAnn) iconClass += " marker-has-announcement";

  const html = `
        <div class="${wrapperClass}">
            <div class="${iconClass}">
                <div class="marker-inner">
                    <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">
                        ${isPolice ? "shield" : "badge"}
                    </span>
                </div>
            </div>
            <div class="marker-label">${escapeHtml(loc.name)}</div>
        </div>
    `;

  return L.divIcon({
    className: "transparent-leaflet-icon",
    html: html,
    iconSize: [44, 44],
    iconAnchor: [22, 44],
  });
}

const layerGroup = L.layerGroup().addTo(map);

function updateAllMarkersIcon() {
  locations.forEach((loc) => {
    if (loc.marker) loc.marker.setIcon(createCustomIcon(loc));
  });
}

// ==========================================
// 5. Mobile Bottom Sheet Logic (Kéo thả)
// ==========================================
let startY = 0;
let currentY = 0;
let isDragging = false;
let currentTranslate = STATE.HIDDEN;

function setSheetState(state, animate = true) {
  const isMobile = window.innerWidth < 768;

  if (animate) {
    detailPanel.classList.add("transitioning");
  } else {
    detailPanel.classList.remove("transitioning");
  }

  if (isMobile) {
    document.documentElement.style.setProperty("--sheet-translate", state);
    currentTranslate = state;
  } else {
    // Trên PC: ẩn/hiện bằng translate-x
    if (state === STATE.HIDDEN) {
      detailPanel.classList.add("-translate-x-[110%]");
      detailPanel.classList.remove("md:relative");
      searchPanel.classList.remove("-translate-x-[110%]");
      searchPanel.classList.add("md:relative");
    } else {
      // Khác HIDDEN là hiện
      searchPanel.classList.add("-translate-x-[110%]");
      searchPanel.classList.remove("md:relative");
      detailPanel.classList.remove("-translate-x-[110%]");
      detailPanel.classList.add("md:relative");
    }
  }
}

// Gắn sự kiện kéo trên mobile cho thanh ngang
dragHandle.addEventListener(
  "touchstart",
  (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
    setSheetState(currentTranslate, false); // Bỏ CSS transition để kéo mượt theo ngón tay
  },
  { passive: true },
);

dragHandle.addEventListener(
  "touchmove",
  (e) => {
    if (!isDragging) return;
    const y = e.touches[0].clientY;
    const deltaY = y - startY;

    let translateYStr;
    const panelHeight = detailPanel.offsetHeight;

    if (currentTranslate === STATE.COLLAPSED) {
      // Đang lửng, kéo lên (số âm) -> mở mảng
      // kéo xuống (số dương) -> ẩn
      const movePercent = (deltaY / window.innerHeight) * 100;
      let newPercent = 50 + movePercent;

      // Giới hạn không cho kéo quá lên (0%) hay quá xuống (100%)
      newPercent = Math.max(0, Math.min(100, newPercent));
      document.documentElement.style.setProperty(
        "--sheet-translate",
        `${newPercent}%`,
      );
    } else if (currentTranslate === STATE.EXPANDED) {
      if (deltaY > 0) {
        // Chỉ cho kéo xuống
        const movePercent = (deltaY / window.innerHeight) * 100;
        document.documentElement.style.setProperty(
          "--sheet-translate",
          `${Math.min(100, movePercent)}%`,
        );
      }
    }
  },
  { passive: true },
);

dragHandle.addEventListener("touchend", (e) => {
  if (!isDragging) return;
  isDragging = false;

  const endY = e.changedTouches[0].clientY;
  const deltaY = endY - startY;
  const threshold = 50; // Quãng đường kéo để chuyển state

  if (currentTranslate === STATE.COLLAPSED) {
    if (deltaY < -threshold) setSheetState(STATE.EXPANDED);
    else if (deltaY > threshold) {
      setSheetState(STATE.HIDDEN);
      closeDetailPanel(); // Tắt luôn
    } else setSheetState(STATE.COLLAPSED);
  } else if (currentTranslate === STATE.EXPANDED) {
    if (deltaY > threshold) setSheetState(STATE.COLLAPSED);
    else setSheetState(STATE.EXPANDED);
  }
});

// ==========================================
// 6. Điều khiển giao diện (Flow chính)
// ==========================================
function openDetailPanel(loc) {
  previousSelectedLocation = currentlySelectedLocation;
  currentlySelectedLocation = loc;

  if (previousSelectedLocation && previousSelectedLocation.marker) {
    previousSelectedLocation.marker.setIcon(createCustomIcon(previousSelectedLocation));
  }
  if (currentlySelectedLocation && currentlySelectedLocation.marker) {
    currentlySelectedLocation.marker.setIcon(createCustomIcon(currentlySelectedLocation));
  }

  const isPolice = loc.type === "police_station";
  const hasAnn = !!activeAnnouncements[loc.name];

  // Data Fill
  detailBadge.textContent = isPolice ? "Trụ sở Công an" : "Điểm cấp CCCD";
  detailBadge.className = isPolice
    ? "inline-block px-3 py-1.5 bg-primary/90 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest mb-2 border border-blue-400/20 text-blue-50 shadow-lg transform-gpu"
    : "inline-block px-3 py-1.5 bg-accent/90 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest mb-2 border border-amber-400/20 text-amber-50 shadow-lg transform-gpu";

  detailTitle.textContent = loc.name;
  detailTitle.className = "font-display text-[26px] md:text-[28px] font-bold leading-tight drop-shadow-md text-white";

  // Sửa link ảnh bảo mật (https) và có fallback trực quan
  if (loc.imageUrl && loc.imageUrl.startsWith("http")) {
    detailImage.src = loc.imageUrl;
  } else {
    // Tạo ảnh mặc định dựa trên chữ cái đầu của tên địa điểm
    detailImage.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(loc.name)}&background=random`;
  }

  detailAddress.textContent = loc.address;

  if (loc.phone && loc.phone !== "Cập nhật sau...") {
    detailPhone.textContent = loc.phone;
    const cleanPhone = String(loc.phone).replace(/[^\d+]/g, "");
    detailPhoneLink.href = `tel:${cleanPhone}`;
    detailPhoneLink.style.display = "flex";
    actionCall.href = `tel:${cleanPhone}`;
    actionCall.classList.remove("opacity-40", "pointer-events-none");
  } else {
    detailPhone.textContent = "Chưa có SĐT";
    detailPhoneLink.style.display = "flex";
    detailPhoneLink.href = "#";
    actionCall.href = "#";
    actionCall.classList.add("opacity-40", "pointer-events-none");
  }

  // Giờ làm việc cố định toàn tỉnh
  // Tính năng 1: Trạng thái đóng/mở cửa theo thời gian thực
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5; // Thứ 2 đến Thứ 6
  const isMorning = currentHour >= 7.5 && currentHour <= 11.5;
  const isAfternoon = currentHour >= 13 && currentHour <= 16.5;

  let statusText = "Đã nghỉ làm";
  let statusColor = "text-danger"; // text-danger = red-600

  if (isWeekday && (isMorning || isAfternoon)) {
    statusText = "Đang mở cửa";
    statusColor = "text-secondary font-bold animate-pulse"; // text-secondary = emerald-700
  }

  // Tính năng 2: Nhắc nhở giấy tờ nếu là điểm cấp CCCD
  const procedureNote =
    loc.type === "id_center"
      ? `<div class="text-[13px] text-amber-800 mt-2.5 bg-amber-50 border border-amber-200/50 p-3 rounded-xl flex items-start gap-2 shadow-sm font-medium">
        <span class="material-symbols-outlined text-[18px] text-amber-600">info</span>
        <span>Lưu ý: Người dân nhớ mang theo CCCD/CMND cũ hoặc Giấy khai sinh.</span>
       </div>`
      : "";

  detailHours.innerHTML = `<span class="${statusColor} font-bold">${statusText}</span> <span class="text-slate-300 mx-1.5">•</span> Sáng: 07h30-11h30 | Chiều: 13h00-16h30 ${procedureNote}`;
  detailHoursContainer.style.display = "flex";

  if (loc._currentDistance != null) {
    detailDistanceText.textContent =
      loc._currentDistance < 1
        ? `${(loc._currentDistance * 1000).toFixed(0)} m`
        : `${loc._currentDistance.toFixed(1)} km`;
    detailDistanceBadge.style.display = "inline-flex";
  } else {
    detailDistanceBadge.style.display = "none";
  }

  // Sửa link chỉ đường chuẩn Google Maps
  actionDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;

  if (hasAnn) {
    const ann = activeAnnouncements[loc.name];
    annTitle.textContent = ann.title;
    annContent.textContent = ann.content || "";
    annTime.textContent = `Hết hiệu lực: ${ann.expiresAtDisplay}`;
    detailAnnBox.style.display = "block";
  } else {
    detailAnnBox.style.display = "none";
  }

  // Giao diện
  hideMobileSearch(); // Đảm bảo ẩn thanh search nếu đang ở mobile
  const isMobile = window.innerWidth < 768;
  setSheetState(isMobile ? STATE.COLLAPSED : STATE.EXPANDED); // Mobile thò nửa, PC full

  // Pan bản đồ
  if (isMobile) {
    // Dịch center cao lên 1 tí để popup che phần dưới
    map.flyTo([loc.lat - 0.003, loc.lng], 15.5, {
      animate: true,
      duration: 0.8,
    });
  } else {
    map.flyTo([loc.lat, loc.lng + 0.015], 15.5, {
      animate: true,
      duration: 0.8,
    });
  }
}

function closeDetailPanel() {
  previousSelectedLocation = currentlySelectedLocation;
  currentlySelectedLocation = null;

  if (previousSelectedLocation && previousSelectedLocation.marker) {
    previousSelectedLocation.marker.setIcon(createCustomIcon(previousSelectedLocation));
  }
  setSheetState(STATE.HIDDEN);
}

backToListBtn.addEventListener("click", () => {
  closeDetailPanel();
});

// ==========================================
// 7. Search Sidebar Logic
// ==========================================
function getActiveFilters() {
  return {
    showPolice: document.getElementById("filter-police").checked,
    showId: document.getElementById("filter-id").checked,
  };
}

function filterAndRender() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const { showPolice, showId } = getActiveFilters();
  const visibleLocations = [];

  locations.forEach((loc) => {
    const isPolice = loc.type === "police_station";
    const matchesFilter = (isPolice && showPolice) || (!isPolice && showId);
    const matchesSearch =
      loc.name.toLowerCase().includes(searchTerm) ||
      loc.address.toLowerCase().includes(searchTerm);

    if (matchesFilter && matchesSearch) {
      if (!map.hasLayer(loc.marker)) loc.marker.addTo(layerGroup);
      visibleLocations.push(loc);
    } else {
      if (map.hasLayer(loc.marker)) map.removeLayer(loc.marker);
    }
  });

  if (userLat != null) {
    visibleLocations.sort(
      (a, b) =>
        (a._currentDistance || Infinity) - (b._currentDistance || Infinity),
    );
  }

  renderResultsList(visibleLocations);
}

function renderResultsList(results) {
  if (results.length === 0) {
    resultsList.innerHTML = `<div class="empty-state">
            <span class="material-symbols-outlined">travel_explore</span>
            <p>Không tìm thấy kết quả</p>
        </div>`;
    return;
  }

  resultsList.innerHTML = results
    .map((loc) => {
      const isPolice = loc.type === "police_station";
      const hasAnn = !!activeAnnouncements[loc.name];
      const distStr =
        loc._currentDistance != null
          ? loc._currentDistance < 1
            ? `${(loc._currentDistance * 1000).toFixed(0)}m`
            : `${loc._currentDistance.toFixed(1)}km`
          : "";

      const iconClass = isPolice ? "bg-police" : "bg-id";
      const iconName = isPolice ? "shield" : "badge";
      const annHTML = hasAnn
        ? `<div class="result-ann-tag"><span class="material-symbols-outlined">error</span> Bấm xem thông báo</div>`
        : "";

      return `
            <div class="result-item ${hasAnn ? "has-ann" : ""}" data-id="${loc.id}">
                <div class="result-icon-box ${iconClass}">
                    <span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' 1;">${iconName}</span>
                </div>
                <div class="result-content">
                    <h3 class="result-title">${escapeHtml(loc.name)}</h3>
                    <p class="result-address">${escapeHtml(loc.address)}</p>
                    ${annHTML}
                </div>
                ${distStr ? `<div class="result-dist">${distStr}</div>` : ""}
            </div>
        `;
    })
    .join("");

  resultsList.querySelectorAll(".result-item").forEach((item) => {
    item.addEventListener("click", () => {
      const loc = locations.find((l) => l.id === parseInt(item.dataset.id));
      if (loc) openDetailPanel(loc);
    });
  });
}

searchInput.addEventListener("input", filterAndRender);
document
  .getElementById("filter-police")
  .addEventListener("change", filterAndRender);
document
  .getElementById("filter-id")
  .addEventListener("change", filterAndRender);

// ==========================================
// 8. Mobile Main Sidebar Toggle Logic
// ==========================================
function showMobileSearch() {
  closeDetailPanel();
  searchPanel.classList.remove("-translate-y-[120%]", "opacity-0");
  searchPanel.classList.add("translate-y-0", "opacity-100");
  mobileOverlay.classList.remove("hidden");
  // timeout để bắt CSS fade
  setTimeout(() => mobileOverlay.classList.remove("opacity-0"), 10);
}

function hideMobileSearch() {
  searchPanel.classList.remove("translate-y-0", "opacity-100");
  searchPanel.classList.add("-translate-y-[120%]", "opacity-0");
  mobileOverlay.classList.add("opacity-0");
  setTimeout(() => mobileOverlay.classList.add("hidden"), 300);
}

mobileSearchBtn.addEventListener("click", showMobileSearch);
closeSearchBtn.addEventListener("click", hideMobileSearch);
mobileOverlay.addEventListener("click", hideMobileSearch);

// ==========================================
// 9. API Google Sheets (Xử lý vượt lỗi CORS JSONP)
// ==========================================
function fetchGoogleSheetJSONP(sheetId, sheetName) {
  return new Promise((resolve, reject) => {
    const callbackName = 'gviz_' + Math.round(1000000 * Math.random());
    window[callbackName] = function (data) {
      delete window[callbackName];
      document.body.removeChild(script);
      resolve(data);
    };

    let url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json;responseHandler:${callbackName}`;
    if (sheetName) {
      url += `&sheet=${encodeURIComponent(sheetName)}`;
    }

    const script = document.createElement('script');
    script.src = url;
    script.onerror = function () {
      delete window[callbackName];
      document.body.removeChild(script);
      reject(new Error("JSONP loading failed"));
    };
    document.body.appendChild(script);
  });
}

// Thông báo 

async function fetchAnnouncements() {
  if (!CONFIG.sheetId || CONFIG.sheetId === "YOUR_GOOGLE_SHEET_ID") return;
  try {
    const data = await fetchGoogleSheetJSONP(CONFIG.sheetId, CONFIG.sheetName);

    const now = new Date();
    activeAnnouncements = {};

    data.table.rows.forEach((row) => {
      const cells = row.c;
      if (!cells || cells.length < 5) return;
      const unit = cells[1]?.v;
      const title = cells[2]?.v;

      if (!unit || !title) return;
      let expiresAt = null;
      if (cells[4]?.v) {
        const raw = String(cells[4].v);
        const dm = raw.match(/Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
        expiresAt = dm
          ? new Date(dm[1], dm[2], dm[3], dm[4], dm[5], dm[6])
          : new Date(raw);
      }
      if (expiresAt && expiresAt < now) return;

      activeAnnouncements[unit] = {
        title,
        content: cells[3]?.v || "",
        expiresAt,
        expiresAtDisplay:
          cells[4]?.f ||
          (expiresAt ? expiresAt.toLocaleString("vi-VN") : "N/A"),
      };
    });

    const count = Object.keys(activeAnnouncements).length;
    if (count > 0) {
      announcementBanner.style.display = "flex";
      announcementBannerText.textContent = `${count} đơn vị có cảnh báo cần chú ý`;
    } else announcementBanner.style.display = "none";

    updateAllMarkersIcon();
    filterAndRender();
    if (currentlySelectedLocation) openDetailPanel(currentlySelectedLocation);
  } catch (err) {
    console.warn("Google Sheets Error: ", err.message);
  }
}
announcementBanner.addEventListener("click", () => {
  const target = locations.find((loc) => activeAnnouncements[loc.name]);
  if (target) {
    if (window.innerWidth < 768) hideMobileSearch();
    openDetailPanel(target);
  }
});
// fetchAnnouncements(); // Sẽ được gọi sau khi tải xong Trụ sở
setInterval(fetchAnnouncements, CONFIG.announcementRefreshInterval);

// ==========================================
// 10. Định vị (Geolocation)
// ==========================================
document.getElementById("find-location-btn").addEventListener("click", () => {
  if (!navigator.geolocation) return alert("Trình duyệt không hỗ trợ.");
  const icon = document.getElementById("location-icon");
  icon.textContent = "progress_activity";
  icon.classList.add("animate-spin");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      icon.textContent = "my_location";
      icon.classList.remove("animate-spin");
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;

      if (userMarker) userMarker.setLatLng([userLat, userLng]);
      else
        userMarker = L.circleMarker([userLat, userLng], {
          radius: 9,
          fillColor: "#3B82F6",
          color: "#fff",
          weight: 3,
          opacity: 1,
          fillOpacity: 1,
          className: "user-marker",
        }).addTo(map);

      const rad = Math.PI / 180;
      const userLatRad = userLat * rad;
      const cosUserLat = Math.cos(userLatRad);

      locations.forEach((loc) => {
        const dLat = (loc.lat - userLat) * rad;
        const dLng = (loc.lng - userLng) * rad;
        // Công thức Haversine tối ưu, loại bỏ các phép tính thừa
        const a =
          Math.sin(dLat / 2) ** 2 +
          cosUserLat * Math.cos(loc.lat * rad) * Math.sin(dLng / 2) ** 2;
        loc._currentDistance = 12742 * Math.asin(Math.sqrt(a)); // 12742 = 2 * 6371
      });
      map.flyTo([userLat, userLng], 14, { animate: true });
      filterAndRender();
      if (currentlySelectedLocation) openDetailPanel(currentlySelectedLocation);
    },
    () => {
      icon.textContent = "location_off";
      icon.classList.remove("animate-spin");
      setTimeout(() => (icon.textContent = "my_location"), 3000);
      alert("Lỗi lấy vị trí.");
    },
    { enableHighAccuracy: true, timeout: 5000 },
  );
});

// Init Map Center check for mobile
if (window.innerWidth < 768) {
  map.setView(
    [CONFIG.center[0] - 0.05, CONFIG.center[1]],
    CONFIG.defaultZoom - 0.5,
  );
}

// Thay thế bằng các HTML entities chuẩn
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

// ==========================================
// 11. API Google Sheets (Thông tin Trụ sở)
// ==========================================
async function fetchHeadquarters() {
  try {
    const data = await fetchGoogleSheetJSONP(CONFIG.hqSheetId, CONFIG.hqSheetName);

    locations = [];

    data.table.rows.forEach((row, index) => {
      const c = row.c;
      if (!c || !c[2] || !c[2].v) return;

      const name = c[2]?.v || "";
      const typeRaw = c[3]?.v || "";
      const type = typeRaw.includes("CCCD") ? "id_center" : "police_station";
      const address = c[4]?.v || "";
      const phone = c[5]?.v || "Chưa có SĐT";
      const mapLinkOrCoords = String(c[6]?.v || "");
      const imageUrl = c[7]?.v || "";

      let lat = 21.325 + (Math.random() * 0.05); // fallback nếu không có tọa độ
      let lng = 105.365 + (Math.random() * 0.05);

      const coordsMatch = mapLinkOrCoords.match(/(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/);
      if (coordsMatch) {
        lat = parseFloat(coordsMatch[1]);
        lng = parseFloat(coordsMatch[2]);
      } else {
        const linkMatch = mapLinkOrCoords.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (linkMatch) {
          lat = parseFloat(linkMatch[1]);
          lng = parseFloat(linkMatch[2]);
        }
      }

      const loc = {
        id: index + 1,
        name,
        type,
        address,
        phone,
        imageUrl,
        lat,
        lng,
        district: address
      };

      const marker = L.marker([loc.lat, loc.lng], {
        icon: createCustomIcon(loc),
      }).addTo(layerGroup);
      loc.marker = marker;
      marker.on("click", () => openDetailPanel(loc));

      locations.push(loc);
    });

    filterAndRender();
    fetchAnnouncements(); // Load thông báo sau khi có danh sách trụ sở
  } catch (err) {
    console.warn("Google Sheets Headquarters Error: ", err.message);
  }
}

fetchHeadquarters();
```

---

## 5. data.js

```javascript
// ==========================================
// DỮ LIỆU ĐỊA ĐIỂM BẢN ĐỒ CÔNG AN & CCCD TỈNH PHÚ THỌ
// ==========================================
// Cấu trúc: id, tên, tọa độ, loại, địa chỉ, SĐT, giờ làm việc

let locations = [];
```

---

## 6. setup/apps-script.js

```javascript
/**
 * GOOGLE APPS SCRIPT - Xác thực email khi gửi thông báo
 * 
 * Script này chạy trên Google Sheets (gắn với Google Form).
 * Mỗi khi có form gửi, nó kiểm tra địa chỉ email người gửi.
 * Nếu email khớp với đơn vị → ghi vào sheet "DaXacThuc" (web app sẽ đọc sheet này).
 * Nếu sai email → bỏ qua.
 * 
 * CÁCH CÀI ĐẶT:
 * 1. Mở Google Sheet chứa response của Form
 * 2. Vào menu: Extensions → Apps Script
 * 3. Xóa code mặc định, paste toàn bộ code này vào
 * 4. Bấm nút ▶ (Run) để test, cấp quyền khi được hỏi
 * 5. Vào Triggers (⏰) → Add Trigger:
 *    - Function: onFormSubmit
 *    - Event source: From spreadsheet
 *    - Event type: On form submit
 * 6. Save
 */

function onFormSubmit(e) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Sheet chứa bảng email xác thực (ẩn, bảo vệ)
    let authSheet = ss.getSheetByName('EmailXacThuc');
    if (!authSheet) {
        // Tự tạo sheet EmailXacThuc nếu chưa có
        authSheet = ss.insertSheet('EmailXacThuc');
        authSheet.appendRow(['Đơn vị', 'Email hợp lệ (có thể nhiều email cách nhau bằng dấu phẩy)']);
        authSheet.appendRow(['Công an phường Tiên Cát', 'congan.tiencat@gmail.com, canbotiencat@gmail.com']);
        authSheet.appendRow(['Công an xã Thụy Vân', 'congan.thuyvan@gmail.com']);
        // ⚠️ THÊM CÁC ĐƠN VỊ KHÁC VÀO ĐÂY

        // Bảo vệ sheet - chỉ admin mới sửa được
        const protection = authSheet.protect();
        protection.setDescription('Bảng email xác thực - Không được chỉnh sửa');
        protection.setWarningOnly(true);

        Logger.log('✅ Đã tạo sheet EmailXacThuc. Hãy cập nhật email cho từng đơn vị!');
        return; // Lần đầu chỉ tạo sheet, không xử lý
    }

    // Sheet chứa thông báo đã xác thực (web app đọc sheet này)
    let validSheet = ss.getSheetByName('DaXacThuc');
    if (!validSheet) {
        validSheet = ss.insertSheet('DaXacThuc');
        validSheet.appendRow(['Thời gian', 'Đơn vị', 'Tiêu đề', 'Nội dung', 'Hiệu lực đến', 'Người gửi']);
        // Định dạng header
        validSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#e8eaed');
    }

    // Đọc dữ liệu từ form submit
    const responses = e.namedValues;

    // Lấy email người gửi (Form bắt buộc phải bật "Thu thập địa chỉ email")
    const emailRaw = responses['Email Address'] || responses['Địa chỉ email'] || responses['Địa chỉ Email'] || responses['Username'] || [''];
    const email = emailRaw[0].trim().toLowerCase();

    const unit = (responses['Đơn vị'] || responses['Don vi'] || [''])[0].trim();
    const title = (responses['Tiêu đề thông báo'] || responses['Tieu de thong bao'] || [''])[0].trim();
    const content = (responses['Nội dung chi tiết'] || responses['Noi dung chi tiet'] || [''])[0].trim();
    const expiresAt = (responses['Hiệu lực đến'] || responses['Hieu luc den'] || [''])[0].trim();

    if (!email || !unit || !title) {
        Logger.log('⚠️ Thiếu thông tin bắt buộc. Bạn đã bật "Thu thập địa chỉ email" trong cài đặt Form chưa?');
        return;
    }

    // Kiểm tra email xác thực
    const authData = authSheet.getDataRange().getValues();
    let isValid = false;

    for (let i = 1; i < authData.length; i++) {
        const sheetUnit = String(authData[i][0]).trim();
        const sheetEmail = String(authData[i][1]).trim().toLowerCase();

        // Hỗ trợ trường hợp 1 đơn vị có nhiều email được ủy quyền, cách nhau bằng dấu phẩy
        const allowedEmails = sheetEmail.split(',').map(e => e.trim());

        if (sheetUnit === unit && allowedEmails.includes(email)) {
            isValid = true;
            break;
        }
    }

    if (isValid) {
        // ✅ Email đúng → Ghi vào sheet DaXacThuc
        const timestamp = new Date();
        validSheet.appendRow([timestamp, unit, title, content, expiresAt, email]);
        Logger.log(`✅ Thông báo hợp lệ từ "${unit}" (Email: ${email}): ${title}`);
    } else {
        // ❌ Email sai → Ghi log và bỏ qua
        Logger.log(`❌ Email KHÔNG ĐƯỢC PHÉP cho đơn vị "${unit}". Email gửi: "${email}"`);
    }
}

/**
 * Hàm tiện ích: Xóa thông báo đã hết hiệu lực
 * Chạy thủ công hoặc đặt trigger hàng ngày
 */
function cleanupExpiredAnnouncements() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('DaXacThuc');
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    const now = new Date();
    const rowsToDelete = [];

    for (let i = data.length - 1; i >= 1; i--) {
        const expiresAt = data[i][4]; // Cột E: Hiệu lực đến
        if (expiresAt && new Date(expiresAt) < now) {
            rowsToDelete.push(i + 1); // Sheet rows are 1-indexed
        }
    }

    // Xóa từ dưới lên để không bị lệch index
    rowsToDelete.forEach(row => sheet.deleteRow(row));

    Logger.log(`🧹 Đã xóa ${rowsToDelete.length} thông báo hết hiệu lực.`);
}
```

---

## 7. setup/tao-form-thu-thap.js

```javascript
/**
 * SCRIPT TẠO FORM THU THẬP DỮ LIỆU ĐỊA ĐIỂM BẢN ĐỒ SỐ
 * 
 * Cách sử dụng:
 * 1. Mở trang: https://script.google.com/
 * 2. Chọn "Dự án mới" (New project)
 * 3. Xóa code cũ, dán toàn bộ đoạn code này vào
 * 4. Bấm "Chạy" (Run) nút Play bên trên
 * 5. Cấp quyền truy cập khi được hỏi
 * 6. Xem nhật ký (Log) để lấy Link Form vừa tạo
 */

function taoFormThuThapDuLieu() {
    // 1. Tạo Google Form mới
    const form = FormApp.create('Thông tin hiển thị Bản đồ số Công an Phú Thọ');

    // 2. Thiết lập cơ bản của Form
    form.setDescription('Cán bộ phụ trách vui lòng điền các thông tin để cập nhật lên Bản đồ số Phục vụ nhân dân. Tất cả các trường có dấu (*) là bắt buộc.')
        .setConfirmationMessage('Cảm ơn đồng chí! Thông tin đã được ghi nhận để cập nhật lên bản đồ.');

    // Thu thập email người gửi đầu vào
    form.setCollectEmail(true);

    // 3. THÊM CÁC CÂU HỎI

    const danhSachPhuong = [
        "Phường Âu Cơ", "Phường Hòa Bình", "Phường Kỳ Sơn", "Phường Nông Trang",
        "Phường Phong Châu", "Phường Phú Thọ", "Phường Phúc Yên", "Phường Tân Hòa",
        "Phường Thanh Miếu", "Phường Thống Nhất", "Phường Vân Phú", "Phường Việt Trì",
        "Phường Vĩnh Phúc", "Phường Vĩnh Yên", "Phường Xuân Hòa"
    ];

    const danhSachXa = [
        "Xã An Bình", "Xã An Nghĩa", "Xã Bản Nguyên", "Xã Bao La", "Xã Bằng Luân",
        "Xã Bình Nguyên", "Xã Bình Phú", "Xã Bình Tuyền", "Xã Bình Xuyên", "Xã Cao Dương",
        "Xã Cao Phong", "Xã Cao Sơn", "Xã Cẩm Khê", "Xã Chân Mộng", "Xã Chí Đám",
        "Xã Chí Tiên", "Xã Cự Đồng", "Xã Dân Chủ", "Xã Dũng Tiến", "Xã Đà Bắc",
        "Xã Đại Đình", "Xã Đại Đồng", "Xã Đan Thượng", "Xã Đào Xá", "Xã Đạo Trù",
        "Xã Đông Thành", "Xã Đồng Lương", "Xã Đức Nhàn", "Xã Hạ Hòa", "Xã Hải Lựu",
        "Xã Hiền Lương", "Xã Hiền Quan", "Xã Hoàng An", "Xã Hoàng Cương", "Xã Hội Thịnh",
        "Xã Hợp Kim", "Xã Hợp Lý", "Xã Hùng Việt", "Xã Hương Cần", "Xã Hy Cương",
        "Xã Khả Cửu", "Xã Kim Bôi", "Xã Lạc Lương", "Xã Lạc Sơn", "Xã Lạc Thủy",
        "Xã Lai Đồng", "Xã Lâm Thao", "Xã Lập Thạch", "Xã Liên Châu", "Xã Liên Hòa",
        "Xã Liên Minh", "Xã Liên Sơn", "Xã Long Cốc", "Xã Lương Sơn", "Xã Mai Châu",
        "Xã Mai Hạ", "Xã Minh Đài", "Xã Minh Hòa", "Xã Mường Bi", "Xã Mường Động",
        "Xã Mường Hoa", "Xã Mường Thàng", "Xã Mường Vang", "Xã Nật Sơ", "Xã Ngọc Sơn",
        "Xã Nguyệt Đức", "Xã Nhân Nghĩa", "Xã Pà Cò", "Xã Phú Khê", "Xã Phú Mỹ",
        "Xã Phù Ninh", "Xã Phùng Nguyên", "Xã Quảng Yên", "Xã Quy Đức", "Xã Quyết Thắng",
        "Xã Sơn Đông", "Xã Sơn Lương", "Xã Sông Lô", "Xã Tam Dương", "Xã Tam Dương Bắc",
        "Xã Tam Đảo", "Xã Tam Hồng", "Xã Tam Nông", "Xã Tam Sơn", "Xã Tân Lạc",
        "Xã Tân Mai", "Xã Tân Pheo", "Xã Tân Sơn", "Xã Tây Cốc", "Xã Tề Lỗ",
        "Xã Thái Hòa", "Xã Thanh Ba", "Xã Thanh Sơn", "Xã Thanh Thủy", "Xã Thịnh Minh",
        "Xã Thổ Tang", "Xã Thọ Văn", "Xã Thu Cúc", "Xã Thung Nai", "Xã Thượng Cốc",
        "Xã Thượng Long", "Xã Tiên Lương", "Xã Tiên Lữ", "Xã Toàn Thắng", "Xã Trạm Thản",
        "Xã Trung Sơn", "Xã Tu Vũ", "Xã Văn Lang", "Xã Văn Miếu", "Xã Vạn Xuân",
        "Xã Vân Bán", "Xã Vân Sơn", "Xã Vĩnh An", "Xã Vĩnh Chân", "Xã Vĩnh Hưng",
        "Xã Vĩnh Phú", "Xã Vĩnh Thành", "Xã Vĩnh Tường", "Xã Võ Miếu", "Xã Xuân Đài",
        "Xã Xuân Lãng", "Xã Xuân Lũng", "Xã Xuân Viên", "Xã Yên Kỳ", "Xã Yên Lạc",
        "Xã Yên Lãng", "Xã Yên Lập", "Xã Yên Phú", "Xã Yên Sơn", "Xã Yên Thủy",
        "Xã Yên Trị"
    ];

    const allLocations = [...danhSachPhuong, ...danhSachXa]
        .map(name => `Công an ${name}`)
        .sort((a, b) => a.localeCompare(b, 'vi'));

    // Câu 1: Tên đơn vị (Bắt buộc)
    form.addListItem()
        .setTitle('Tên Đơn vị')
        .setHelpText('Chọn tên đơn vị từ danh sách trải xuống. Nếu không có tên đơn vị của bạn, vui lòng liên hệ Admin.')
        .setChoiceValues(allLocations)
        .setRequired(true);

    // Câu 2: Loại đơn vị (Bắt buộc)
    form.addMultipleChoiceItem()
        .setTitle('Loại địa điểm')
        .setChoiceValues(['Trụ sở Công an', 'Điểm cấp Căn cước (CCCD)'])
        .setRequired(true);

    // Câu 3: Địa chỉ chi tiết (Bắt buộc)
    form.addTextItem()
        .setTitle('Địa chỉ chi tiết hiện tại')
        .setHelpText('VD: Khu 4, phường Thanh Miếu, Tỉnh Phú Thọ')
        .setRequired(true);

    // Câu 4: Số điện thoại (Bắt buộc)
    // Dùng Regex thay vì requireNumber() để giữ nguyên số 0 ở đầu
    const phoneValidation = FormApp.createTextValidation()
        .requireTextMatchesPattern('^[0-9]+$')
        .setHelpText('Chỉ được nhập các chữ số viết liền. VD: 02103846114')
        .build();

    form.addTextItem()
        .setTitle('Số điện thoại trực ban / liên hệ')
        .setHelpText('Nhập số điện thoại (có số 0 ở đầu).')
        .setRequired(true)
        .setValidation(phoneValidation);

    // Câu 6: Tọa độ Google Map
    form.addTextItem()
        .setTitle('Link vị trí trên Google Maps')
        .setHelpText('Mở điện thoại đứng trước cổng cơ quan, ghim vị trí và copy link chia sẻ dán vào đây.')
        .setRequired(true);

    // Câu 7: Link ảnh trụ sở (Google Drive)
    form.addTextItem()
        .setTitle('Hình ảnh đại diện Trụ sở / Nơi làm việc')
        .setHelpText('Tải 1 ảnh phong cảnh ngang rõ trụ sở lên Google Drive (mở quyền "Bất kỳ ai có liên kết") và dán link vào đây. Khuyến khích ảnh tỉ lệ 16:9.')
        .setRequired(false);

    // 4. In kết quả ra màn hình Log
    Logger.log('==============================================');
    Logger.log('🎉 ĐÃ TẠO FORM THÀNH CÔNG 🎉');
    Logger.log('Link để bạn chỉnh sửa (Admin):');
    Logger.log(form.getEditUrl());
    Logger.log('----------------------------------------------');
    Logger.log('Link để gửi cho công an xã (Người điền):');
    Logger.log(form.getPublishedUrl());
    Logger.log('==============================================');
}
```

---

## 8. package.json

```json
{
  "devDependencies": {
    "tailwindcss": "^3.4.19"
  },
  "name": "bandocapt",
  "version": "1.0.0",
  "description": "",
  "main": "app.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/vi-phuong-158/bandocapt.git"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "bugs": {
    "url": "https://github.com/vi-phuong-158/bandocapt/issues"
  },
  "homepage": "https://github.com/vi-phuong-158/bandocapt#readme"
}
```


