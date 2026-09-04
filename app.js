const CONFIG = {
  center: [21.325, 105.365],
  defaultZoom: 12,
};

const searchPanel = document.getElementById("search-panel");
const detailPanel = document.getElementById("detail-panel");
const mobileOverlay = document.getElementById("mobile-overlay");
const mobileSearchBtn = document.getElementById("mobile-search-btn");
const closeSearchBtn = document.getElementById("close-search-btn");

const searchInput = document.getElementById("search-input");
const resultsList = document.getElementById("results-list");

const detailTitle = document.getElementById("detail-title");
const detailBadge = document.getElementById("detail-badge");
const detailAddress = document.getElementById("detail-address");
const detailPhone = document.getElementById("detail-phone");
const detailPhoneLink = document.getElementById("detail-phone-link");
const detailHours = document.getElementById("detail-hours");
const detailHoursContainer = document.getElementById("detail-hours-container");
const detailProcedureNote = document.getElementById("detail-procedure-note");
const detailServiceMeta = document.getElementById("detail-service-meta");
const detailHero = document.getElementById("detail-hero");
const detailImage = document.getElementById("detail-image");
const detailImageButton = document.getElementById("detail-image-button");
const imageLightbox = document.getElementById("image-lightbox");
const imageLightboxImage = document.getElementById("image-lightbox-image");
const imageLightboxClose = document.getElementById("image-lightbox-close");
const actionDirections = document.getElementById("action-directions");
const actionCall = document.getElementById("action-call");
const backToListBtn = document.getElementById("back-to-list-btn");
const detailServicesList = document.getElementById("detail-services-list");
const detailServicesContainer = document.getElementById("detail-services-container");
const detailActionsGrid = document.getElementById("detail-actions-grid");


const detailDistanceBadge = document.getElementById("detail-distance-badge");
const detailDistanceText = document.getElementById("detail-distance-text");
const dragHandle = document.getElementById("drag-handle");
const previewTitle = document.getElementById("location-preview-title");
const previewAddress = document.getElementById("location-preview-address");
const previewDistance = document.getElementById("location-preview-distance");
const previewIcon = document.getElementById("location-preview-icon");
const previewDirections = document.getElementById("preview-directions");
const previewExpandBtn = document.getElementById("preview-expand-btn");
const previewCloseBtn = document.getElementById("preview-close-btn");

let userMarker = null;
let userLat = null;
let userLng = null;
let currentlySelectedLocation = null;
let previousSelectedLocation = null;
let detailTrigger = null;
let detailSuspended = false;
// Ảnh công khai đang hiển thị thật trong hero hay không. KHÔNG suy lại từ `loc.imageUrl` ở
// những chỗ khác: một URL hợp lệ vẫn có thể tải lỗi (404/mất quyền), khi đó hero đã rơi về logo.
let detailImageIsPublic = false;
let lightboxReturnFocus = null;
if (typeof window !== "undefined") window.locations = locations;

// Debounce utility
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
const debouncedFilterAndRender = debounce(filterAndRender, 250);

const SHEET_STATES = Object.freeze({
  HIDDEN: "hidden",
  COLLAPSED: "collapsed",
  EXPANDED: "expanded",
});

// R2a panel-state contract: exactly one of these three surfaces owns the screen at a time.
// `applyPanelChrome` (defined below, after setSheetState) is the only function allowed to decide
// between them — every entry point that used to hand-toggle search-panel/mobile-overlay classes
// or call setSheetState directly to open/close a surface must go through it, so a future change
// can't reintroduce the kind of divergence R1 fixed in showMobileSearch (see
// docs/brain/03-decisions.md).
const PANEL_STATES = Object.freeze({
  BROWSING: "browsing",
  DETAIL: "detail",
  MOBILE_SEARCH: "mobile-search",
});
let activePanelState = PANEL_STATES.BROWSING;

const map = L.map("map", {
  zoomControl: false,
  zoomSnap: 0.5,
  zoomDelta: 0.5,
}).setView(CONFIG.center, CONFIG.defaultZoom);
if (typeof window !== "undefined") window.map = map;

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  pane: "tilePane",
  // Bắt buộc theo ToS của OpenStreetMap — không được ẩn attribution.
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
}).addTo(map);

// Hiện tên trụ sở khi zoom đủ gần (≥ LABEL_ZOOM) để nhãn không chồng chéo.
// Toàn tỉnh (zoom thấp) chỉ thấy pin — giống Google Maps.
const LABEL_ZOOM = 14;
function updateMarkerLabels() {
  map.getContainer().classList.toggle("show-marker-labels", map.getZoom() >= LABEL_ZOOM);
}
map.on("zoomend", updateMarkerLabels);
updateMarkerLabels();

document
  .getElementById("zoom-in-btn")
  .addEventListener("click", () => map.zoomIn());
document
  .getElementById("zoom-out-btn")
  .addEventListener("click", () => map.zoomOut());

// `loc.type`/legacy service codes không đáng tin cho bản ghi tạo sau taxonomy 2026-08-31 (Gateway
// `deriveLegacyType` chỉ nhận diện mã CITIZEN_ID cũ, không nhận IDENTITY mới). Luôn quy về mã dịch
// vụ canonical qua LocationTaxonomy trước khi so sánh, để marker/filter/detail nhận đúng cả bản ghi
// cũ lẫn mới. Kết quả được cache trên chính location vì danh sách dịch vụ không đổi giữa các lần vẽ.
function canonicalServiceCodes(loc) {
  if (!loc._canonicalServices) {
    const taxonomy = window.LocationTaxonomy;
    loc._canonicalServices = (taxonomy?.toCanonicalServices?.(loc.services)) || loc.services || [];
  }
  return loc._canonicalServices;
}

function isIdentityLocation(loc) {
  return canonicalServiceCodes(loc).includes("IDENTITY");
}

// Bộ lọc dịch vụ trên bản đồ là single-select: `null` = không lọc (hiện tất cả), ngược lại chỉ giữ
// địa điểm có đúng mã dịch vụ canonical đang chọn. Cô lập vào một hàm duy nhất để nếu sau này cần
// mở rộng logic thì chỉ sửa ở đây, không lan ra marker/filter/danh sách/detail.
function matchesServiceFilter(loc, activeService) {
  if (!activeService) return true;
  return canonicalServiceCodes(loc).includes(activeService);
}

function getMarkerThumbnail(loc) {
  const imageUrl = loc?.imageUrl;
  if (imageUrl && isAllowedLocationImage(imageUrl)) {
    return {
      src: imageUrl,
      isAllowed: true,
    };
  }
  return {
    src: "assets/logo.png",
    isAllowed: false,
  };
}

