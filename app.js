const STORAGE_KEY = "gan-day-customers-v1";
const ADDRESS_STORAGE_KEY = "gan-day-addresses-v1";
const SHARED_ADDRESS_STORAGE_KEY = "gan-day-shared-addresses-v1";
const AREA_TRACKING_METERS = 500;
const CURRENT_DELIVERY_METERS = 200;

const elements = {
  todayLabel: document.querySelector("#today-label"),
  search: document.querySelector("#search-input"),
  searchResults: document.querySelector("#search-results"),
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
  deliveryFilters: document.querySelectorAll(".delivery-filter"),
  deliveredFilterCount: document.querySelector("#delivered-filter-count"),
  pendingFilterCount: document.querySelector("#pending-filter-count"),
  allFilterCount: document.querySelector("#all-filter-count"),
  nearestDeliveryAlert: document.querySelector("#nearest-delivery-alert"),
  nearestDeliveryMessage: document.querySelector("#nearest-delivery-message"),
  nearestDeliveryAction: document.querySelector("#nearest-delivery-action"),
  areaExitAlert: document.querySelector("#area-exit-alert"),
  areaExitMessage: document.querySelector("#area-exit-message"),
  areaExitDismiss: document.querySelector("#area-exit-dismiss"),
  contactPickerButton: document.querySelector("#contact-picker-button"),
  contactFile: document.querySelector("#contact-file"),
  contactImportError: document.querySelector("#contact-import-error"),
  shareCustomerDataButton: document.querySelector("#share-customer-data-button"),
  importCustomerDataButton: document.querySelector("#import-customer-data-button"),
  sharedDataFile: document.querySelector("#shared-data-file"),
  sharedDataError: document.querySelector("#shared-data-error"),
};

let customers = loadCustomers();
let savedAddresses = loadSavedAddresses();
let sharedAddresses = loadSharedAddresses();
let activeDate = localDateKey();
let activeDeliveryFilter = "all";
let watchId = null;
let currentPosition = null;
let areaTrackedCustomerId = null;
let areaExitCustomerId = null;
let dismissedAreaExitCustomerId = null;
let toastTimeout;
let deferredInstallPrompt = null;
let directionsNoteSaveTimer = null;
let customerRenderDeferred = false;
let mapLibraryPromise = null;
let deliveryMap = null;
let selfMapMarker = null;
let customerMapMarkers = new Map();
let hasSetInitialMapView = false;

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
    ).map((customer) => {
      const savedCustomer = { ...customer };
      delete savedCustomer.alertedDates;
      return {
        ...savedCustomer,
        deliveryDates: Array.isArray(customer.deliveryDates) ? customer.deliveryDates : [],
        deliveredDates: Array.isArray(customer.deliveredDates) ? customer.deliveredDates : [],
        directionsNote: typeof customer.directionsNote === "string" ? customer.directionsNote : "",
      };
    });
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
  const previousAddresses = localStorage.getItem(ADDRESS_STORAGE_KEY);
  const previousSharedAddresses = localStorage.getItem(SHARED_ADDRESS_STORAGE_KEY);
  try {
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(savedAddresses));
    localStorage.setItem(SHARED_ADDRESS_STORAGE_KEY, JSON.stringify(sharedAddresses));
    return true;
  } catch (error) {
    console.error("Không thể lưu danh sách địa chỉ:", error);
    try {
      if (previousAddresses === null) localStorage.removeItem(ADDRESS_STORAGE_KEY);
      else localStorage.setItem(ADDRESS_STORAGE_KEY, previousAddresses);
      if (previousSharedAddresses === null) localStorage.removeItem(SHARED_ADDRESS_STORAGE_KEY);
      else localStorage.setItem(SHARED_ADDRESS_STORAGE_KEY, previousSharedAddresses);
    } catch (rollbackError) {
      console.error("Không thể khôi phục danh sách khu vực:", rollbackError);
    }
    showToast("Không thể lưu danh sách địa chỉ. Bộ nhớ thiết bị có thể đã đầy.");
    return false;
  }
}

