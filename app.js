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
const detailImage = document.getElementById("detail-image");
const actionDirections = document.getElementById("action-directions");
const actionCall = document.getElementById("action-call");
const backToListBtn = document.getElementById("back-to-list-btn");


const detailDistanceBadge = document.getElementById("detail-distance-badge");
const detailDistanceText = document.getElementById("detail-distance-text");
const dragHandle = document.getElementById("drag-handle");

let userMarker = null;
let userLat = null;
let userLng = null;
let currentlySelectedLocation = null;
let previousSelectedLocation = null;
let detailTrigger = null;

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

const MOBILE_SHEET_TRANSLATES = Object.freeze({
  [SHEET_STATES.HIDDEN]: 100,
  [SHEET_STATES.COLLAPSED]: 50,
  [SHEET_STATES.EXPANDED]: 0,
});

const map = L.map("map", {
  zoomControl: false,
  zoomSnap: 0.5,
  zoomDelta: 0.5,
}).setView(CONFIG.center, CONFIG.defaultZoom);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  pane: "tilePane",
  // Bắt buộc theo ToS của OpenStreetMap — không được ẩn attribution.
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
}).addTo(map);

// Hiện tên trụ sở khi zoom đủ gần (≥ LABEL_ZOOM) để nhãn không chồng chéo.
// Toàn tỉnh (zoom thấp) chỉ thấy pin — giống Google Maps.
const LABEL_ZOOM = 13;
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

