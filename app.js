const STORAGE_KEY = "gan-day-customers-v1";
const ADDRESS_STORAGE_KEY = "gan-day-addresses-v1";
const SHORTCUT_STORAGE_KEY = "gan-day-shortcut-v1";
const NEARBY_METERS = 500;
const POSITION_REFRESH_MS = 10000;

const elements = {
  todayLabel: document.querySelector("#today-label"),
  search: document.querySelector("#search-input"),
  areaFilter: document.querySelector("#area-filter"),
  list: document.querySelector("#customer-list"),
  empty: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyDescription: document.querySelector("#empty-description"),
  emptyAddButton: document.querySelector("#empty-add-button"),
  summary: document.querySelector("#route-summary"),
  dialog: document.querySelector("#customer-dialog"),
  form: document.querySelector("#customer-form"),
  toast: document.querySelector("#toast"),
  trackingButton: document.querySelector("#tracking-button"),
  trackingStatus: document.querySelector("#tracking-status"),
  locationReadout: document.querySelector("#location-readout"),
  notificationButton: document.querySelector("#notification-button"),
  installButton: document.querySelector("#install-button"),
  locationGate: document.querySelector("#location-gate"),
  locationGateStatus: document.querySelector("#location-gate-status"),
  allowLocationButton: document.querySelector("#allow-location-button"),
  exitAppButton: document.querySelector("#exit-app-button"),
  locationExitHelp: document.querySelector("#location-exit-help"),
  addressSelect: document.querySelector("#customer-address"),
  addressHint: document.querySelector("#address-hint"),
  settingsDialog: document.querySelector("#settings-dialog"),
  savedAddresses: document.querySelector("#saved-addresses"),
  addressForm: document.querySelector("#address-form"),
  map: document.querySelector("#delivery-map"),
  mapStatus: document.querySelector("#map-status"),
  mapFitButton: document.querySelector("#map-fit-button"),
  tabButtons: document.querySelectorAll(".bottom-tab"),
  routeTabPanel: document.querySelector("#route-tab-panel"),
  mapTabPanel: document.querySelector("#map-tab-panel"),
  shortcutLink: document.querySelector("#shortcut-link"),
  shortcutConfigureButton: document.querySelector("#shortcut-configure-button"),
  shortcutDialog: document.querySelector("#shortcut-dialog"),
  shortcutForm: document.querySelector("#shortcut-form"),
  shortcutName: document.querySelector("#shortcut-name"),
  shortcutUrl: document.querySelector("#shortcut-url"),
  shortcutError: document.querySelector("#shortcut-error"),
  closeShortcutButton: document.querySelector("#close-shortcut-button"),
  removeShortcutButton: document.querySelector("#remove-shortcut-button"),
};

let customers = loadCustomers();
let savedAddresses = loadSavedAddresses();
let activeDate = localDateKey();
let watchId = null;
let positionRefreshTimer = null;
let positionRefreshInFlight = false;
let currentPosition = null;
let nearbyCustomerId = null;
let toastTimeout;
let deferredInstallPrompt = null;
let directionsNoteSaveTimer = null;
let customerRenderDeferred = false;
let mapLibraryPromise = null;
let deliveryMap = null;
let selfMapMarker = null;
let customerMapMarkers = new Map();
let hasSetInitialMapView = false;
let shortcut = loadShortcut();

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadCustomers() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) throw new Error("Dữ liệu khách hàng không hợp lệ.");
    return saved.filter((customer) =>
      customer && typeof customer.id === "string" && typeof customer.name === "string",
    ).map((customer) => ({
      ...customer,
      deliveryDates: Array.isArray(customer.deliveryDates) ? customer.deliveryDates : [],
      deliveredDates: Array.isArray(customer.deliveredDates) ? customer.deliveredDates : [],
      alertedDates: Array.isArray(customer.alertedDates) ? customer.alertedDates : [],
      directionsNote: typeof customer.directionsNote === "string" ? customer.directionsNote : "",
    }));
  } catch (error) {
    console.error("Không thể đọc danh sách khách hàng:", error);
    showToast("Không đọc được dữ liệu đã lưu. Vui lòng kiểm tra bộ nhớ trình duyệt.");
    return [];
  }
}

function saveCustomers() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
    return true;
  } catch (error) {
    console.error("Không thể lưu danh sách khách hàng:", error);
    showToast("Không thể lưu dữ liệu. Bộ nhớ thiết bị có thể đã đầy.");
    return false;
  }
}

function loadSavedAddresses() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADDRESS_STORAGE_KEY) || "[]");
    if (!Array.isArray(saved) || saved.some((address) => typeof address !== "string")) {
      throw new Error("Danh sách địa chỉ không hợp lệ.");
    }
    return [...new Set(saved.map((address) => address.trim()).filter(Boolean))];
  } catch (error) {
    console.error("Không thể đọc danh sách địa chỉ:", error);
    showToast("Không đọc được danh sách địa chỉ đã lưu.");
    return [];
  }
}