function loadSharedAddresses() {
  try {
    const saved = JSON.parse(localStorage.getItem(SHARED_ADDRESS_STORAGE_KEY) || "[]");
    if (!Array.isArray(saved) || saved.some((address) => typeof address !== "string")) {
      throw new Error("Danh sách khu vực được chia sẻ không hợp lệ.");
    }
    const savedAddressKeys = new Set(savedAddresses.map((address) => address.toLocaleLowerCase("vi")));
    return uniqueStrings(saved).filter((address) => savedAddressKeys.has(address.toLocaleLowerCase("vi")));
  } catch (error) {
    console.error("Không thể đọc danh sách khu vực được chia sẻ:", error);
    showToast("Không đọc được phân loại khu vực đã lưu.");
    return [];
  }
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.reduce((unique, value) => {
    const text = value.trim();
    const key = text.toLocaleLowerCase("vi");
    if (text && !seen.has(key)) {
      seen.add(key);
      unique.push(text);
    }
    return unique;
  }, []);
}

function createCustomerShareFile() {
  const areas = uniqueStrings([
    ...savedAddresses,
    ...customers.map((customer) => customer.address || ""),
  ]);
  const bundle = {
    format: "hoa-tieu-customer-share",
    version: 1,
    exportedAt: new Date().toISOString(),
    customers: customers.map(({ alertedDates, ...customer }) => customer),
    areas,
  };
  const date = localDateKey();
  return new File(
    [JSON.stringify(bundle, null, 2)],
    `hoa-tieu-khach-hang-${date}.json`,
    { type: "application/json" },
  );
}

async function shareCustomerData() {
  const file = createCustomerShareFile();
  if (navigator.share && navigator.canShare) {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Thông tin khách hàng - Hoa Tiêu",
          text: "Tệp khách hàng và khu vực giao hàng.",
          files: [file],
        });
        showToast("Đã chia sẻ tệp dữ liệu.");
        return;
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Không thể mở chức năng chia sẻ:", error);
    }
  }

  const downloadUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast("Đã tải tệp dữ liệu. Hãy gửi tệp này cho người nhận.");
}

function parseCustomerShareFile(value) {
  const bundle = JSON.parse(value);
  if (bundle?.format !== "hoa-tieu-customer-share" || bundle.version !== 1) {
    throw new Error("Tệp không đúng định dạng chia sẻ của Hoa Tiêu.");
  }
  if (!Array.isArray(bundle.customers) || !Array.isArray(bundle.areas)) {
    throw new Error("Tệp chia sẻ thiếu danh sách khách hàng hoặc khu vực.");
  }
  if (bundle.customers.length > 10000 || bundle.areas.length > 2000) {
    throw new Error("Tệp có quá nhiều dữ liệu để nhập.");
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isValidDate = (date) => {
    if (typeof date !== "string" || !datePattern.test(date)) return false;
    const parsedDate = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsedDate.getTime())
      && parsedDate.toISOString().slice(0, 10) === date;
  };
  const importedCustomers = bundle.customers.map((customer, index) => {
    if (!customer || typeof customer !== "object"
      || typeof customer.id !== "string" || !customer.id.trim()
      || typeof customer.name !== "string" || !customer.name.trim()
      || typeof customer.phone !== "string"
      || typeof customer.address !== "string"
      || typeof customer.directionsNote !== "string"
      || !Array.isArray(customer.deliveryDates)
      || !Array.isArray(customer.deliveredDates)) {
      throw new Error(`Thông tin khách hàng thứ ${index + 1} không hợp lệ.`);
    }
    const phone = customer.phone.trim();
    const phoneDigits = normalizePhone(phone);
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      throw new Error(`Số điện thoại của khách hàng thứ ${index + 1} không hợp lệ.`);
    }
    if (customer.address.length > 180 || customer.name.length > 80
      || customer.directionsNote.length > 2000) {
      throw new Error(`Thông tin khách hàng thứ ${index + 1} vượt quá giới hạn cho phép.`);
    }
    const latitude = customer.latitude == null ? null : validCoordinate(customer.latitude, -90, 90);
    const longitude = customer.longitude == null ? null : validCoordinate(customer.longitude, -180, 180);
    if ((customer.latitude != null && latitude === null)
      || (customer.longitude != null && longitude === null)
      || ((latitude === null) !== (longitude === null))) {
      throw new Error(`Tọa độ của khách hàng thứ ${index + 1} không hợp lệ.`);
    }
    for (const dates of [customer.deliveryDates, customer.deliveredDates]) {
      if (dates.some((date) => !isValidDate(date))) {
        throw new Error(`Ngày giao của khách hàng thứ ${index + 1} không hợp lệ.`);
      }
    }
    return {
      id: customer.id.trim(),
      name: customer.name.trim(),
      phone,
      address: customer.address.trim(),
      latitude,
      longitude,
      deliveryDates: [...new Set(customer.deliveryDates)],
      deliveredDates: [...new Set(customer.deliveredDates)],
      directionsNote: customer.directionsNote,
    };
  });
  if (bundle.areas.some((area) => typeof area !== "string" || area.trim().length > 180)) {
    throw new Error("Danh sách khu vực trong tệp không hợp lệ.");
  }
  return {
    customers: importedCustomers,
    areas: uniqueStrings([
      ...bundle.areas,
      ...importedCustomers.map((customer) => customer.address),
    ]),
  };
}