function createCustomIcon(loc) {
  const isPolice = loc.type === "police_station";
  const isSelected =
    currentlySelectedLocation && currentlySelectedLocation.id === loc.id;

let wrapperClass = "marker-container";
  if (isSelected) wrapperClass += " marker-selected";
  wrapperClass += isPolice ? " marker-police" : " marker-id";

  let iconClass = "marker-icon";

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

let startY = 0;
let isDragging = false;
let activeSheetState = SHEET_STATES.HIDDEN;
let dragStartState = SHEET_STATES.HIDDEN;
let dragStartPercent = MOBILE_SHEET_TRANSLATES[SHEET_STATES.HIDDEN];
let activePointerId = null;
let overlayHideTimer = null;

function isMobileViewport() {
  return window.innerWidth < 768;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getSheetTranslatePercent(state = activeSheetState) {
  return MOBILE_SHEET_TRANSLATES[state] ?? MOBILE_SHEET_TRANSLATES[SHEET_STATES.HIDDEN];
}

function applySheetTranslate(percent) {
  detailPanel.style.setProperty("--sheet-translate", `${clamp(percent, 0, 100)}%`);
}

function getCurrentSheetPercent() {
  const inlineValue = detailPanel.style.getPropertyValue("--sheet-translate");
  const parsed = Number.parseFloat(inlineValue);
  return Number.isFinite(parsed) ? parsed : getSheetTranslatePercent();
}

function setDetailPanelAccessibility(hidden) {
  detailPanel.setAttribute("aria-hidden", hidden ? "true" : "false");
  detailPanel.setAttribute("aria-modal", hidden ? "false" : "true");
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
    applySheetTranslate(getSheetTranslatePercent(state));
  } else {
    detailPanel.style.removeProperty("--sheet-translate");
  }
  const hidden = state === SHEET_STATES.HIDDEN;
  setDetailPanelAccessibility(hidden);
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

function resolveSheetStateFromPercent(percent, startState = dragStartState) {
  if (percent <= 20) return SHEET_STATES.EXPANDED;
  if (percent <= 70) return SHEET_STATES.COLLAPSED;
  if (startState === SHEET_STATES.EXPANDED && percent < 85) {
    return SHEET_STATES.COLLAPSED;
  }
  return SHEET_STATES.HIDDEN;
}

function endSheetDrag({ cancelled = false, restoreFocus = false } = {}) {
  if (!isDragging) return;
  isDragging = false;
  if (activePointerId != null && dragHandle.hasPointerCapture?.(activePointerId)) {
    dragHandle.releasePointerCapture(activePointerId);
  }
  const finalPercent = cancelled ? dragStartPercent : getCurrentSheetPercent();
  activePointerId = null;
  setSheetState(
    cancelled ? dragStartState : resolveSheetStateFromPercent(finalPercent),
    { animate: true, restoreFocus },
  );
}

dragHandle.addEventListener("pointerdown", (event) => {
  if (!isMobileViewport() || activeSheetState === SHEET_STATES.HIDDEN) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  startY = event.clientY;
  dragStartState = activeSheetState;
  dragStartPercent = getCurrentSheetPercent();
  activePointerId = event.pointerId;
  isDragging = true;
  detailPanel.dataset.dragging = "true";
  detailPanel.dataset.animate = "false";
  dragHandle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

dragHandle.addEventListener("pointermove", (event) => {
  if (!isDragging || event.pointerId !== activePointerId) return;
  const deltaPercent = ((event.clientY - startY) / window.innerHeight) * 100;
  applySheetTranslate(dragStartPercent + deltaPercent);
});

dragHandle.addEventListener("pointerup", (event) => {
  if (!isDragging || event.pointerId !== activePointerId) return;
  endSheetDrag({ restoreFocus: resolveSheetStateFromPercent(getCurrentSheetPercent()) === SHEET_STATES.HIDDEN });
});

dragHandle.addEventListener("pointercancel", () => {
  endSheetDrag({ cancelled: true });
});

dragHandle.addEventListener("lostpointercapture", () => {
  if (isDragging) {
    endSheetDrag({ cancelled: true });
  }
});

function openDetailPanel(loc, trigger = null) {
  detailTrigger = trigger;
  previousSelectedLocation = currentlySelectedLocation;
  currentlySelectedLocation = loc;

if (previousSelectedLocation && previousSelectedLocation.marker) {
    previousSelectedLocation.marker.setIcon(createCustomIcon(previousSelectedLocation));
  }
  if (currentlySelectedLocation && currentlySelectedLocation.marker) {
    currentlySelectedLocation.marker.setIcon(createCustomIcon(currentlySelectedLocation));
  }

const isPolice = loc.type === "police_station";

detailBadge.textContent = isPolice ? "Trụ sở Công an" : "Điểm cấp CCCD";
  detailBadge.className = isPolice
    ? "inline-block px-3 py-1.5 bg-primary/90 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest mb-2 border border-blue-400/20 text-blue-50 shadow-lg transform-gpu"
    : "inline-block px-3 py-1.5 bg-accent/90 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest mb-2 border border-amber-400/20 text-amber-50 shadow-lg transform-gpu";

detailTitle.textContent = loc.name;
  detailTitle.className = "font-display text-[26px] md:text-[28px] font-bold leading-tight drop-shadow-md text-white";

  const isAllowedImage = loc.imageUrl && (() => {
    try {
      const { hostname } = new URL(loc.imageUrl);
      return hostname.endsWith('.googleusercontent.com') ||
             hostname.endsWith('.google.com') ||
             hostname === 'drive.google.com' ||
             hostname === 'ui-avatars.com';
    } catch { return false; }
  })();
  if (isAllowedImage) {
    detailImage.src = loc.imageUrl;
    detailImage.alt = 'Ảnh trụ sở';
    detailImage.loading = 'lazy';
    detailImage.referrerPolicy = 'no-referrer';
    detailImage.className = 'w-full h-full object-cover opacity-90 transform-gpu';
  } else {

detailImage.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(loc.name)}&background=random`;
    detailImage.alt = 'Ảnh trụ sở';
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

const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5; 
  const isMorning = currentHour >= 7.5 && currentHour <= 11.5;
  const isAfternoon = currentHour >= 13 && currentHour <= 16.5;

let statusText = "Đã nghỉ làm";
  let statusColor = "text-danger"; 

if (isWeekday && (isMorning || isAfternoon)) {
    statusText = "Đang mở cửa";
    statusColor = "text-secondary font-bold animate-pulse"; 
  }

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

actionDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;


hideMobileSearch({ restoreFocus: false });
  const isMobile = isMobileViewport();
  setSheetState(isMobile ? SHEET_STATES.COLLAPSED : SHEET_STATES.EXPANDED);
  requestAnimationFrame(() => backToListBtn.focus());

if (isMobile) {

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
  if (isDragging) {
    endSheetDrag({ cancelled: true });
  }
  previousSelectedLocation = currentlySelectedLocation;
  currentlySelectedLocation = null;

if (previousSelectedLocation && previousSelectedLocation.marker) {
    previousSelectedLocation.marker.setIcon(createCustomIcon(previousSelectedLocation));
  }
  setSheetState(SHEET_STATES.HIDDEN, { restoreFocus: true });
}

backToListBtn.addEventListener("click", () => {
  closeDetailPanel();
});

function getActiveFilters() {
  return {
    showPolice: document.getElementById("filter-police").checked,
    showId: document.getElementById("filter-id").checked,
    showNearby: document.getElementById("filter-nearby").checked,
  };
}

function filterAndRender() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const { showPolice, showId, showNearby } = getActiveFilters();
  const nearbySpinner = document.getElementById('nearby-spinner');

if (showNearby && userLat == null) {
    if (nearbySpinner) {
      nearbySpinner.textContent = 'progress_activity';
      nearbySpinner.classList.add('animate-spin');
    }
    requestUserLocation(
      function () {
        if (nearbySpinner) {
          nearbySpinner.textContent = 'near_me';
          nearbySpinner.classList.remove('animate-spin');
        }
        filterAndRender();
      },
      function () {
        if (nearbySpinner) {
          nearbySpinner.textContent = 'near_me';
          nearbySpinner.classList.remove('animate-spin');
        }

document.getElementById('filter-nearby').checked = false;
        filterAndRender();
      }
    );
    return;
  }

if (!showNearby && nearbySpinner) {
    nearbySpinner.textContent = 'near_me';
    nearbySpinner.classList.remove('animate-spin');
  }

let visibleLocations = [];

locations.forEach((loc) => {
    const isPolice = loc.type === "police_station";
    const matchesFilter = (isPolice && showPolice) || (!isPolice && showId);
    const matchesSearch =
      (loc._nameLower || loc.name.toLowerCase()).includes(searchTerm) ||
      (loc._addressLower || loc.address.toLowerCase()).includes(searchTerm);

if (matchesFilter && matchesSearch) {
      if (!layerGroup.hasLayer(loc.marker)) layerGroup.addLayer(loc.marker);
      visibleLocations.push(loc);
    } else {
      if (layerGroup.hasLayer(loc.marker)) layerGroup.removeLayer(loc.marker);
    }
  });

if (userLat != null) {
    visibleLocations.sort(
      (a, b) =>
        (a._currentDistance || Infinity) - (b._currentDistance || Infinity),
    );
  }

if (showNearby && userLat != null) {

visibleLocations.slice(5).forEach((loc) => {
      if (loc.marker && layerGroup.hasLayer(loc.marker)) layerGroup.removeLayer(loc.marker);
    });
    visibleLocations = visibleLocations.slice(0, 5);

if (visibleLocations.length > 0) {
      const boundsCoords = [[userLat, userLng]];
      visibleLocations.forEach((loc) => {
        if (loc.lat != null && loc.lng != null) {
          boundsCoords.push([loc.lat, loc.lng]);
        }
      });
      if (boundsCoords.length > 1) {
        const bounds = L.latLngBounds(boundsCoords);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    }
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
      const isPolice = loc.type === "police_station";
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
document
  .getElementById("filter-police")
  .addEventListener("change", filterAndRender);
document
  .getElementById("filter-id")
  .addEventListener("change", filterAndRender);
document
  .getElementById("filter-nearby")
  .addEventListener("change", filterAndRender);

function showMobileSearch() {
  clearOverlayHideTimer();
  if (activeSheetState !== SHEET_STATES.HIDDEN) {
    previousSelectedLocation = currentlySelectedLocation;
    currentlySelectedLocation = null;
    if (previousSelectedLocation?.marker) {
      previousSelectedLocation.marker.setIcon(createCustomIcon(previousSelectedLocation));
    }
    detailTrigger = null;
    setSheetState(SHEET_STATES.HIDDEN, { restoreFocus: false });
  }
  searchPanel.classList.remove("-translate-y-[120%]", "opacity-0");
  searchPanel.classList.add("translate-y-0", "opacity-100");
  mobileOverlay.classList.remove("hidden");
  requestAnimationFrame(() => mobileOverlay.classList.remove("opacity-0"));
  requestAnimationFrame(() => searchInput.focus());
}

function hideMobileSearch({ restoreFocus = true } = {}) {
  clearOverlayHideTimer();
  searchPanel.classList.remove("translate-y-0", "opacity-100");
  searchPanel.classList.add("-translate-y-[120%]", "opacity-0");
  mobileOverlay.classList.add("opacity-0");
  overlayHideTimer = setTimeout(() => {
    mobileOverlay.classList.add("hidden");
    overlayHideTimer = null;
  }, 300);
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

document.getElementById("find-location-btn").addEventListener("click", () => {
  const icon = document.getElementById("location-icon");
  icon.textContent = "progress_activity";
  icon.classList.add("animate-spin");

requestUserLocation(
    function () {
      icon.textContent = "my_location";
      icon.classList.remove("animate-spin");
      map.flyTo([userLat, userLng], 14, { animate: true });
      filterAndRender();
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

layerGroup.clearLayers();
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
        district: address,
        _nameLower: name.toLowerCase(),
        _addressLower: address.toLowerCase(),
      };

const marker = L.marker([loc.lat, loc.lng], {
        icon: createCustomIcon(loc),
      }).addTo(layerGroup);
      loc.marker = marker;
      marker.on("click", () => openDetailPanel(loc));

locations.push(loc);
    });

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
  if (activeSheetState !== SHEET_STATES.HIDDEN) {
    closeDetailPanel();
  } else if (closeSearchBtn.offsetParent !== null) {
    // Mobile search panel đang mở (close button hiển thị)
    hideMobileSearch();
  }
});

function syncPanelsToViewport() {
  if (isDragging) {
    endSheetDrag({ cancelled: true });
  }
  if (activeSheetState === SHEET_STATES.HIDDEN) {
    setSheetState(SHEET_STATES.HIDDEN, { animate: false });
    return;
  }
  setSheetState(
    isMobileViewport() ? SHEET_STATES.COLLAPSED : SHEET_STATES.EXPANDED,
    { animate: false },
  );
}

window.addEventListener("resize", debounce(syncPanelsToViewport, 120));
window.addEventListener("orientationchange", syncPanelsToViewport);

setSheetState(SHEET_STATES.HIDDEN, { animate: false });

fetchHeadquarters();