function createCustomIcon(loc) {
  const isPolice = !isIdentityLocation(loc);
  const isSelected =
    currentlySelectedLocation && currentlySelectedLocation.id === loc.id;

  let wrapperClass = "marker-container";
  if (isSelected) wrapperClass += " marker-selected";
  wrapperClass += isPolice ? " marker-police" : " marker-id";

  const thumbnail = getMarkerThumbnail(loc);
  const safeName = escapeHtml(loc.name);
  const safeImgUrl = thumbnail.isAllowed ? escapeHtml(thumbnail.src) : "assets/logo.png";
  const fallbackClass = thumbnail.isAllowed ? "" : " is-fallback";

  const isMobile = isMobileViewport();
  const iconWidth = isMobile ? 90 : 104;
  const iconHeight = isMobile ? 100 : 110;
  const anchorX = Math.round(iconWidth / 2);
  const anchorY = isMobile ? 14 : 16;

  const html = `
        <div class="${wrapperClass}">
            <div class="marker-icon" aria-hidden="true">
                <div class="marker-inner">
                    <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">
                        ${isPolice ? "shield" : "badge"}
                    </span>
                </div>
            </div>
            <div class="marker-identity-card">
                <div class="marker-identity-image-wrap${fallbackClass}">
                    <img class="marker-identity-image${fallbackClass}"
                         src="${safeImgUrl}"
                         alt=""
                         loading="lazy"
                         decoding="async"
                         aria-hidden="true"
                         onerror="if(!this.dataset.errored){this.dataset.errored='1';this.src='assets/logo.png';this.classList.add('is-fallback');this.parentElement.classList.add('is-fallback');}else{this.style.display='none';}">
                </div>
                <div class="marker-identity-name marker-label" title="${safeName}">${safeName}</div>
            </div>
        </div>
    `;

  return L.divIcon({
    className: "transparent-leaflet-icon",
    html: html,
    iconSize: [iconWidth, iconHeight],
    iconAnchor: [anchorX, anchorY],
  });
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const sizeClass = count >= 30
    ? "marker-cluster-civic--large"
    : count >= 10
      ? "marker-cluster-civic--medium"
      : "marker-cluster-civic--small";

  return L.divIcon({
    className: `marker-cluster-civic ${sizeClass}`,
    html: `<div><span>${count}</span></div>`,
    iconSize: [44, 44],
  });
}

const clusterGroup = typeof L.markerClusterGroup === "function"
  ? L.markerClusterGroup({
      disableClusteringAtZoom: 14,
      maxClusterRadius: zoom => zoom <= 9 ? 60 : zoom <= 11 ? 48 : 36,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: false,
      removeOutsideVisibleBounds: true,
      animate: !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
      iconCreateFunction: createClusterIcon,
    }).addTo(map)
  : L.layerGroup().addTo(map);
const selectedLayer = L.layerGroup().addTo(map);

function removeLocationMarker(loc) {
  if (!loc?.marker) return;
  if (clusterGroup.hasLayer(loc.marker)) clusterGroup.removeLayer(loc.marker);
  if (selectedLayer.hasLayer(loc.marker)) selectedLayer.removeLayer(loc.marker);
}

function addLocationMarker(loc) {
  if (!loc?.marker || !loc._visible) return;
  removeLocationMarker(loc);
  const isSelected = currentlySelectedLocation?.id === loc.id;
  (isSelected ? selectedLayer : clusterGroup).addLayer(loc.marker);
}

// R1 state arbiter: the only function allowed to write `loc._visible`. Keeps the flag and marker
// layer membership atomic — anything that decides a location should show or hide (filterAndRender,
// initial load) must go through this, never set `loc._visible` and touch a layer separately, or
// list/marker/preview/detail can end up reading a stale mix of the two.
function setLocationVisible(loc, visible) {
  loc._visible = visible;
  if (visible) {
    addLocationMarker(loc);
  } else {
    removeLocationMarker(loc);
  }
}

function refreshLocationMarker(loc) {
  if (!loc?.marker) return;
  loc.marker.setIcon(createCustomIcon(loc));
  addLocationMarker(loc);
}

function updateAllMarkersIcon() {
  locations.forEach((loc) => {
    refreshLocationMarker(loc);
  });
}

let startY = 0;
let isDragging = false;
let activeSheetState = SHEET_STATES.HIDDEN;
let dragStartState = SHEET_STATES.HIDDEN;
let dragStartOffset = 0;
let activePointerId = null;
let overlayHideTimer = null;

function isMobileViewport() {
  return window.innerWidth < 768;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPreviewHeight() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--location-preview-height");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 164;
}

function getSheetHeight() {
  return detailPanel.getBoundingClientRect().height || window.innerHeight * 0.76;
}

function getSheetOffsets() {
  const hidden = getSheetHeight();
  return {
    [SHEET_STATES.HIDDEN]: hidden,
    [SHEET_STATES.COLLAPSED]: Math.max(0, hidden - getPreviewHeight()),
    [SHEET_STATES.EXPANDED]: 0,
  };
}

function getSheetOffset(state = activeSheetState) {
  const offsets = getSheetOffsets();
  return offsets[state] ?? offsets[SHEET_STATES.HIDDEN];
}

function applySheetTranslate(offset) {
  detailPanel.style.setProperty("--sheet-translate", `${clamp(offset, 0, getSheetHeight())}px`);
}

function getCurrentSheetOffset() {
  const inlineValue = detailPanel.style.getPropertyValue("--sheet-translate");
  const parsed = Number.parseFloat(inlineValue);
  return Number.isFinite(parsed) ? parsed : getSheetOffset();
}

function setDetailPanelAccessibility(hidden) {
  detailPanel.setAttribute("aria-hidden", hidden ? "true" : "false");
  detailPanel.toggleAttribute("inert", hidden);
}

function getFocusRestoreTarget() {
  if (detailTrigger instanceof HTMLElement && document.contains(detailTrigger)) {
    return detailTrigger;
  }
  return map.getContainer();
}

function restoreDetailFocus() {
  const target = getFocusRestoreTarget();
  detailTrigger = null;
  if (target && typeof target.focus === "function") {
    requestAnimationFrame(() => target.focus());
  }
}

