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