function saveAddresses() {
  try {
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(savedAddresses));
    return true;
  } catch (error) {
    console.error("Không thể lưu danh sách địa chỉ:", error);
    showToast("Không thể lưu danh sách địa chỉ. Bộ nhớ thiết bị có thể đã đầy.");
    return false;
  }
}

function loadShortcut() {
  try {
    const saved = JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY) || "null");
    if (!saved) return null;
    if (typeof saved.name !== "string" || typeof saved.url !== "string" || !isAllowedShortcutUrl(saved.url)) {
      throw new Error("Shortcut đã lưu không hợp lệ.");
    }
    return { name: saved.name, url: saved.url };
  } catch (error) {
    console.error("Không thể đọc shortcut đã lưu:", error);
    showToast("Không đọc được shortcut đã lưu.");
    return null;
  }
}

function isAllowedShortcutUrl(value) {
  try {
    const url = new URL(value);
    return /^[a-z][a-z\d+.-]*:/i.test(value)
      && !["javascript:", "data:", "file:", "blob:", "about:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function renderShortcut() {
  const configured = Boolean(shortcut);
  elements.shortcutLink.hidden = !configured;
  elements.shortcutConfigureButton.textContent = configured ? "✎" : "＋";
  elements.shortcutConfigureButton.setAttribute(
    "aria-label",
    configured ? "Chỉnh sửa shortcut ứng dụng" : "Thêm shortcut ứng dụng",
  );
  elements.shortcutConfigureButton.title = configured ? "Chỉnh sửa shortcut" : "Thêm shortcut ứng dụng";
  if (shortcut) {
    elements.shortcutLink.href = shortcut.url;
    elements.shortcutLink.textContent = `↗ ${shortcut.name}`;
    elements.shortcutLink.title = `Mở ${shortcut.name}`;
  } else {
    elements.shortcutLink.removeAttribute("href");
    elements.shortcutLink.textContent = "";
    elements.shortcutLink.removeAttribute("title");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function validCoordinate(value, min, max) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatTodayLabel(date = new Date()) {
  const label = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return label.charAt(0).toLocaleUpperCase("vi") + label.slice(1);
}

function getCustomerCoordinates(customer) {
  const latitude = validCoordinate(customer.latitude, -90, 90);
  const longitude = validCoordinate(customer.longitude, -180, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

function distanceMeters(first, second) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latDelta = radians(second.latitude - first.latitude);
  const lonDelta = radians(second.longitude - first.longitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
    * Math.sin(lonDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => elements.toast.classList.remove("is-visible"), 4000);
}

function renderAddressOptions(selectedAddress = "") {
  const options = ['<option value="">Chọn địa chỉ có sẵn (không bắt buộc)</option>'];
  for (const address of savedAddresses) {
    options.push(`<option value="${escapeHtml(address)}">${escapeHtml(address)}</option>`);
  }
  if (selectedAddress && !savedAddresses.includes(selectedAddress)) {
    options.push(`<option value="${escapeHtml(selectedAddress)}">${escapeHtml(selectedAddress)} (đã lưu)</option>`);
  }
  elements.addressSelect.innerHTML = options.join("");
  elements.addressSelect.value = selectedAddress;
  elements.addressHint.textContent = savedAddresses.length
    ? "Có thể thêm hoặc sửa danh sách địa chỉ trong Cài đặt."
    : "Chưa có địa chỉ. Hãy thêm trong Cài đặt để chọn tại đây.";
}

function renderAreaOptions(selectedArea = elements.areaFilter.value) {
  const options = ['<option value="">Tất cả khu vực</option>'];
  for (const address of savedAddresses) {
    options.push(`<option value="${escapeHtml(address)}">${escapeHtml(address)}</option>`);
  }
  elements.areaFilter.innerHTML = options.join("");
  elements.areaFilter.value = savedAddresses.includes(selectedArea) ? selectedArea : "";
}

function renderSavedAddresses() {
  elements.savedAddresses.innerHTML = savedAddresses.length
    ? savedAddresses.map((address, index) => `<li class="saved-address">
        <span>${escapeHtml(address)}</span>
        <button class="small-action" type="button" data-action="remove-address" data-index="${index}" aria-label="Xóa địa chỉ ${escapeHtml(address)}">×</button>
      </li>`).join("")
    : '<li class="address-empty">Chưa có địa chỉ. Thêm địa chỉ thường giao ở phía trên.</li>';
}

function renderCustomers() {
  updateDeliveryMap();

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLTextAreaElement
    && activeElement.matches('textarea[data-action="save-directions-note"]')) {
    customerRenderDeferred = true;
    return;
  }
  customerRenderDeferred = false;

  const today = localDateKey();
  const query = elements.search.value.trim();
  const phoneDigits = normalizePhone(query);
  const selectedArea = elements.areaFilter.value;
  const inSelectedArea = (customer) => !selectedArea
    || (customer.address || "").toLocaleLowerCase("vi") === selectedArea.toLocaleLowerCase("vi");
  const scheduled = customers.filter((customer) =>
    customer.deliveryDates.includes(today) && inSelectedArea(customer),
  );
  const deliveredCount = scheduled.filter((customer) => customer.deliveredDates.includes(today)).length;
  const matches = phoneDigits
    ? customers.filter((customer) =>
      normalizePhone(customer.phone).includes(phoneDigits) && inSelectedArea(customer),
    )
    : [];
  const isSearching = query.length > 0;
  const visible = [...(isSearching ? matches : scheduled)];
  visible.sort((first, second) => {
    const firstDelivered = first.deliveredDates.includes(today);
    const secondDelivered = second.deliveredDates.includes(today);
    if (firstDelivered !== secondDelivered) return Number(firstDelivered) - Number(secondDelivered);
    if (firstDelivered || !currentPosition) return 0;
    const firstCoordinates = getCustomerCoordinates(first);
    const secondCoordinates = getCustomerCoordinates(second);
    const firstDistance = firstCoordinates ? distanceMeters(currentPosition, firstCoordinates) : Infinity;
    const secondDistance = secondCoordinates ? distanceMeters(currentPosition, secondCoordinates) : Infinity;
    return firstDistance - secondDistance;
  });

  elements.todayLabel.textContent = formatTodayLabel();
  elements.summary.textContent = isSearching
    ? phoneDigits
      ? `${matches.length} khách hàng khớp số điện thoại`
      : "Nhập số điện thoại để tìm khách hàng"
    : `${scheduled.length} khách cần giao hôm nay${deliveredCount ? ` · ${deliveredCount} đã giao` : ""}`;
  elements.empty.hidden = visible.length > 0;
  elements.emptyAddButton.hidden = !(isSearching && phoneDigits && matches.length === 0);
  if (!isSearching) {
    elements.emptyTitle.textContent = "Hôm nay chưa có khách cần giao";
    elements.emptyDescription.textContent = "Nhập số điện thoại ở ô phía trên để tìm và thêm khách vào danh sách hôm nay.";
  } else if (!phoneDigits) {
    elements.emptyTitle.textContent = "Nhập số điện thoại khách hàng";
    elements.emptyDescription.textContent = "Bạn có thể tìm khách đã lưu hoặc thêm khách mới vào danh sách giao hôm nay.";
  } else if (matches.length === 0) {
    elements.emptyTitle.textContent = "Chưa có khách hàng này";
    elements.emptyDescription.textContent = "Thêm khách hàng mới. Khách sẽ tự động được thêm vào danh sách giao hôm nay.";
  } else {
    elements.emptyTitle.textContent = "Không tìm thấy khách hàng";
    elements.emptyDescription.textContent = "Thử nhập số điện thoại khác.";
  }

  elements.list.innerHTML = visible.map((customer) => {
    const isScheduled = customer.deliveryDates.includes(today);
    const isDelivered = customer.deliveredDates.includes(today);
    const coordinates = getCustomerCoordinates(customer);
    const distance = currentPosition && coordinates
      ? `<span class="customer-distance">⌖ Cách bạn ${formatDistance(distanceMeters(currentPosition, coordinates))}</span>`
      : "";
    const mapUrl = coordinates
      ? `https://maps.google.com/?q=${coordinates.latitude},${coordinates.longitude}`
      : customer.address
        ? `https://maps.google.com/?q=${encodeURIComponent(customer.address)}`
        : "";
    const phone = customer.phone ? customer.phone.replace(/[^\d+]/g, "") : "";

    return `<article class="customer-card${isSearching ? " search-result" : ""}">
      <div class="customer-avatar" aria-hidden="true">${escapeHtml((customer.name || "?").trim().charAt(0).toLocaleUpperCase("vi"))}</div>
      <div class="customer-info">
        <p class="customer-name">${escapeHtml(customer.name)}</p>
        <div class="customer-meta">
          ${phone ? `<a href="tel:${escapeHtml(phone)}">${escapeHtml(customer.phone)}</a>` : ""}
          ${customer.address ? `<span>${escapeHtml(customer.address)}</span>` : ""}
          ${mapUrl ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer">Mở bản đồ ↗</a>` : ""}
        </div>
        ${distance}
        ${!isSearching && isScheduled && !coordinates
          ? `<label class="directions-note-field">
              <span>Ghi chú chỉ đường</span>
              <textarea data-action="save-directions-note" data-id="${escapeHtml(customer.id)}" maxlength="300" rows="2" placeholder="Ví dụ: cổng màu xanh, vào hẻm bên trái…">${escapeHtml(customer.directionsNote)}</textarea>
            </label>`
          : ""}
      </div>
      <div class="customer-actions">
        ${isSearching
          ? isScheduled
            ? `<span class="${isDelivered ? "delivery-complete" : "already-added"}"><span aria-hidden="true">✓</span> ${isDelivered ? "Đã giao hôm nay" : "Đã thêm hôm nay"}</span>`
            : `<button class="delivery-toggle" type="button" data-action="add-today" data-id="${escapeHtml(customer.id)}"><span aria-hidden="true">＋</span> Thêm vào danh sách giao hàng</button>`
          : `<button class="delivery-toggle ${isDelivered ? "is-delivered" : "is-added"}" type="button" data-action="${isDelivered ? "undo-delivered" : "mark-delivered"}" data-id="${escapeHtml(customer.id)}">${isDelivered ? "✓ Đã giao · Hoàn tác" : "Đã giao đơn hàng"}</button>
            <button class="small-action" type="button" data-action="remove-today" data-id="${escapeHtml(customer.id)}" aria-label="Bỏ ${escapeHtml(customer.name)} khỏi danh sách hôm nay">×</button>`}
      </div>
    </article>`;
  }).join("");
}

function loadMapLibrary() {
  if (window.L) return Promise.resolve(window.L);
  if (mapLibraryPromise) return mapLibraryPromise;

  mapLibraryPromise = new Promise((resolve, reject) => {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
    document.head.append(stylesheet);

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Không tải được thư viện bản đồ."));
    document.head.append(script);
  });
  return mapLibraryPromise;
}

function customerPopupContent(customer) {
  const phone = customer.phone
    ? `<br><a href="tel:${escapeHtml(customer.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(customer.phone)}</a>`
    : "";
  const address = customer.address ? `<br>${escapeHtml(customer.address)}` : "";
  const delivered = customer.deliveredDates.includes(localDateKey()) ? "<br>Đã giao hôm nay" : "";
  return `<strong>${escapeHtml(customer.name)}</strong>${phone}${address}${delivered}`;
}

function fitDeliveryMap() {
  if (!deliveryMap || !window.L) return;
  const points = [];
  if (currentPosition) points.push([currentPosition.latitude, currentPosition.longitude]);
  for (const customer of customers) {
    if (!customer.deliveryDates.includes(localDateKey())) continue;
    const coordinates = getCustomerCoordinates(customer);
    if (coordinates) points.push([coordinates.latitude, coordinates.longitude]);
  }
  if (points.length === 1) {
    deliveryMap.setView(points[0], 15);
  } else if (points.length > 1) {
    deliveryMap.fitBounds(window.L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
  }
}

function updateDeliveryMap() {
  const today = localDateKey();
  const scheduledCustomers = customers.filter((customer) =>
    customer.deliveryDates.includes(today) && getCustomerCoordinates(customer),
  );
  const hasCoordinates = Boolean(currentPosition || scheduledCustomers.length);
  if (!hasCoordinates) {
    elements.mapStatus.textContent = "Bật định vị để hiện vị trí của bạn. Khách sẽ hiện trên bản đồ sau khi lưu được vị trí giao hàng.";
    elements.mapFitButton.disabled = true;
    return;
  }

  elements.mapStatus.textContent = `${currentPosition ? "Vị trí của bạn đang được cập nhật" : "Đang hiển thị khách đã có vị trí"} · ${scheduledCustomers.length} khách hôm nay có tọa độ.`;
  elements.mapFitButton.disabled = false;
  loadMapLibrary().then((leaflet) => {
    if (!deliveryMap) {
      const initialPoint = currentPosition
        ? [currentPosition.latitude, currentPosition.longitude]
        : [getCustomerCoordinates(scheduledCustomers[0]).latitude, getCustomerCoordinates(scheduledCustomers[0]).longitude];
      deliveryMap = leaflet.map(elements.map, { scrollWheelZoom: false }).setView(initialPoint, 14);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      }).addTo(deliveryMap);
      window.setTimeout(() => deliveryMap.invalidateSize(), 0);
    }

    if (currentPosition) {
      if (selfMapMarker) {
        selfMapMarker.setLatLng([currentPosition.latitude, currentPosition.longitude]);
      } else {
        selfMapMarker = leaflet.circleMarker(
          [currentPosition.latitude, currentPosition.longitude],
          { radius: 9, color: "#fff", weight: 3, fillColor: "#2675d8", fillOpacity: 1 },
        ).addTo(deliveryMap).bindPopup("Vị trí hiện tại của bạn");
      }
    } else if (selfMapMarker) {
      deliveryMap.removeLayer(selfMapMarker);
      selfMapMarker = null;
    }

    const activeCustomerIds = new Set();
    for (const customer of scheduledCustomers) {
      const coordinates = getCustomerCoordinates(customer);
      activeCustomerIds.add(customer.id);
      const position = [coordinates.latitude, coordinates.longitude];
      const existingMarker = customerMapMarkers.get(customer.id);
      if (existingMarker) {
        existingMarker
          .setLatLng(position)
          .setStyle({ fillColor: customer.deliveredDates.includes(today) ? "#6f8b70" : "#df704b" })
          .setPopupContent(customerPopupContent(customer));
      } else {
        const delivered = customer.deliveredDates.includes(today);
        const marker = leaflet.circleMarker(position, {
          radius: 8,
          color: "#fff",
          weight: 2,
          fillColor: delivered ? "#6f8b70" : "#df704b",
          fillOpacity: 1,
        }).addTo(deliveryMap).bindPopup(customerPopupContent(customer));
        customerMapMarkers.set(customer.id, marker);
      }
    }
    for (const [customerId, marker] of customerMapMarkers) {
      if (!activeCustomerIds.has(customerId)) {
        deliveryMap.removeLayer(marker);
        customerMapMarkers.delete(customerId);
      }
    }

    if (!hasSetInitialMapView) {
      fitDeliveryMap();
      hasSetInitialMapView = true;
    }
  }).catch((error) => {
    console.error("Không thể hiển thị bản đồ:", error);
    elements.mapStatus.textContent = "Không tải được bản đồ. Hãy kiểm tra kết nối Internet rồi tải lại ứng dụng.";
    elements.mapFitButton.disabled = true;
  });
}

function openCustomerDialog(phone = "") {
  elements.form.reset();
  document.querySelector("#form-error").hidden = true;
  document.querySelector("#customer-phone").value = phone;
  renderAddressOptions();
  elements.dialog.showModal();
  document.querySelector("#customer-name").focus();
}

function refreshForNewDay() {
  const today = localDateKey();
  if (today === activeDate) return;
  activeDate = today;
  elements.search.value = "";
  renderCustomers();
  showToast("Danh sách đã tự chuyển sang ngày hôm nay.");
}

function updateTrackingStatus(message) {
  elements.trackingStatus.textContent = message;
}

function showLocationGate(message) {
  elements.locationGateStatus.textContent = message;
  elements.locationExitHelp.hidden = true;
  if (!elements.locationGate.open) elements.locationGate.showModal();
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Thiết bị hoặc trình duyệt này không hỗ trợ định vị."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
  });
}

function getLocationErrorMessage(error) {
  if (error.code === 1) return "Bạn chưa cấp quyền vị trí. Hãy bật quyền Vị trí trong cài đặt trình duyệt.";
  if (error.code === 2) return "Không xác định được vị trí. Hãy kiểm tra GPS.";
  if (error.code === 3) return "Lấy vị trí quá lâu.";
  return error.message || "Không thể lấy vị trí hiện tại.";
}

async function markDelivered(customer, button) {
  const today = localDateKey();
  if (customer.deliveredDates.includes(today)) return;

  button.disabled = true;
  button.textContent = getCustomerCoordinates(customer) ? "Đang lưu…" : "Đang lấy vị trí…";
  let coordinates = null;
  if (!getCustomerCoordinates(customer)) {
    try {
      const position = await getCurrentPosition();
      coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch (error) {
      const message = getLocationErrorMessage(error);
      console.error("Không thể lưu vị trí giao hàng:", error);
      if (!window.confirm(`${message} Bạn vẫn muốn đánh dấu đơn hàng là đã giao mà không lưu vị trí?`)) {
        button.disabled = false;
        renderCustomers();
        return;
      }
    }
  }

  const previousCoordinates = { latitude: customer.latitude, longitude: customer.longitude };
  customer.deliveredDates.push(today);
  if (coordinates) {
    customer.latitude = coordinates.latitude;
    customer.longitude = coordinates.longitude;
  }

  if (!saveCustomers()) {
    customer.deliveredDates = customer.deliveredDates.filter((date) => date !== today);
    customer.latitude = previousCoordinates.latitude;
    customer.longitude = previousCoordinates.longitude;
    button.disabled = false;
    renderCustomers();
    return;
  }
  renderCustomers();
  showToast(coordinates
    ? "Đã đánh dấu đã giao và lưu vị trí giao hàng."
    : "Đã đánh dấu đơn hàng là đã giao.");
}

function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (positionRefreshTimer !== null) window.clearInterval(positionRefreshTimer);
  positionRefreshTimer = null;
  positionRefreshInFlight = false;
  nearbyCustomerId = null;
  elements.trackingButton.textContent = "Bật theo dõi";
  elements.trackingButton.classList.remove("is-active");
  elements.trackingButton.disabled = false;
}

function refreshTrackedPosition() {
  if (positionRefreshInFlight) return;
  positionRefreshInFlight = true;
  getCurrentPosition()
    .then(checkNearbyCustomers)
    .catch((error) => {
      console.warn("Không cập nhật được vị trí theo chu kỳ:", error);
    })
    .finally(() => {
      positionRefreshInFlight = false;
    });
}

async function requestLocationAndTrack() {
  elements.allowLocationButton.disabled = true;
  elements.locationGateStatus.textContent = "Đang yêu cầu quyền truy cập vị trí…";
  try {
    const position = await getCurrentPosition();
    checkNearbyCustomers(position);
    startTracking();
    elements.locationGate.close();
  } catch (error) {
    const message = getLocationErrorMessage(error);
    console.error("Không thể bật theo dõi vị trí:", error);
    elements.locationGateStatus.textContent = error.code === 1
      ? `${message} Hãy cấp quyền vị trí trong cài đặt trình duyệt rồi thử lại.`
      : message;
  } finally {
    elements.allowLocationButton.disabled = false;
  }
}

async function initializeLocationRequirement() {
  showLocationGate("Cho phép truy cập vị trí để tiếp tục.");
  if (!navigator.geolocation) {
    elements.locationGateStatus.textContent = "Trình duyệt này không hỗ trợ định vị. Hãy mở app bằng trình duyệt có hỗ trợ vị trí.";
    return;
  }
  if (!navigator.permissions?.query) return;

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    if (permission.state === "granted") {
      void requestLocationAndTrack();
    } else if (permission.state === "denied") {
      elements.locationGateStatus.textContent = "Quyền vị trí đang bị chặn. Hãy bật quyền Vị trí trong cài đặt trình duyệt rồi thử lại.";
    }
  } catch (error) {
    console.info("Không thể kiểm tra trạng thái quyền vị trí; chờ người dùng cho phép.", error);
  }
}

function notifyNearby(customer, meters) {
  const message = `${customer.name} đang cách bạn ${formatDistance(meters)}.`;
  showToast(`📍 Sắp đến khách hàng: ${message}`);
  if ("Notification" in window && Notification.permission === "granted") {
    const options = {
      body: message,
      icon: "./icon.svg",
      tag: `nearby-${customer.id}-${localDateKey()}`,
    };
    const notify = "serviceWorker" in navigator
      ? navigator.serviceWorker.ready.then((registration) =>
        registration.showNotification("Khách hàng ở gần bạn", options))
      : Promise.resolve().then(() => {
        const notification = new Notification("Khách hàng ở gần bạn", options);
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      });
    notify.catch((error) => {
      console.error("Không thể hiển thị thông báo:", error);
      showToast(`📍 Sắp đến khách hàng: ${message}`);
    });
  }
}

function checkNearbyCustomers(position) {
  const current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  const today = localDateKey();
  currentPosition = current;
  elements.locationReadout.textContent = `Vị trí cập nhật lúc ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.`;

  let updated = false;
  const nearbyCustomers = [];
  for (const customer of customers) {
    if (!customer.deliveryDates.includes(today)
      || customer.deliveredDates.includes(today)) continue;
    const coordinates = getCustomerCoordinates(customer);
    if (!coordinates) continue;
    const meters = distanceMeters(current, coordinates);
    if (meters <= NEARBY_METERS) nearbyCustomers.push({ customer, meters });
    if (meters <= NEARBY_METERS && !customer.alertedDates.includes(today)) {
      customer.alertedDates.push(today);
      updated = true;
      notifyNearby(customer, meters);
    }
  }
  if (updated) saveCustomers();

  nearbyCustomers.sort((first, second) => first.meters - second.meters);
  const nextNearbyCustomer = nearbyCustomers[0]?.customer;
  if (nextNearbyCustomer && nearbyCustomerId && nextNearbyCustomer.id !== nearbyCustomerId) {
    const previousCustomer = customers.find((customer) =>
      customer.id === nearbyCustomerId
      && customer.deliveryDates.includes(today)
      && !customer.deliveredDates.includes(today),
    );
    if (previousCustomer) {
      const markPreviousDelivered = window.confirm(
        `Bạn đã giao đơn hàng cho khách "${previousCustomer.name}" chưa?`,
      );
      if (markPreviousDelivered) {
        previousCustomer.deliveredDates.push(today);
        if (saveCustomers()) {
          showToast(`Đã xác nhận giao đơn hàng cho ${previousCustomer.name}.`);
        } else {
          previousCustomer.deliveredDates = previousCustomer.deliveredDates.filter((date) => date !== today);
        }
      }
    }
  }
  if (nextNearbyCustomer) nearbyCustomerId = nextNearbyCustomer.id;
  renderCustomers();
}

function startTracking() {
  if (!("geolocation" in navigator)) {
    showLocationGate("Thiết bị hoặc trình duyệt này không hỗ trợ định vị.");
    return;
  }
  if (watchId !== null) {
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      checkNearbyCustomers(position);
      elements.trackingButton.textContent = "Đang theo dõi vị trí";
      elements.trackingButton.classList.add("is-active");
      elements.trackingButton.disabled = true;
      const today = localDateKey();
      const withCoordinates = customers.filter((customer) =>
        customer.deliveryDates.includes(today)
          && !customer.deliveredDates.includes(today)
          && getCustomerCoordinates(customer),
      ).length;
      updateTrackingStatus(withCoordinates
        ? `Đang theo dõi · Nhắc khi cách khách chưa giao có tọa độ trong lộ trình ${NEARBY_METERS} m.`
        : "Đang theo dõi, nhưng khách trong lộ trình chưa có tọa độ để tính khoảng cách.");
    },
    (error) => {
      stopTracking();
      const message = getLocationErrorMessage(error);
      updateTrackingStatus(message);
      showLocationGate(`${message} Cần bật lại định vị để tiếp tục sử dụng app.`);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );
  if (positionRefreshTimer === null) {
    positionRefreshTimer = window.setInterval(refreshTrackedPosition, POSITION_REFRESH_MS);
  }
  elements.trackingButton.textContent = "Đang theo dõi vị trí";
  elements.trackingButton.classList.add("is-active");
  elements.trackingButton.disabled = true;
  updateTrackingStatus("Đang theo dõi vị trí trực tiếp.");
}

renderCustomers();
renderAddressOptions();
renderAreaOptions();
renderSavedAddresses();
renderShortcut();

document.querySelector("#empty-add-button").addEventListener("click", () => openCustomerDialog(elements.search.value.trim()));
elements.shortcutConfigureButton.addEventListener("click", () => {
  elements.shortcutName.value = shortcut?.name || "";
  elements.shortcutUrl.value = shortcut?.url || "";
  elements.shortcutError.hidden = true;
  elements.removeShortcutButton.hidden = !shortcut;
  elements.shortcutDialog.showModal();
  elements.shortcutName.focus();
});
elements.closeShortcutButton.addEventListener("click", () => elements.shortcutDialog.close());
elements.shortcutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.shortcutName.value.trim();
  const url = elements.shortcutUrl.value.trim();
  if (!name || !isAllowedShortcutUrl(url)) {
    elements.shortcutError.textContent = "Nhập tên và URL/deep link hợp lệ (ví dụ https://maps.google.com).";
    elements.shortcutError.hidden = false;
    return;
  }

  const nextShortcut = { name, url };
  try {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(nextShortcut));
  } catch (error) {
    console.error("Không thể lưu shortcut:", error);
    showToast("Không thể lưu shortcut. Bộ nhớ thiết bị có thể đã đầy.");
    return;
  }
  shortcut = nextShortcut;
  renderShortcut();
  elements.shortcutDialog.close();
  showToast("Đã lưu shortcut ứng dụng.");
});
elements.removeShortcutButton.addEventListener("click", () => {
  try {
    localStorage.removeItem(SHORTCUT_STORAGE_KEY);
  } catch (error) {
    console.error("Không thể xóa shortcut:", error);
    showToast("Không thể xóa shortcut đã lưu.");
    return;
  }
  shortcut = null;
  renderShortcut();
  elements.shortcutDialog.close();
  showToast("Đã xóa shortcut ứng dụng.");
});
document.querySelector("#settings-button").addEventListener("click", () => elements.settingsDialog.showModal());
document.querySelector("#close-settings-button").addEventListener("click", () => elements.settingsDialog.close());
document.querySelector("#close-dialog-button").addEventListener("click", () => elements.dialog.close());
document.querySelector("#cancel-dialog-button").addEventListener("click", () => elements.dialog.close());
elements.search.addEventListener("input", renderCustomers);
elements.areaFilter.addEventListener("change", renderCustomers);
elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const showMap = button.dataset.tab === "map";
    elements.routeTabPanel.hidden = showMap;
    elements.mapTabPanel.hidden = !showMap;
    elements.tabButtons.forEach((tabButton) => {
      const selected = tabButton === button;
      tabButton.classList.toggle("is-active", selected);
      tabButton.setAttribute("aria-selected", String(selected));
      tabButton.tabIndex = selected ? 0 : -1;
    });
    if (showMap && deliveryMap) {
      window.setTimeout(() => {
        deliveryMap.invalidateSize();
        fitDeliveryMap();
      }, 0);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const buttons = [...elements.tabButtons];
    const currentIndex = buttons.indexOf(button);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    buttons[(currentIndex + direction + buttons.length) % buttons.length].click();
    buttons[(currentIndex + direction + buttons.length) % buttons.length].focus();
  });
});
elements.mapFitButton.addEventListener("click", fitDeliveryMap);
elements.allowLocationButton.addEventListener("click", requestLocationAndTrack);
elements.locationGate.addEventListener("cancel", (event) => event.preventDefault());
elements.exitAppButton.addEventListener("click", () => {
  stopTracking();
  elements.locationGateStatus.textContent = "Đã dừng theo dõi vị trí.";
  elements.locationExitHelp.hidden = false;
  window.close();
});