function mergeImportedCustomer(existing, imported) {
  const existingNote = existing.directionsNote || "";
  const importedNote = imported.directionsNote || "";
  const mergedNotes = uniqueStrings([
    ...existingNote.split("\n—\n"),
    ...importedNote.split("\n—\n"),
  ]).join("\n—\n");
  if (mergedNotes.length > 2000) {
    throw new Error(`Ghi chú chỉ đường của khách "${existing.name}" quá dài để gộp an toàn.`);
  }
  return {
    ...existing,
    name: existing.name || imported.name,
    phone: existing.phone || imported.phone,
    address: existing.address || imported.address,
    latitude: getCustomerCoordinates(existing)?.latitude ?? imported.latitude,
    longitude: getCustomerCoordinates(existing)?.longitude ?? imported.longitude,
    deliveryDates: [...new Set([...existing.deliveryDates, ...imported.deliveryDates])],
    deliveredDates: [...new Set([...existing.deliveredDates, ...imported.deliveredDates])],
    directionsNote: mergedNotes,
  };
}

function persistImportedData(nextCustomers, nextAddresses, nextSharedAddresses) {
  const previousCustomers = localStorage.getItem(STORAGE_KEY);
  const previousAddresses = localStorage.getItem(ADDRESS_STORAGE_KEY);
  const previousSharedAddresses = localStorage.getItem(SHARED_ADDRESS_STORAGE_KEY);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCustomers));
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(nextAddresses));
    localStorage.setItem(SHARED_ADDRESS_STORAGE_KEY, JSON.stringify(nextSharedAddresses));
    return true;
  } catch (error) {
    console.error("Không thể lưu dữ liệu được chia sẻ:", error);
    try {
      if (previousCustomers === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previousCustomers);
      if (previousAddresses === null) localStorage.removeItem(ADDRESS_STORAGE_KEY);
      else localStorage.setItem(ADDRESS_STORAGE_KEY, previousAddresses);
      if (previousSharedAddresses === null) localStorage.removeItem(SHARED_ADDRESS_STORAGE_KEY);
      else localStorage.setItem(SHARED_ADDRESS_STORAGE_KEY, previousSharedAddresses);
    } catch (rollbackError) {
      console.error("Không thể khôi phục dữ liệu sau khi nhập thất bại:", rollbackError);
    }
    showToast("Không thể nhập dữ liệu. Bộ nhớ thiết bị có thể đã đầy.");
    return false;
  }
}