function setSheetState(state, { animate = true, restoreFocus = false } = {}) {
  activeSheetState = state;
  detailPanel.dataset.sheetState = state;
  detailPanel.dataset.animate = animate ? "true" : "false";
  detailPanel.dataset.dragging = "false";
  if (isMobileViewport()) {
    applySheetTranslate(getSheetOffset(state));
  } else {
    detailPanel.style.removeProperty("--sheet-translate");
  }
  const hidden = state === SHEET_STATES.HIDDEN;
  setDetailPanelAccessibility(hidden);
  document.body.classList.toggle("location-preview-open", state === SHEET_STATES.COLLAPSED);
  document.body.classList.toggle("location-detail-expanded", state === SHEET_STATES.EXPANDED);
  if (hidden && restoreFocus) {
    restoreDetailFocus();
  }
}

function clearOverlayHideTimer() {
  if (overlayHideTimer) {
    clearTimeout(overlayHideTimer);
    overlayHideTimer = null;
  }
}

// Sole writer of the mobile search overlay's DOM chrome (search-panel translate/opacity,
// mobile-overlay backdrop, mobile-search-btn visibility). Only called from applyPanelChrome.
function setMobileSearchOverlay(open) {
  clearOverlayHideTimer();
  if (mobileSearchBtn) mobileSearchBtn.classList.toggle("hidden", open);
  searchPanel.classList.toggle("-translate-y-[120%]", !open);
  searchPanel.classList.toggle("opacity-0", !open);
  searchPanel.classList.toggle("translate-y-0", open);
  searchPanel.classList.toggle("opacity-100", open);
  if (open) {
    mobileOverlay.classList.remove("hidden");
    requestAnimationFrame(() => mobileOverlay.classList.remove("opacity-0"));
  } else {
    mobileOverlay.classList.add("opacity-0");
    overlayHideTimer = setTimeout(() => {
      mobileOverlay.classList.add("hidden");
      overlayHideTimer = null;
    }, 300);
  }
}

function syncSearchPanelAccessibility(state = activePanelState) {
  if (!searchPanel) return;
  const isMobile = isMobileViewport();
  const shouldBeInert = isMobile
    ? state !== PANEL_STATES.MOBILE_SEARCH
    : state === PANEL_STATES.DETAIL;
  searchPanel.setAttribute("aria-hidden", shouldBeInert ? "true" : "false");
  searchPanel.toggleAttribute("inert", shouldBeInert);
}

// R2a canonical panel-state writer: the only function allowed to decide which of BROWSING /
// DETAIL / MOBILE_SEARCH owns the screen. Guarantees mutual exclusion by construction — the
// mobile search overlay and the detail sheet can never both be open, because a single call here
// always fully applies exactly one state's chrome to both.
function applyPanelChrome(state, { animate = true, restoreFocus = false, sheetState } = {}) {
  activePanelState = state;
  document.body.dataset.panelState = state;
  setMobileSearchOverlay(state === PANEL_STATES.MOBILE_SEARCH);
  syncSearchPanelAccessibility(state);
  const isDetail = state === PANEL_STATES.DETAIL;
  const targetSheetState = isDetail
    ? (sheetState || (isMobileViewport() ? SHEET_STATES.COLLAPSED : SHEET_STATES.EXPANDED))
    : SHEET_STATES.HIDDEN;
  setSheetState(targetSheetState, { animate, restoreFocus });
}

function resolveSheetStateFromOffset(offset) {
  const offsets = getSheetOffsets();
  return Object.entries(offsets).reduce((nearest, [state, stateOffset]) => {
    const distance = Math.abs(offset - stateOffset);
    return distance < nearest.distance ? { state, distance } : nearest;
  }, { state: SHEET_STATES.HIDDEN, distance: Infinity }).state;
}

function endSheetDrag({ cancelled = false, restoreFocus = false } = {}) {
  if (!isDragging) return;
  isDragging = false;
  if (activePointerId != null && dragHandle.hasPointerCapture?.(activePointerId)) {
    dragHandle.releasePointerCapture(activePointerId);
  }
  const finalOffset = cancelled ? dragStartOffset : getCurrentSheetOffset();
  activePointerId = null;
  const resolvedState = cancelled ? dragStartState : resolveSheetStateFromOffset(finalOffset);
  // A drag that resolves to HIDDEN is a full dismiss, not a sheet-position tweak: it must go
  // through the same selection-lifecycle cleanup as every other close affordance (back button,
  // preview-close button, Escape), or currentlySelectedLocation/the marker's .marker-selected
  // state/activePanelState are left stale until something else happens to touch them.
  if (resolvedState === SHEET_STATES.HIDDEN) {
    closeDetailPanel({ restoreFocus });
    return;
  }
  setSheetState(resolvedState, { animate: true, restoreFocus });
}