elements.addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#new-address");
  const address = input.value.trim();
  const duplicate = savedAddresses.some((existing) =>
    existing.toLocaleLowerCase("vi") === address.toLocaleLowerCase("vi"),
  );
  const error = document.querySelector("#address-error");
  if (!address) return;
  if (duplicate) {
    error.textContent = "Địa chỉ này đã có trong danh sách.";
    error.hidden = false;
    return;
  }

  savedAddresses.push(address);
  if (!saveAddresses()) {
    savedAddresses.pop();
    return;
  }
  error.hidden = true;
  input.value = "";
  renderSavedAddresses();
  renderAddressOptions(address);
  renderAreaOptions();
  showToast("Đã thêm địa chỉ vào danh sách.");
});

elements.savedAddresses.addEventListener("click", (event) => {
  const button = event.target.closest('button[data-action="remove-address"]');
  if (!button) return;
  const index = Number(button.dataset.index);
  const address = savedAddresses[index];
  if (address === undefined) return;
  if (!window.confirm(`Xóa "${address}" khỏi danh sách địa chỉ? Địa chỉ đã lưu trên khách hàng sẽ không bị thay đổi.`)) return;

  savedAddresses.splice(index, 1);
  if (!saveAddresses()) {
    savedAddresses.splice(index, 0, address);
    return;
  }
  renderSavedAddresses();
  renderAddressOptions(elements.addressSelect.value === address ? "" : elements.addressSelect.value);
  renderAreaOptions(elements.areaFilter.value);
  showToast("Đã xóa địa chỉ khỏi danh sách.");
});