async function importSharedCustomerData() {
  const [file] = elements.sharedDataFile.files || [];
  if (!file) return;
  elements.sharedDataError.hidden = true;
  try {
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Tệp chia sẻ vượt quá dung lượng 10 MB.");
    }
    const imported = parseCustomerShareFile(await file.text());
    const nextCustomers = customers.map((customer) => ({ ...customer }));
    const customersByPhone = new Map(
      nextCustomers.map((customer) => [normalizePhone(customer.phone), customer]),
    );
    let addedCustomers = 0;
    let mergedCustomers = 0;
    for (const importedCustomer of imported.customers) {
      const existing = customersByPhone.get(normalizePhone(importedCustomer.phone));
      if (existing) {
        Object.assign(existing, mergeImportedCustomer(existing, importedCustomer));
        mergedCustomers += 1;
      } else {
        const customer = { ...importedCustomer };
        if (nextCustomers.some((entry) => entry.id === customer.id)) {
          customer.id = crypto.randomUUID();
        }
        nextCustomers.push(customer);
        customersByPhone.set(normalizePhone(customer.phone), customer);
        addedCustomers += 1;
      }
    }
    const nextAddresses = uniqueStrings([...savedAddresses, ...imported.areas]);
    const savedAddressKeys = new Set(savedAddresses.map((address) => address.toLocaleLowerCase("vi")));
    const nextSharedAddresses = uniqueStrings([
      ...sharedAddresses,
      ...imported.areas.filter((address) => !savedAddressKeys.has(address.toLocaleLowerCase("vi"))),
    ]);
    const addedAreas = nextAddresses.length - savedAddresses.length;
    if (!window.confirm(
      `Tệp có ${imported.customers.length} khách và ${imported.areas.length} khu vực.\n`
      + `Sẽ thêm ${addedCustomers} khách mới, gộp ${mergedCustomers} khách trùng số điện thoại `
      + `và thêm ${addedAreas} khu vực. Thông tin đã có trên thiết bị được ưu tiên nếu bị khác nhau.\n\n`
      + "Bạn có muốn tiếp tục nhập không?",
    )) return;
    if (!persistImportedData(nextCustomers, nextAddresses, nextSharedAddresses)) return;

    customers = nextCustomers;
    savedAddresses = nextAddresses;
    sharedAddresses = nextSharedAddresses;
    renderSavedAddresses();
    renderAddressOptions();
    renderAreaOptions();
    renderCustomers();
    showToast(`Đã nhập ${addedCustomers} khách mới và ${addedAreas} khu vực.`);
  } catch (error) {
    console.error("Không thể nhập tệp chia sẻ:", error);
    elements.sharedDataError.textContent = error.message || "Không thể đọc tệp chia sẻ.";
    elements.sharedDataError.hidden = false;
  } finally {
    elements.sharedDataFile.value = "";
  }
}

function renderSearchResults(query, phoneDigits, matches, today) {
  const isOpen = Boolean(query);
  elements.searchResults.hidden = !isOpen;
  elements.search.setAttribute("aria-expanded", String(isOpen));
  if (!isOpen) {
    elements.searchResults.innerHTML = "";
    return;
  }
  if (!phoneDigits) {
    elements.searchResults.innerHTML = '<p class="search-results-message">Nhập số điện thoại để tìm khách hàng.</p>';
    return;
  }
  if (!matches.length) {
    const canAdd = phoneDigits.length >= 7 && phoneDigits.length <= 15;
    elements.searchResults.innerHTML = `<p class="search-results-message">${canAdd
      ? "Chưa có khách hàng này."
      : "Số điện thoại cần có từ 7 đến 15 chữ số."}</p>
      ${canAdd
        ? '<button class="search-result-add" type="button" data-action="add-customer">＋ Thêm khách hàng vào danh sách hôm nay</button>'
        : ""}`;
    return;
  }

  elements.searchResults.innerHTML = matches.map((customer) => {
    const isScheduled = customer.deliveryDates.includes(today);
    const isDelivered = customer.deliveredDates.includes(today);
    return `<article class="search-result-item">
      <div class="search-result-info">
        <strong>${escapeHtml(customer.name)}</strong>
        <span>${escapeHtml(customer.phone || "")}${customer.address ? ` · ${escapeHtml(customer.address)}` : ""}</span>
      </div>
      ${isScheduled
        ? `<span class="search-result-status">${isDelivered ? "Đã giao hôm nay" : "Đã thêm hôm nay"}</span>`
        : `<button class="search-result-add" type="button" data-action="add-today" data-id="${escapeHtml(customer.id)}">＋ Thêm vào danh sách giao hàng</button>`}
    </article>`;
  }).join("");
}

function updateNearestDeliveryAlert() {
  const today = localDateKey();
  const nearest = currentPosition
    ? customers
      .filter((customer) =>
        customer.deliveryDates.includes(today)
        && !customer.deliveredDates.includes(today)
        && getCustomerCoordinates(customer),
      )
      .map((customer) => ({
        customer,
        meters: distanceMeters(currentPosition, getCustomerCoordinates(customer)),
      }))
      .sort((first, second) => first.meters - second.meters)[0]
    : null;

  if (!nearest || nearest.meters > CURRENT_DELIVERY_METERS) {
    elements.nearestDeliveryAlert.hidden = true;
    document.body.classList.remove("has-nearest-alert");
    elements.nearestDeliveryAction.removeAttribute("data-id");
    return;
  }

  elements.nearestDeliveryMessage.textContent =
    `${nearest.customer.name} · cách bạn ${formatDistance(nearest.meters)}.`;
  elements.nearestDeliveryAction.dataset.id = nearest.customer.id;
  elements.nearestDeliveryAlert.hidden = false;
  document.body.classList.add("has-nearest-alert");
}