dragHandle.addEventListener("pointerdown", (event) => {
  if (isDragging || !isMobileViewport() || activeSheetState === SHEET_STATES.HIDDEN) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  startY = event.clientY;
  dragStartState = activeSheetState;
  dragStartOffset = getCurrentSheetOffset();
  activePointerId = event.pointerId;
  isDragging = true;
  detailPanel.dataset.dragging = "true";
  detailPanel.dataset.animate = "false";
  dragHandle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

dragHandle.addEventListener("pointermove", (event) => {
  if (!isDragging || event.pointerId !== activePointerId) return;
  applySheetTranslate(dragStartOffset + event.clientY - startY);
});

dragHandle.addEventListener("pointerup", (event) => {
  if (!isDragging || event.pointerId !== activePointerId) return;
  applySheetTranslate(dragStartOffset + event.clientY - startY);
  endSheetDrag({ restoreFocus: resolveSheetStateFromOffset(getCurrentSheetOffset()) === SHEET_STATES.HIDDEN });
});

dragHandle.addEventListener("pointercancel", () => {
  endSheetDrag({ cancelled: true });
});

dragHandle.addEventListener("lostpointercapture", () => {
  if (isDragging) {
    endSheetDrag({ cancelled: true });
  }
});

function formatDistance(distance) {
  if (distance == null) return "";
  return distance < 1
    ? `${(distance * 1000).toFixed(0)} m`
    : `${distance.toFixed(1)} km`;
}

function renderLocationPreview(loc, isPolice) {
  previewTitle.textContent = loc.name;
  previewAddress.textContent = loc.address;
  previewDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
  previewIcon.classList.toggle("is-cccd", !isPolice);
  previewIcon.querySelector(".material-symbols-outlined").textContent = isPolice
    ? "local_police"
    : "badge";
  const distance = formatDistance(loc._currentDistance);
  previewDistance.textContent = distance;
  previewDistance.hidden = !distance;
}

function serviceLabel(service) {
  if (window.LocationTaxonomy?.displayService) return window.LocationTaxonomy.displayService(service);
  const labels = {
    POLICE_OFFICE: "Trụ sở Công an",
    CITIZEN_ID: "Cấp căn cước",
    E_IDENTIFICATION: "Định danh điện tử",
    RESIDENCE: "Cư trú",
    VEHICLE_REGISTRATION: "Đăng ký xe",
    DUTY: "Trực ban",
    CRIME_REPORT: "Tiếp nhận tin báo",
    OTHER: "Dịch vụ khác",
  };
  return labels[service] || service;
}

// Refactor, không phải bảng thứ hai: đúng 5 mã LocationTaxonomy.SITE_TYPES + 1 mã legacy
// CITIZEN_ID_POINT, dùng làm fallback khi lib/location-taxonomy.js chưa kịp nạp. `SERVICE_POINT`
// (mã chưa từng tồn tại trong taxonomy) đã bị xoá khỏi bảng này.
function siteTypeLabel(siteType) {
  if (window.LocationTaxonomy?.displaySiteType) return window.LocationTaxonomy.displaySiteType(siteType) || siteType;
  const labels = {
    HEADQUARTERS: "Trụ sở Công an",
    PUBLIC_SERVICE_CENTER: "Điểm tiếp nhận thủ tục hành chính",
    SECONDARY_OFFICE: "Điểm làm việc / trụ sở phụ",
    MOBILE_POINT: "Điểm tiếp nhận lưu động",
    OTHER: "Khác",
    CITIZEN_ID_POINT: "Điểm cấp căn cước (dữ liệu cũ)",
  };
  return labels[siteType] || siteType;
}

function cccdModeLabel(mode) {
  const labels = {
    ACTIVE: "Đang tiếp nhận",
    TEMPORARILY_PAUSED: "Tạm dừng tiếp nhận",
    NOT_PROVIDED: "Không cung cấp",
    UNKNOWN: "Chưa xác minh",
  };
  return labels[mode] || mode;
}

// Trình bày thuần tuý — KHÔNG đổi giá trị gốc lưu trong dữ liệu, chỉ định dạng lại lúc hiển thị.
function formatServedUnits(value) {
  return String(value || "").split("|").map(item => item.trim()).filter(Boolean).join(", ");
}

function formatVietnameseDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const pad = n => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function renderLocationServiceMeta(loc) {
  if (detailServicesContainer && detailServicesList) {
    if (loc.services?.length) {
      detailServicesContainer.hidden = false;
      detailServicesList.innerHTML = loc.services
        .map(service => `<span class="inline-flex items-center gap-1 rounded-full bg-blue-50/80 border border-blue-200/60 px-2.5 py-1 text-[12px] font-bold text-primary">${escapeHtml(serviceLabel(service))}</span>`)
        .join("");
    } else {
      detailServicesContainer.hidden = true;
      detailServicesList.innerHTML = "";
    }
  }

  if (!detailServiceMeta) return;
  const rows = [];
  if (loc.siteType) {
    rows.push(`<p class="text-[13px] leading-relaxed text-slate-600"><span class="font-semibold text-slate-700">Phân loại:</span> ${escapeHtml(siteTypeLabel(loc.siteType))}</p>`);
  }
  if (loc.cccdServiceMode && loc.cccdServiceMode !== "NOT_PROVIDED" && loc.cccdServiceMode !== "UNKNOWN") {
    rows.push(`<p class="text-[13px] leading-relaxed text-slate-600"><span class="font-semibold text-slate-700">Tiếp nhận căn cước:</span> ${escapeHtml(cccdModeLabel(loc.cccdServiceMode))}</p>`);
  }
  if (loc.servedUnits && formatServedUnits(loc.servedUnits)) {
    rows.push(`<p class="text-[13px] leading-relaxed text-slate-600"><span class="font-semibold text-slate-700">Khu vực phục vụ:</span> ${escapeHtml(formatServedUnits(loc.servedUnits))}</p>`);
  }
  if (loc.verifiedAt && formatVietnameseDate(loc.verifiedAt)) {
    rows.push(`<p class="text-[12px] leading-relaxed text-textMuted"><span class="font-medium">Ngày xác minh:</span> ${escapeHtml(formatVietnameseDate(loc.verifiedAt))}</p>`);
  }
  detailServiceMeta.innerHTML = rows.join("");
  detailServiceMeta.hidden = rows.length === 0;
}

function isAllowedLocationImage(imageUrl) {
  if (!imageUrl) return false;
  try {
    const { hostname } = new URL(imageUrl);
    return hostname.endsWith('.googleusercontent.com') ||
      hostname.endsWith('.google.com') ||
      hostname === 'drive.google.com';
  } catch {
    return false;
  }
}

// Chỉ nhận `imageUrl` — trường ảnh duy nhất đã đi qua hợp đồng công khai
// (`Published_Locations.image_url`). Ảnh chỉ được tải khi người dùng mở đúng địa điểm này,
// nên mở bản đồ không kéo theo ảnh của toàn bộ địa điểm.
function applyDetailImage(loc) {
  if (!isAllowedLocationImage(loc.imageUrl)) {
    showDetailImageFallback();
    return;
  }
  detailImageIsPublic = true;
  detailHero.hidden = false;
  detailPanel.classList.add("has-detail-image");
  detailImage.alt = `Ảnh ${loc.name}`;
  detailImage.loading = 'lazy';
  detailImage.referrerPolicy = 'no-referrer';
  detailImage.className = 'w-full h-full object-cover opacity-90 transform-gpu';
  detailImage.src = loc.imageUrl;
  detailImageButton.disabled = false;
}

function showDetailImageFallback() {
  detailImageIsPublic = false;
  detailHero.hidden = isMobileViewport();
  detailPanel.classList.remove("has-detail-image");
  detailImage.alt = 'Biểu trưng Công an nhân dân';
  detailImage.className = 'w-full h-full object-contain p-10 opacity-90 transform-gpu';
  detailImage.src = 'assets/logo.png';
  detailImageButton.disabled = true;
  closeImageLightbox();
}

// Ảnh công khai tải lỗi (404, mất quyền chia sẻ Drive, lỗi mạng): phần thông tin địa điểm phải
// giữ nguyên và rơi về logo, không để trình duyệt vẽ icon ảnh hỏng trong hero.
detailImage.addEventListener("error", () => {
  if (!detailImageIsPublic) return;
  console.warn("[location-image] Không tải được ảnh công khai của địa điểm.");
  showDetailImageFallback();
});

function openImageLightbox() {
  if (!detailImageIsPublic) return;
  // Dùng đúng URL của hero nên ảnh đã nằm trong cache trình duyệt: không phát sinh request mới.
  imageLightboxImage.src = detailImage.src;
  imageLightboxImage.alt = detailImage.alt;
  lightboxReturnFocus = document.activeElement;
  imageLightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  imageLightboxClose.focus();
}

function closeImageLightbox() {
  if (imageLightbox.hidden) return;
  imageLightbox.hidden = true;
  document.body.classList.remove("lightbox-open");
  imageLightboxImage.removeAttribute("src");
  const returnTarget = lightboxReturnFocus;
  lightboxReturnFocus = null;
  if (returnTarget && typeof returnTarget.focus === "function") returnTarget.focus();
}

detailImageButton.addEventListener("click", openImageLightbox);
imageLightboxClose.addEventListener("click", () => closeImageLightbox());
imageLightbox.addEventListener("click", event => {
  if (event.target === imageLightbox) closeImageLightbox();
});
// Overlay chỉ có đúng một control nên giữ Tab ở lại nút Đóng; Esc/nền/nút đều thoát được.
imageLightbox.addEventListener("keydown", event => {
  if (event.key !== "Tab") return;
  event.preventDefault();
  imageLightboxClose.focus();
});

function getUsablePublicPhone(phone) {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (!raw || raw === "Cập nhật sau..." || raw.toLowerCase().startsWith("cập nhật sau")) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return raw;
}

function openDetailPanel(loc, trigger = null) {
  detailTrigger = trigger;
  previousSelectedLocation = currentlySelectedLocation;
  currentlySelectedLocation = loc;
  detailSuspended = false;

  if (previousSelectedLocation && previousSelectedLocation.marker) {
    refreshLocationMarker(previousSelectedLocation);
  }
  if (currentlySelectedLocation && currentlySelectedLocation.marker) {
    refreshLocationMarker(currentlySelectedLocation);
  }

  const isPolice = !isIdentityLocation(loc);
  renderLocationPreview(loc, isPolice);

  // site_type là nguồn sự thật cho "đây là đâu" (mô tả hình thái vật lý qua taxonomy); nhánh cũ chỉ
  // còn dùng khi bản ghi legacy chưa có site_type, để không đổi hành vi các bản ghi trước 2026-08-31.
  const legacyBadgeText = loc.services?.includes("POLICE_OFFICE") && loc.services?.includes("CITIZEN_ID") ? "Trụ sở và điểm CCCD" : (isPolice ? "Trụ sở Công an" : "Điểm cấp CCCD");
  detailBadge.textContent = window.LocationTaxonomy?.displaySiteType(loc.siteType) || legacyBadgeText;
  detailBadge.className = isPolice
    ? "inline-block px-3 py-1.5 bg-primary/90 backdrop-blur-md rounded-full text-[12px] font-bold uppercase tracking-widest mb-2 border border-blue-400/20 text-blue-50 shadow-lg transform-gpu"
    : "inline-block px-3 py-1.5 bg-accent/90 backdrop-blur-md rounded-full text-[12px] font-bold uppercase tracking-widest mb-2 border border-amber-400/20 text-amber-50 shadow-lg transform-gpu";

  detailTitle.textContent = loc.name;
  detailTitle.className = "font-display text-[26px] md:text-[28px] font-bold leading-tight drop-shadow-md text-white";

  applyDetailImage(loc);

  detailAddress.textContent = loc.address;

  const usablePhone = getUsablePublicPhone(loc.phone);
  if (usablePhone) {
    detailPhone.textContent = usablePhone;
    const cleanPhone = String(usablePhone).replace(/[^\d+]/g, "");
    detailPhoneLink.href = `tel:${cleanPhone}`;
    detailPhoneLink.classList.remove("detail-action--unavailable");
    detailPhoneLink.style.display = "";
    actionCall.href = `tel:${cleanPhone}`;
    actionCall.classList.remove("detail-action--unavailable");
    actionCall.classList.remove("opacity-40", "pointer-events-none");
    actionCall.style.display = "";
    if (detailActionsGrid) {
      detailActionsGrid.classList.remove("grid-cols-1");
      detailActionsGrid.classList.add("grid-cols-2");
    }
  } else {
    detailPhone.textContent = "";
    detailPhoneLink.href = "#";
    detailPhoneLink.classList.add("detail-action--unavailable");
    actionCall.href = "#";
    actionCall.classList.add("detail-action--unavailable");
    actionCall.classList.add("opacity-40", "pointer-events-none");
    if (detailActionsGrid) {
      detailActionsGrid.classList.remove("grid-cols-2");
      detailActionsGrid.classList.add("grid-cols-1");
    }
  }

  const procedureNoteHtml =
    loc.cccdServiceMode === "TEMPORARILY_PAUSED"
      ? `<div class="text-[13px] text-amber-800 bg-amber-50 border border-amber-200/50 p-2.5 rounded-xl flex items-start gap-2 shadow-sm font-medium"><span class="material-symbols-outlined text-[18px] text-amber-600">info</span><span>Điểm cấp căn cước đang tạm dừng. Vui lòng liên hệ trước khi đến.</span></div>`
      : isIdentityLocation(loc)
      ? `<div class="text-[13px] text-amber-800 bg-amber-50 border border-amber-200/50 p-2.5 rounded-xl flex items-start gap-2 shadow-sm font-medium"><span class="material-symbols-outlined text-[18px] text-amber-600">info</span><span>Lưu ý: Mang theo CCCD/CMND cũ hoặc Giấy khai sinh khi làm thủ tục.</span></div>`
      : "";

  if (detailProcedureNote) {
    if (procedureNoteHtml) {
      detailProcedureNote.innerHTML = procedureNoteHtml;
      detailProcedureNote.hidden = false;
    } else {
      detailProcedureNote.innerHTML = "";
      detailProcedureNote.hidden = true;
    }
  }

  if (loc.serviceSchedule) {
    detailHoursContainer.style.display = "flex";
    detailHours.textContent = loc.serviceSchedule;
  } else {
    detailHoursContainer.style.display = "none";
    detailHours.textContent = "";
  }
  renderLocationServiceMeta(loc);

  if (loc._currentDistance != null) {
    detailDistanceText.textContent = formatDistance(loc._currentDistance);
    detailDistanceBadge.style.display = "inline-flex";
  } else {
    detailDistanceBadge.style.display = "none";
  }

actionDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;


applyPanelChrome(PANEL_STATES.DETAIL);
  const isMobile = isMobileViewport();
  requestAnimationFrame(() => (isMobile ? previewExpandBtn : backToListBtn).focus());

if (isMobile) {
    map.flyTo([loc.lat, loc.lng], 15.5, {
      animate: true,
      duration: 0.8,
    });
    map.once("moveend", () => {
      map.panInside([loc.lat, loc.lng], {
        paddingTopLeft: [16, 88],
        paddingBottomRight: [16, getPreviewHeight() + 80],
      });
    });
  } else {
    map.flyTo([loc.lat, loc.lng], 15.5, {
      animate: true,
      duration: 0.8,
    });
  }
}

function closeDetailPanel({ restoreFocus = true } = {}) {
  if (isDragging) {
    endSheetDrag({ cancelled: true });
  }
  closeImageLightbox();
  previousSelectedLocation = currentlySelectedLocation;
  currentlySelectedLocation = null;
  detailSuspended = false;

if (previousSelectedLocation && previousSelectedLocation.marker) {
    refreshLocationMarker(previousSelectedLocation);
  }
  applyPanelChrome(PANEL_STATES.BROWSING, { restoreFocus });
}

backToListBtn.addEventListener("click", () => {
  closeDetailPanel();
});

previewCloseBtn.addEventListener("click", () => closeDetailPanel());
previewExpandBtn.addEventListener("click", () => {
  setSheetState(SHEET_STATES.EXPANDED);
  requestAnimationFrame(() => detailPhoneLink.focus());
});

// Bộ lọc dịch vụ trên bản đồ (single-select, xem `matchesServiceFilter`): `null` = không chip nào
// active = hiện tất cả. State là một scalar đơn giản, không phải mảng/checkbox tổ hợp.
let activeServiceFilter = null;

function getServicesSearchText(loc) {
  if (loc._servicesSearchTextLower !== undefined) return loc._servicesSearchTextLower;
  const codes = canonicalServiceCodes(loc);
  const labels = codes.map(code => serviceLabel(code).toLowerCase());
  loc._servicesSearchTextLower = labels.join(" ");
  return loc._servicesSearchTextLower;
}

function filterAndRender() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const visibleLocations = [];

  locations.forEach((loc) => {
    const matchesFilter = matchesServiceFilter(loc, activeServiceFilter);
    const matchesSearch =
      !searchTerm ||
      (loc._nameLower || loc.name.toLowerCase()).includes(searchTerm) ||
      (loc._addressLower || loc.address.toLowerCase()).includes(searchTerm) ||
      (loc._aliasesLower || "").includes(searchTerm) ||
      (loc._servedUnitsLower || "").includes(searchTerm) ||
      getServicesSearchText(loc).includes(searchTerm);

    if (matchesFilter && matchesSearch) {
      setLocationVisible(loc, true);
      visibleLocations.push(loc);
    } else {
      setLocationVisible(loc, false);
    }
  });

if (userLat != null) {
    visibleLocations.sort(
      (a, b) =>
        (a._currentDistance || Infinity) - (b._currentDistance || Infinity),
    );
  }

  if (currentlySelectedLocation && !currentlySelectedLocation._visible) {
    closeDetailPanel({ restoreFocus: false });
  }

renderResultsList(visibleLocations);
}

function renderResultsList(results) {
  resultsList.setAttribute("aria-busy", "false");
  resultsList.setAttribute("aria-label", `${results.length} kết quả tìm kiếm`);
  if (results.length === 0) {
    resultsList.innerHTML = `<li class="empty-state">
            <span class="material-symbols-outlined">travel_explore</span>
            <p>Không tìm thấy kết quả</p>
        </li>`;
    return;
  }

resultsList.innerHTML = results
    .map((loc) => {
      const isPolice = !isIdentityLocation(loc);
      const distStr =
        loc._currentDistance != null
          ? loc._currentDistance < 1
            ? `${(loc._currentDistance * 1000).toFixed(0)}m`
            : `${loc._currentDistance.toFixed(1)}km`
          : "";

const iconHTML = isPolice
        ? `<img src="assets/logo.png" alt="" aria-hidden="true" style="width:40px;height:40px;object-fit:contain;">`
        : `<span class="material-symbols-outlined" style="font-size:22px;font-variation-settings:'FILL' 1;">badge</span>`;
      const iconClass = isPolice ? "result-icon-box--plain" : "bg-id";

      return `
          <li class="result-list-item">
            <button type="button" class="result-item" data-id="${escapeHtml(loc.id)}" aria-label="Xem ${escapeHtml(loc.name)}, ${escapeHtml(loc.address)}">
                <div class="result-icon-box ${iconClass} flex items-center justify-center">
                    ${iconHTML}
                </div>
                <div class="result-content">
                    <h3 class="result-title">${escapeHtml(loc.name)}</h3>
                    <p class="result-address">${escapeHtml(loc.address)}</p>
                </div>
                ${distStr ? `<div class="result-dist"><span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1;">near_me</span>${distStr}</div>` : ""}
            </button>
          </li>
        `;
    })
    .join("");

}

// Event delegation: 1 listener thay vì N listeners
resultsList.addEventListener("click", (e) => {
  const retry = e.target.closest(".data-retry-btn");
  if (retry) {
    fetchHeadquarters();
    return;
  }
  const item = e.target.closest(".result-item");
  if (!item) return;
  const loc = locations.find((l) => String(l.id) === item.dataset.id);
  if (loc) openDetailPanel(loc, item);
});

// Arrow key navigation trong danh sách kết quả
resultsList.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const items = Array.from(resultsList.querySelectorAll(".result-item:not([disabled])"));
  if (items.length === 0) return;
  const current = items.indexOf(document.activeElement);
  if (current === -1) return;
  e.preventDefault();
  const next = e.key === "ArrowDown"
    ? Math.min(current + 1, items.length - 1)
    : Math.max(current - 1, 0);
  items[next].focus();
});

searchInput.addEventListener("input", debouncedFilterAndRender);

// Bốn chip chính lấy nguyên trạng trong HTML; phần mở rộng ("+N dịch vụ khác") được sinh từ
// LocationTaxonomy để không hard-code trùng danh sách dịch vụ ở hai nơi và tự đúng khi taxonomy đổi.
const PRIMARY_SERVICE_CODES = ["IDENTITY", "RESIDENCE", "VEHICLE_REGISTRATION", "IMMIGRATION"];
const SERVICE_CHIP_ICONS = {
  IDENTITY: "badge", RESIDENCE: "home", VEHICLE_REGISTRATION: "directions_car",
  DRIVER_LICENSE: "credit_card", IMMIGRATION: "flight", CRIMINAL_RECORD: "gavel",
  FIRE_SAFETY: "local_fire_department", SECURITY_ORDER: "shield_moon",
  CITIZEN_RECEPTION: "groups", OTHER: "more_horiz",
};
const serviceFilterGroup = document.getElementById("service-filter-group");
const serviceFilterExpandBtn = document.getElementById("service-filter-expand-btn");
const serviceFilterExpandLabel = document.getElementById("service-filter-expand-label");
const serviceFilterMore = document.getElementById("service-filter-more");

function extraServicesLabel(count) {
  return `+ ${count} dịch vụ khác`;
}

function renderExpandedServiceChips() {
  const taxonomy = window.LocationTaxonomy;
  if (!serviceFilterMore || !taxonomy) return;
  const extra = taxonomy.SERVICES.filter(item => !PRIMARY_SERVICE_CODES.includes(item.code));
  serviceFilterMore.innerHTML = extra.map(item => `
    <button type="button" class="service-chip group flex items-center gap-1.5 py-2 px-3 bg-transparent hover:bg-white/50 rounded-full border border-slate-200/80 transition-all aria-pressed:bg-white aria-pressed:border-primary/40 aria-pressed:shadow-sm" data-service="${item.code}" aria-pressed="false">
      <span class="material-symbols-outlined text-[18px] text-slate-400 group-aria-pressed:text-primary transition-colors" style="font-variation-settings: 'FILL' 1;">${SERVICE_CHIP_ICONS[item.code] || "more_horiz"}</span>
      <span class="text-[12px] font-bold text-slate-500 group-aria-pressed:text-primary transition-colors whitespace-nowrap">${escapeHtml(item.label)}</span>
    </button>
  `).join("");
  if (serviceFilterExpandLabel) serviceFilterExpandLabel.textContent = extraServicesLabel(extra.length);
}

function setActiveServiceFilter(code) {
  activeServiceFilter = activeServiceFilter === code ? null : code;
  document.querySelectorAll(".service-chip[data-service]").forEach(btn => {
    btn.setAttribute("aria-pressed", String(btn.dataset.service === activeServiceFilter));
  });
  filterAndRender();
}

function toggleServiceExpand() {
  if (!serviceFilterMore || !serviceFilterExpandBtn) return;
  const wasExpanded = serviceFilterExpandBtn.getAttribute("aria-expanded") === "true";
  serviceFilterExpandBtn.setAttribute("aria-expanded", String(!wasExpanded));
  serviceFilterMore.hidden = wasExpanded;
  if (serviceFilterExpandLabel) {
    serviceFilterExpandLabel.textContent = wasExpanded
      ? extraServicesLabel(serviceFilterMore.querySelectorAll(".service-chip").length)
      : "Thu gọn";
  }
}

if (serviceFilterGroup) {
  serviceFilterGroup.addEventListener("click", (e) => {
    if (e.target.closest("#service-filter-expand-btn")) { toggleServiceExpand(); return; }
    const chip = e.target.closest(".service-chip[data-service]");
    if (chip) setActiveServiceFilter(chip.dataset.service);
  });
}
renderExpandedServiceChips();

function showMobileSearch() {
  if (activeSheetState !== SHEET_STATES.HIDDEN) {
    previousSelectedLocation = currentlySelectedLocation;
    currentlySelectedLocation = null;
    if (previousSelectedLocation?.marker) {
      // Not just an icon swap: deselecting must also move the marker back out of `selectedLayer`
      // (see setLocationVisible / refreshLocationMarker), or it stays exempt from clustering.
      refreshLocationMarker(previousSelectedLocation);
    }
    detailTrigger = null;
  }
  applyPanelChrome(PANEL_STATES.MOBILE_SEARCH, { restoreFocus: false });
  requestAnimationFrame(() => searchInput.focus());
}

function hideMobileSearch({ restoreFocus = true } = {}) {
  applyPanelChrome(PANEL_STATES.BROWSING, { restoreFocus: false });
  if (restoreFocus && isMobileViewport()) {
    requestAnimationFrame(() => mobileSearchBtn.focus());
  }
}

mobileSearchBtn.addEventListener("click", showMobileSearch);
closeSearchBtn.addEventListener("click", hideMobileSearch);
mobileOverlay.addEventListener("click", hideMobileSearch);

async function fetchSheetData(sheetName) {
  const response = await fetch(`/api/google-sheet?sheet=${encodeURIComponent(sheetName)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`SHEET_API_${response.status}`);
  return response.json();
}


function requestUserLocation(onSuccessCallback, onErrorCallback) {
  if (!navigator.geolocation) {
    alert("Trình duyệt không hỗ trợ định vị.");
    if (onErrorCallback) onErrorCallback();
    return;
  }

navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;

if (userMarker) {
        userMarker.setLatLng([userLat, userLng]);
      } else {
        userMarker = L.circleMarker([userLat, userLng], {
          radius: 9,
          fillColor: "#3B82F6",
          color: "#fff",
          weight: 3,
          opacity: 1,
          fillOpacity: 1,
          className: "user-marker",
        }).addTo(map);
      }

const rad = Math.PI / 180;
      const userLatRad = userLat * rad;
      const cosUserLat = Math.cos(userLatRad);

locations.forEach((loc) => {
        const dLat = (loc.lat - userLat) * rad;
        const dLng = (loc.lng - userLng) * rad;
        const a =
          Math.sin(dLat / 2) ** 2 +
          cosUserLat * Math.cos(loc.lat * rad) * Math.sin(dLng / 2) ** 2;
        loc._currentDistance = 12742 * Math.asin(Math.sqrt(a));
      });

if (onSuccessCallback) onSuccessCallback();
    },
    (err) => {
      console.warn("Geolocation error:", err.message);
      alert("Không thể lấy vị trí. Vui lòng kiểm tra quyền truy cập GPS.");
      if (onErrorCallback) onErrorCallback();
    },
    { enableHighAccuracy: true, timeout: 8000 },
  );
}

// "Gần tôi" là action, không phải taxonomy filter: chỉ sắp xếp/canh bản đồ trong đúng tập đang
// hiển thị (đã qua tìm kiếm + bộ lọc dịch vụ), không bao giờ ẩn hay gỡ marker nào khỏi bản đồ.
function centerOnNearestVisible() {
  if (userLat == null || userLng == null) return;
  const nearest = locations
    .filter(loc => loc._visible && loc.lat != null && loc.lng != null)
    .sort((a, b) => (a._currentDistance ?? Infinity) - (b._currentDistance ?? Infinity))[0];
  if (!nearest) {
    map.flyTo([userLat, userLng], 14, { animate: true });
    alert("Không có địa điểm phù hợp gần bạn.");
    return;
  }
  map.fitBounds(L.latLngBounds([[userLat, userLng], [nearest.lat, nearest.lng]]), { padding: [56, 56], maxZoom: 15 });
}

document.getElementById("find-location-btn").addEventListener("click", () => {
  const icon = document.getElementById("location-icon");
  icon.textContent = "progress_activity";
  icon.classList.add("animate-spin");

requestUserLocation(
    function () {
      icon.textContent = "my_location";
      icon.classList.remove("animate-spin");
      // Bước 2-3 (áp filter/search hiện có + sắp xếp gần->xa) rồi mới canh bản đồ (bước 4), đúng thứ
      // tự "Filter dịch vụ trước -> Gần tôi xử lý trong tập kết quả đó".
      filterAndRender();
      centerOnNearestVisible();
      if (currentlySelectedLocation) openDetailPanel(currentlySelectedLocation);
    },
    function () {
      icon.textContent = "location_off";
      icon.classList.remove("animate-spin");
      setTimeout(() => (icon.textContent = "my_location"), 3000);
    }
  );
});

if (window.innerWidth < 768) {
  map.setView(
    [CONFIG.center[0] - 0.05, CONFIG.center[1]],
    CONFIG.defaultZoom - 0.5,
  );
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .split('/').join('&#x2F;');
}

/**
 * Converts a Google Drive URL to a direct view link.
 * @param {string} url - The URL to convert.
 * @returns {string} The direct view URL or the original URL.
 */
function convertGoogleDriveUrl(url) {
  if (!url) return "";
  
  // Tự động tìm và tách mã ID của file ảnh
  const idMatch = url.match(/[-\w]{25,}/);
  
  if (idMatch && idMatch[0]) {
    // Dùng đường dẫn thumbnail, sz=w1000 để ảnh rộng 1000px, rõ nét và không bị Google chặn
    return `https://drive.google.com/thumbnail?id=${idMatch[0]}&sz=w1000`;
  }
  
  return url;
}

async function fetchHeadquarters() {
  resultsList.setAttribute("aria-busy", "true");
  resultsList.innerHTML = '<li class="loading-state" role="status">Đang tải dữ liệu...</li>';
  try {
    const data = await fetchSheetData("Published_Locations");

clusterGroup.clearLayers();
    selectedLayer.clearLayers();
    locations = [];

    const normalized = window.LocationData.normalizePublishedLocations(data);
    normalized.rejected.forEach(item => {
      console.warn(`[data-quality] Row ${item.row}: ${item.error}${item.name ? ` (${item.name})` : ''}`);
    });

normalized.locations.forEach((item) => {
const name = item.name;
      const type = item.type;
      const address = item.address;
      const phone = item.phone || "Chưa có SĐT";
      const rawImageUrl = item.imageUrl;
      const imageUrl = convertGoogleDriveUrl(rawImageUrl) || rawImageUrl;

const loc = {
        id: item.id,
        name,
        type,
        address,
        phone,
        imageUrl,
        lat: item.lat,
        lng: item.lng,
        updatedAt: item.updatedAt,
        siteType: item.siteType,
        services: item.services,
        googleMapsUrl: item.googleMapsUrl,
        cccdServiceMode: item.cccdServiceMode,
        serviceSchedule: item.serviceSchedule,
        servedUnits: item.servedUnits,
        status: item.status,
        verifiedAt: item.verifiedAt,
        district: address,
        _nameLower: name.toLowerCase(),
        _addressLower: address.toLowerCase(),
        _aliasesLower: (item.searchAliases || "").toLowerCase(),
        _servedUnitsLower: (item.servedUnits || "").toLowerCase(),
      };

const marker = L.marker([loc.lat, loc.lng], {
        icon: createCustomIcon(loc),
      });
      loc.marker = marker;
      setLocationVisible(loc, true);
      marker.on("click", () => openDetailPanel(loc));

      locations.push(loc);
    });

    if (typeof window !== "undefined") {
      window.locations = locations;
    }

    filterAndRender();

} catch (err) {
    console.warn("Google Sheets Headquarters Error: ", err.message);
    resultsList.setAttribute("aria-busy", "false");
    resultsList.innerHTML = `<li class="error-state" role="alert">
      <p>Không thể tải dữ liệu địa điểm.</p>
      <button type="button" class="data-retry-btn">Thử lại</button>
    </li>`;
  }
}

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  // Lightbox nằm trên cùng: Esc đóng ảnh trước, không đóng luôn phần thông tin phía dưới.
  if (!imageLightbox.hidden) {
    closeImageLightbox();
  } else if (activeSheetState !== SHEET_STATES.HIDDEN) {
    closeDetailPanel();
  } else if (activePanelState === PANEL_STATES.MOBILE_SEARCH) {
    hideMobileSearch();
  }
});