elements.list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const customer = customers.find((entry) => entry.id === button.dataset.id);
  if (!customer) return;

  const today = localDateKey();
  if (button.dataset.action === "add-today" && !customer.deliveryDates.includes(today)) {
    customer.deliveryDates.push(today);
    if (saveCustomers()) {
      elements.search.value = "";
      renderCustomers();
      showToast("Đã thêm khách vào danh sách giao hôm nay.");
    }
  } else if (button.dataset.action === "mark-delivered") {
    void markDelivered(customer, button);
  } else if (button.dataset.action === "undo-delivered") {
    const previousDeliveredDates = customer.deliveredDates;
    customer.deliveredDates = customer.deliveredDates.filter((date) => date !== today);
    if (saveCustomers()) {
      renderCustomers();
      showToast("Đã hoàn tác trạng thái đã giao.");
    } else {
      customer.deliveredDates = previousDeliveredDates;
    }
  } else if (button.dataset.action === "remove-today") {
    customer.deliveryDates = customer.deliveryDates.filter((date) => date !== today);
    if (saveCustomers()) {
      renderCustomers();
      showToast("Đã bỏ khách khỏi danh sách giao hôm nay.");
    }
  }
});

elements.list.addEventListener("input", (event) => {
  const field = event.target.closest('textarea[data-action="save-directions-note"]');
  if (!field) return;
  const customer = customers.find((entry) => entry.id === field.dataset.id);
  if (!customer) return;

  customer.directionsNote = field.value.trim();
  clearTimeout(directionsNoteSaveTimer);
  directionsNoteSaveTimer = window.setTimeout(() => {
    directionsNoteSaveTimer = null;
    saveCustomers();
  }, 300);
});