function updateAreaExitAlert() {
  const customer = customers.find((entry) => entry.id === areaExitCustomerId);
  const today = localDateKey();
  const isPendingToday = customer
    && customer.deliveryDates.includes(today)
    && !customer.deliveredDates.includes(today);
  const coordinates = customer && getCustomerCoordinates(customer);
  if (!isPendingToday || !coordinates || !currentPosition) {
    areaExitCustomerId = null;
    dismissedAreaExitCustomerId = null;
  } else if (distanceMeters(currentPosition, coordinates) <= AREA_TRACKING_METERS) {
    areaExitCustomerId = null;
    dismissedAreaExitCustomerId = null;
  }

  const visibleCustomer = customers.find((entry) =>
    entry.id === areaExitCustomerId
    && entry.id !== dismissedAreaExitCustomerId,
  );
  elements.areaExitAlert.hidden = !visibleCustomer;
  document.body.classList.toggle("has-area-exit-alert", Boolean(visibleCustomer));
  if (visibleCustomer) {
    elements.areaExitMessage.textContent = `Bạn đã cách ${visibleCustomer.name} hơn ${AREA_TRACKING_METERS} m.`;
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

function getAddressGroups(selectedAddress = "") {
  const sharedAddressKeys = new Set(sharedAddresses.map((address) => address.toLocaleLowerCase("vi")));
  const ownAddresses = savedAddresses.filter((address) =>
    !sharedAddressKeys.has(address.toLocaleLowerCase("vi")),
  );
  const otherAddresses = savedAddresses.filter((address) =>
    sharedAddressKeys.has(address.toLocaleLowerCase("vi")),
  );
  if (selectedAddress && !savedAddresses.includes(selectedAddress)) ownAddresses.push(selectedAddress);
  return [
    { label: "Người dùng (của bạn)", addresses: ownAddresses },
    { label: "Người dùng khác", addresses: otherAddresses },
  ];
}

function renderAddressOptions(selectedAddress = "") {
  const options = ['<option value="">Chọn khu vực có sẵn (không bắt buộc)</option>'];
  for (const group of getAddressGroups(selectedAddress)) {
    if (!group.addresses.length) continue;
    options.push(`<optgroup label="${group.label}">`);
    for (const address of group.addresses) {
      const isSaved = savedAddresses.includes(address);
      const suffix = selectedAddress === address && !isSaved ? " (đã lưu)" : "";
      options.push(`<option value="${escapeHtml(address)}">${escapeHtml(address)}${suffix}</option>`);
    }
    options.push("</optgroup>");
  }
  elements.addressSelect.innerHTML = options.join("");
  elements.addressSelect.value = selectedAddress;
  elements.addressHint.textContent = savedAddresses.length
    ? "Có thể thêm hoặc sửa danh sách khu vực trong Cài đặt."
    : "Chưa có khu vực. Hãy thêm trong Cài đặt để chọn tại đây.";
}

function renderAreaOptions(selectedArea = elements.areaFilter.value) {
  const options = ['<option value="">Tất cả khu vực</option>'];
  for (const group of getAddressGroups()) {
    if (!group.addresses.length) continue;
    options.push(`<optgroup label="${group.label}">`);
    for (const address of group.addresses) {
      options.push(`<option value="${escapeHtml(address)}">${escapeHtml(address)}</option>`);
    }
    options.push("</optgroup>");
  }
  elements.areaFilter.innerHTML = options.join("");
  elements.areaFilter.value = savedAddresses.includes(selectedArea) ? selectedArea : "";
}

function renderSavedAddresses() {
  const groups = getAddressGroups().filter((group) => group.addresses.length);
  elements.savedAddresses.innerHTML = groups.length
    ? groups.map((group) => `<li class="saved-address-group">${group.label}</li>${group.addresses.map((address) => {
      const index = savedAddresses.indexOf(address);
      return `<li class="saved-address">
        <span>${escapeHtml(address)}</span>
        <button class="small-action" type="button" data-action="remove-address" data-index="${index}" aria-label="Xóa khu vực ${escapeHtml(address)}">×</button>
      </li>`;
    }).join("")}`).join("")
    : '<li class="address-empty">Chưa có khu vực. Thêm khu vực thường giao ở phía trên.</li>';
}

function renderCustomers() {
  updateDeliveryMap();
  updateNearestDeliveryAlert();
  updateAreaExitAlert();

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
  const pendingCount = scheduled.length - deliveredCount;
  const matchesDeliveryFilter = (customer) => {
    const isDelivered = customer.deliveredDates.includes(today);
    return activeDeliveryFilter === "all"
      || (activeDeliveryFilter === "delivered" && isDelivered)
      || (activeDeliveryFilter === "pending" && !isDelivered);
  };
  const matches = phoneDigits
    ? customers.filter((customer) =>
      normalizePhone(customer.phone).includes(phoneDigits) && inSelectedArea(customer),
    )
    : [];
  renderSearchResults(query, phoneDigits, matches, today);
  const visible = [...scheduled.filter(matchesDeliveryFilter)];
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
  elements.deliveredFilterCount.textContent = deliveredCount;
  elements.pendingFilterCount.textContent = pendingCount;
  elements.allFilterCount.textContent = scheduled.length;
  elements.summary.textContent = activeDeliveryFilter === "all"
    ? `${scheduled.length} đơn hôm nay · ${deliveredCount} đã giao`
    : activeDeliveryFilter === "delivered"
      ? `${deliveredCount} đơn đã giao hôm nay`
      : `${pendingCount} đơn chưa giao hôm nay`;
  elements.empty.hidden = visible.length > 0;
  elements.emptyAddButton.hidden = true;
  if (visible.length === 0 && activeDeliveryFilter !== "all") {
    elements.emptyTitle.textContent = activeDeliveryFilter === "delivered"
      ? "Chưa có đơn nào đã giao"
      : "Không còn đơn chưa giao";
    elements.emptyDescription.textContent = "Đổi bộ lọc trạng thái để xem các đơn hàng khác trong hôm nay.";
  } else {
    elements.emptyTitle.textContent = "Hôm nay chưa có khách cần giao";
    elements.emptyDescription.textContent = "Nhập số điện thoại ở ô phía trên để tìm và thêm khách vào danh sách hôm nay.";
  }

  elements.list.innerHTML = visible.map((customer) => {
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

    return `<article class="customer-card">
      <div class="customer-avatar" aria-hidden="true">${escapeHtml((customer.name || "?").trim().charAt(0).toLocaleUpperCase("vi"))}</div>
      <div class="customer-info">
        <p class="customer-name">${escapeHtml(customer.name)}</p>
        <div class="customer-meta">
          ${phone ? `<a href="tel:${escapeHtml(phone)}">${escapeHtml(customer.phone)}</a>` : ""}
          ${customer.address ? `<span>${escapeHtml(customer.address)}</span>` : ""}
          ${mapUrl ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer">Mở bản đồ ↗</a>` : ""}
        </div>
        ${distance}
        ${!coordinates
          ? `<label class="directions-note-field">
              <span>Ghi chú chỉ đường</span>
              <textarea data-action="save-directions-note" data-id="${escapeHtml(customer.id)}" maxlength="2000" rows="2" placeholder="Ví dụ: cổng màu xanh, vào hẻm bên trái…">${escapeHtml(customer.directionsNote)}</textarea>
            </label>`
          : ""}
      </div>
      <div class="customer-actions">
        <button class="delivery-toggle ${isDelivered ? "is-delivered" : "is-added"}" type="button" data-action="${isDelivered ? "undo-delivered" : "mark-delivered"}" data-id="${escapeHtml(customer.id)}">${isDelivered ? "✓ Đã giao · Hoàn tác" : "Đã giao đơn hàng"}</button>
        <button class="small-action" type="button" data-action="remove-today" data-id="${escapeHtml(customer.id)}" aria-label="Bỏ ${escapeHtml(customer.name)} khỏi danh sách hôm nay">×</button>
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

function useContactDetails(name, phone) {
  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim().replace(/^tel:/i, "");
  const phoneDigits = normalizePhone(cleanPhone);
  elements.contactImportError.hidden = true;
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    elements.contactImportError.textContent = "Liên hệ không có số điện thoại hợp lệ (cần từ 7 đến 15 chữ số).";
    elements.contactImportError.hidden = false;
    return;
  }

  const existing = customers.find((customer) =>
    normalizePhone(customer.phone) === phoneDigits,
  );
  const today = localDateKey();
  if (existing) {
    if (existing.deliveryDates.includes(today)) {
      showToast(`${existing.name} đã có trong danh sách giao hôm nay.`);
      return;
    }
    existing.deliveryDates.push(today);
    if (!saveCustomers()) {
      existing.deliveryDates = existing.deliveryDates.filter((date) => date !== today);
      return;
    }
    elements.settingsDialog.close();
    renderCustomers();
    showToast(`Đã thêm ${existing.name} vào danh sách giao hôm nay.`);
    return;
  }

  elements.settingsDialog.close();
  openCustomerDialog(cleanPhone);
  document.querySelector("#customer-name").value = cleanName;
  if (!cleanName) {
    const formError = document.querySelector("#form-error");
    formError.textContent = "Liên hệ chưa có tên. Hãy nhập tên khách hàng trước khi thêm.";
    formError.hidden = false;
    return;
  }
  showToast("Đã điền thông tin liên hệ. Kiểm tra rồi chọn Thêm vào hôm nay.");
}

function parseSingleVCard(value) {
  const records = value.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) || [];
  if (records.length !== 1) {
    throw new Error("Hãy chọn tệp .vcf chỉ chứa một liên hệ.");
  }
  const lines = [];
  for (const line of records[0].split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  const unescapeValue = (text) => text
    .replace(/\\[nN]/g, " ")
    .replace(/\\([,;\\])/g, "$1")
    .trim();
  let name = "";
  let phone = "";
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const property = line.slice(0, separator).split(";")[0].split(".").pop().toUpperCase();
    const content = unescapeValue(line.slice(separator + 1));
    if (property === "FN" && !name) name = content;
    if (property === "TEL" && !phone) phone = content;
  }
  if (!name || !phone) {
    throw new Error("Tệp .vcf cần có tên và số điện thoại của liên hệ.");
  }
  return { name, phone };
}

async function selectContact() {
  if (navigator.contacts?.select) {
    try {
      const [contact] = await navigator.contacts.select(["name", "tel"], { multiple: false });
      if (!contact) return;
      useContactDetails(contact.name?.[0], contact.tel?.[0]);
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Không thể chọn liên hệ:", error);
      showToast("Không mở được danh bạ. Hãy thử chọn tệp .vcf.");
      elements.contactFile.click();
    }
    return;
  }
  elements.contactFile.click();
}

async function importContactFile() {
  const [file] = elements.contactFile.files || [];
  if (!file) return;
  try {
    const contact = parseSingleVCard(await file.text());
    useContactDetails(contact.name, contact.phone);
  } catch (error) {
    console.error("Không thể nhập liên hệ từ tệp:", error);
    elements.contactImportError.textContent = error.message || "Không thể đọc tệp danh bạ.";
    elements.contactImportError.hidden = false;
  } finally {
    elements.contactFile.value = "";
  }
}

function refreshForNewDay() {
  const today = localDateKey();
  if (today === activeDate) return;
  activeDate = today;
  elements.search.value = "";
  areaTrackedCustomerId = null;
  areaExitCustomerId = null;
  dismissedAreaExitCustomerId = null;
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
  areaTrackedCustomerId = null;
  elements.trackingButton.textContent = "Bật theo dõi";
  elements.trackingButton.classList.remove("is-active");
  elements.trackingButton.disabled = false;
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

function checkNearbyCustomers(position) {
  const current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  const today = localDateKey();
  currentPosition = current;
  elements.locationReadout.textContent = `Vị trí cập nhật lúc ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.`;

  const trackedAreaCustomers = [];
  for (const customer of customers) {
    if (!customer.deliveryDates.includes(today)
      || customer.deliveredDates.includes(today)) continue;
    const coordinates = getCustomerCoordinates(customer);
    if (!coordinates) continue;
    const meters = distanceMeters(current, coordinates);
    if (meters <= AREA_TRACKING_METERS) trackedAreaCustomers.push({ customer, meters });
  }

  trackedAreaCustomers.sort((first, second) => first.meters - second.meters);
  const nextAreaCustomer = trackedAreaCustomers[0]?.customer;
  const previousCustomer = customers.find((customer) =>
    customer.id === areaTrackedCustomerId
    && customer.deliveryDates.includes(today)
    && !customer.deliveredDates.includes(today),
  );
  if (previousCustomer && nextAreaCustomer?.id !== previousCustomer.id) {
    const previousCoordinates = getCustomerCoordinates(previousCustomer);
    if (previousCoordinates
      && distanceMeters(current, previousCoordinates) > AREA_TRACKING_METERS) {
      areaExitCustomerId = previousCustomer.id;
    }
  }
  areaTrackedCustomerId = nextAreaCustomer?.id || null;
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
        ? `Đang theo dõi · Cập nhật khách gần nhất trong phạm vi ${CURRENT_DELIVERY_METERS} m; báo khi rời xa khách đang theo dõi hơn ${AREA_TRACKING_METERS} m.`
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
  elements.trackingButton.textContent = "Đang theo dõi vị trí";
  elements.trackingButton.classList.add("is-active");
  elements.trackingButton.disabled = true;
  updateTrackingStatus("Đang theo dõi vị trí trực tiếp.");
}

renderCustomers();
renderAddressOptions();
renderAreaOptions();
renderSavedAddresses();

document.querySelector("#empty-add-button").addEventListener("click", () => openCustomerDialog(elements.search.value.trim()));
document.querySelector("#settings-button").addEventListener("click", () => {
  elements.contactImportError.hidden = true;
  elements.sharedDataError.hidden = true;
  elements.settingsDialog.showModal();
});
document.querySelector("#close-settings-button").addEventListener("click", () => elements.settingsDialog.close());
document.querySelector("#close-dialog-button").addEventListener("click", () => elements.dialog.close());
document.querySelector("#cancel-dialog-button").addEventListener("click", () => elements.dialog.close());
elements.contactPickerButton.addEventListener("click", () => void selectContact());
elements.contactFile.addEventListener("change", () => void importContactFile());
elements.shareCustomerDataButton.addEventListener("click", () => void shareCustomerData());
elements.importCustomerDataButton.addEventListener("click", () => elements.sharedDataFile.click());
elements.sharedDataFile.addEventListener("change", () => void importSharedCustomerData());
elements.search.addEventListener("input", renderCustomers);
elements.searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "add-customer") {
    openCustomerDialog(normalizePhone(elements.search.value));
    return;
  }

  if (button.dataset.action !== "add-today") return;
  const customer = customers.find((entry) => entry.id === button.dataset.id);
  if (!customer) return;
  const today = localDateKey();
  if (customer.deliveryDates.includes(today)) return;
  customer.deliveryDates.push(today);
  if (saveCustomers()) {
    renderCustomers();
    showToast("Đã thêm khách vào danh sách giao hôm nay.");
  } else {
    customer.deliveryDates = customer.deliveryDates.filter((date) => date !== today);
  }
});
elements.search.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.search.value) {
    elements.search.value = "";
    renderCustomers();
  }
});
elements.areaFilter.addEventListener("change", renderCustomers);
elements.nearestDeliveryAction.addEventListener("click", () => {
  const customer = customers.find((entry) => entry.id === elements.nearestDeliveryAction.dataset.id);
  if (customer) void markDelivered(customer, elements.nearestDeliveryAction);
});
elements.areaExitDismiss.addEventListener("click", () => {
  dismissedAreaExitCustomerId = areaExitCustomerId;
  updateAreaExitAlert();
});
elements.deliveryFilters.forEach((button) => {
  button.addEventListener("click", () => {
    activeDeliveryFilter = button.dataset.statusFilter;
    elements.deliveryFilters.forEach((filterButton) => {
      const selected = filterButton === button;
      filterButton.classList.toggle("is-active", selected);
      filterButton.setAttribute("aria-pressed", String(selected));
    });
    renderCustomers();
  });
});
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
  if (!window.confirm(`Xóa "${address}" khỏi danh sách khu vực? Khu vực đã lưu trên khách hàng sẽ không bị thay đổi.`)) return;

  const sharedIndex = sharedAddresses.findIndex((entry) =>
    entry.toLocaleLowerCase("vi") === address.toLocaleLowerCase("vi"),
  );
  savedAddresses.splice(index, 1);
  if (sharedIndex >= 0) sharedAddresses.splice(sharedIndex, 1);
  if (!saveAddresses()) {
    savedAddresses.splice(index, 0, address);
    if (sharedIndex >= 0) sharedAddresses.splice(sharedIndex, 0, address);
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