let lastViewportIsMobile = isMobileViewport();

function syncPanelsToViewport() {
  if (isDragging) {
    endSheetDrag({ cancelled: true });
  }
  const currentIsMobile = isMobileViewport();
  if (currentIsMobile !== lastViewportIsMobile) {
    lastViewportIsMobile = currentIsMobile;
    updateAllMarkersIcon();
  }
  syncSearchPanelAccessibility(activePanelState);
  if (activeSheetState === SHEET_STATES.HIDDEN) {
    setSheetState(SHEET_STATES.HIDDEN, { animate: false });
    return;
  }
  if (currentlySelectedLocation) {
    detailHero.hidden = isMobileViewport() && !detailImageIsPublic;
    detailPanel.classList.toggle("has-detail-image", detailImageIsPublic);
  }
  setSheetState(
    isMobileViewport() ? SHEET_STATES.COLLAPSED : SHEET_STATES.EXPANDED,
    { animate: false },
  );
}

function suspendDetailSelection() {
  if (currentlySelectedLocation && activeSheetState !== SHEET_STATES.HIDDEN) {
    detailSuspended = true;
  }
  applyPanelChrome(PANEL_STATES.BROWSING, { animate: false, restoreFocus: false });
}

function resumeDetailSelection() {
  if (!detailSuspended || !currentlySelectedLocation || !isMobileViewport()) return;
  detailSuspended = false;
  applyPanelChrome(PANEL_STATES.DETAIL, { sheetState: SHEET_STATES.COLLAPSED });
  refreshLocationMarker(currentlySelectedLocation);
}

window.AppNavigation?.registerSurface("map", {
  activate: resumeDetailSelection,
  deactivate: suspendDetailSelection,
});

window.addEventListener("resize", debounce(syncPanelsToViewport, 120));
window.addEventListener("orientationchange", syncPanelsToViewport);

applyPanelChrome(PANEL_STATES.BROWSING, { animate: false, restoreFocus: false });

fetchHeadquarters();