elements.list.addEventListener("change", (event) => {
  const field = event.target.closest('textarea[data-action="save-directions-note"]');
  if (!field) return;
  const customer = customers.find((entry) => entry.id === field.dataset.id);
  if (!customer) return;

  clearTimeout(directionsNoteSaveTimer);
  directionsNoteSaveTimer = null;
  if (saveCustomers()) showToast("Đã lưu ghi chú chỉ đường.");
});

elements.list.addEventListener("focusout", (event) => {
  if (!event.target.matches('textarea[data-action="save-directions-note"]')) return;
  window.setTimeout(() => {
    if (customerRenderDeferred) renderCustomers();
  }, 0);
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#customer-name").value.trim();
  const phone = document.querySelector("#customer-phone").value.trim();
  const phoneDigits = normalizePhone(phone);
  const error = document.querySelector("#form-error");

  if (!name || phoneDigits.length < 7 || phoneDigits.length > 15) {
    error.textContent = "Vui lòng nhập tên và số điện thoại hợp lệ.";
    error.hidden = false;
    return;
  }
  if (customers.some((customer) => normalizePhone(customer.phone) === phoneDigits)) {
    error.textContent = "Số điện thoại này đã có trong danh sách. Hãy tìm khách bằng ô tìm kiếm phía trên.";
    error.hidden = false;
    return;
  }
  customers.push({
    id: crypto.randomUUID(),
    name,
    phone,
    address: document.querySelector("#customer-address").value.trim(),
    latitude: null,
    longitude: null,
    deliveryDates: [localDateKey()],
    deliveredDates: [],
    alertedDates: [],
    directionsNote: "",
  });

  if (saveCustomers()) {
    elements.dialog.close();
    elements.search.value = "";
    renderCustomers();
    showToast("Đã thêm khách vào danh sách giao hôm nay.");
  }
});

elements.trackingButton.addEventListener("click", requestLocationAndTrack);
window.setInterval(refreshForNewDay, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshForNewDay();
});

elements.notificationButton.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    showToast("Trình duyệt này không hỗ trợ thông báo. Nhắc nhở sẽ hiện trong ứng dụng.");
    return;
  }
  if (Notification.permission === "granted") {
    showToast("Thông báo đã được cho phép.");
    return;
  }
  if (Notification.permission === "denied") {
    showToast("Thông báo đã bị chặn. Hãy bật quyền trong cài đặt trình duyệt.");
    return;
  }
  const permission = await Notification.requestPermission();
  showToast(permission === "granted" ? "Đã bật thông báo khi đến gần khách." : "Bạn chưa cho phép thông báo.");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installButton.hidden = false;
});

elements.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installButton.hidden = true;
});

void initializeLocationRequirement();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Không thể đăng ký chế độ ngoại tuyến:", error);
      showToast("Không bật được chế độ ngoại tuyến trên trình duyệt này.");
    });
  });
}

if ("Notification" in window && Notification.permission === "granted") {
  elements.notificationButton.textContent = "Thông báo đã bật ✓";
}
