const CONFIG = {
  center: [21.325, 105.365],
  defaultZoom: 12,

announcementRefreshInterval: 5 * 60 * 1000,
};

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

let activeAnnouncements = {};
let userMarker = null;
let userLat = null;
let userLng = null;
let currentlySelectedLocation = null;
let previousSelectedLocation = null;

// Debounce utility
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
const debouncedFilterAndRender = debounce(filterAndRender, 250);

const STATE = {
  HIDDEN: "100%",
  COLLAPSED: "50%", 
  EXPANDED: "0%", 
};

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

if (state === STATE.HIDDEN) {

detailPanel.classList.add("md:-translate-x-full");
      detailPanel.classList.remove("md:translate-x-0");
    } else {

detailPanel.classList.add("md:translate-x-0");
      detailPanel.classList.remove("md:-translate-x-full");
    }
  }
}

dragHandle.addEventListener(
  "touchstart",
  (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
    setSheetState(currentTranslate, false); 
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

const movePercent = (deltaY / window.innerHeight) * 100;
      let newPercent = 50 + movePercent;

newPercent = Math.max(0, Math.min(100, newPercent));
      document.documentElement.style.setProperty(
        "--sheet-translate",
        `${newPercent}%`,
      );
    } else if (currentTranslate === STATE.EXPANDED) {
      if (deltaY > 0) {

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
  const threshold = 50; 

if (currentTranslate === STATE.COLLAPSED) {
    if (deltaY < -threshold) setSheetState(STATE.EXPANDED);
    else if (deltaY > threshold) {
      setSheetState(STATE.HIDDEN);
      closeDetailPanel(); 
    } else setSheetState(STATE.COLLAPSED);
  } else if (currentTranslate === STATE.EXPANDED) {
    if (deltaY > threshold) setSheetState(STATE.COLLAPSED);
    else setSheetState(STATE.EXPANDED);
  }
});

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
    detailImage.classList.add('w-full', 'h-auto', 'rounded-lg', 'object-cover');
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

if (hasAnn) {
    const ann = activeAnnouncements[loc.name];
    annTitle.textContent = ann.title;
    annContent.textContent = ann.content || "";
    annTime.textContent = `Hết hiệu lực: ${ann.expiresAtDisplay}`;
    detailAnnBox.style.display = "block";
  } else {
    detailAnnBox.style.display = "none";
  }

hideMobileSearch(); 
  const isMobile = window.innerWidth < 768;
  setSheetState(isMobile ? STATE.COLLAPSED : STATE.EXPANDED); 

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

if (showNearby && userLat != null) {

visibleLocations.slice(5).forEach((loc) => {
      if (loc.marker && map.hasLayer(loc.marker)) map.removeLayer(loc.marker);
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

const iconHTML = isPolice 
        ? `<img src="logo.png" alt="Logo" class="w-6 h-6 object-contain">`
        : `<span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' 1;">badge</span>`;
      const iconClass = isPolice ? "" : "bg-id";
      const annHTML = hasAnn
        ? `<div class="result-ann-tag"><span class="material-symbols-outlined">error</span> Bấm xem thông báo</div>`
        : "";

return `
            <div class="result-item ${hasAnn ? "has-ann" : ""}" data-id="${loc.id}">
                <div class="result-icon-box ${iconClass} flex items-center justify-center">
                    ${iconHTML}
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

}

// Event delegation: 1 listener thay vì N listeners
resultsList.addEventListener("click", (e) => {
  const item = e.target.closest(".result-item");
  if (!item) return;
  const loc = locations.find((l) => l.id === parseInt(item.dataset.id));
  if (loc) openDetailPanel(loc);
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
  closeDetailPanel();
  searchPanel.classList.remove("-translate-y-[120%]", "opacity-0");
  searchPanel.classList.add("translate-y-0", "opacity-100");
  mobileOverlay.classList.remove("hidden");

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

const SHEET_ID = "1qkResomTlk3tLeoyz1HFFScwswxPIa8L4bySUammLSs"; 

async function fetchSheetData(sheetName) {
  let sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
  if (sheetName) sheetUrl += `&sheet=${encodeURIComponent(sheetName)}`;

  // Tìm đoạn fetch hiện tại và đảm bảo nó gọi đúng biến sheetUrl
  return fetch(sheetUrl)
    .then(res => res.text())
    .then(text => {
      const jsonString = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
      return JSON.parse(jsonString);
    });
}

async function fetchAnnouncements() {
  try {
    const data = await fetchSheetData("DaXacThuc");

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
    .replace(/\//g, "&#x2F;");
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
  try {
    const data = await fetchSheetData("Form_Responses");

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

const rawImageUrl = c[7]?.v || "";
      const imageUrl = convertGoogleDriveUrl(rawImageUrl) || rawImageUrl;

let lat = 21.325 + (Math.random() * 0.05); 
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
  }
}

fetchHeadquarters();
