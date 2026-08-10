const STORAGE_KEY = "tmt-hours-scheduler-v1";
const SESSION_KEY = "tmt-hours-session-v1";
const DATA_FILE = "data.json";
const DEFAULT_MANAGER_PASSWORDS = ["manager1", "Maple!1997DS"];
const MANAGER2_PASSWORD = "Maple!1997DS";
const WEEK_HOUR_CAP = 40;

let state = loadState();
let session = null;
let weekAnchor = startOfWeek(new Date());
let weekSort = "high";
let weekDetailDate = "all";
let editingJobGroupId = null;
let pendingTruckCrew = null;
let focusedEmployeeId = null;
let truckCount = 1;
let truckCrew = [emptyTruck()];
let appBooted = false;
let publishedUpdatedAt = null;
let localUpdatedAt = Number(localStorage.getItem(`${STORAGE_KEY}-updatedAt`)) || 0;

function emptyTruck() {
  return { driverId: "", moverIds: [], search: "" };
}

function isManager() {
  return session?.role === "manager";
}

function isManager2() {
  return session?.role === "manager" && session?.managerIndex === 2;
}

function isEmployeeUser() {
  return session?.role === "employee";
}

function isLoggedIn() {
  return Boolean(session?.role);
}

function currentEmployeeId() {
  return session?.role === "employee" ? session.employeeId : null;
}

const els = {
  loginGate: document.getElementById("login-gate"),
  appShell: document.getElementById("app-shell"),
  loginForm: document.getElementById("login-form"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),
  logoutBtn: document.getElementById("logout-btn"),
  sessionLabel: document.getElementById("session-label"),
  tabs: document.querySelectorAll(".tab"),
  panels: {
    log: document.getElementById("panel-log"),
    week: document.getElementById("panel-week"),
    employee: document.getElementById("panel-employee"),
    crew: document.getElementById("panel-crew"),
  },
  logForm: document.getElementById("log-form"),
  editBanner: document.getElementById("edit-banner"),
  logSubmit: document.getElementById("log-submit"),
  logCancel: document.getElementById("log-cancel"),
  truckCountBtns: document.getElementById("truck-count-btns"),
  truckPanels: document.getElementById("truck-panels"),
  crewPickedCount: document.getElementById("crew-picked-count"),
  date: document.getElementById("date"),
  dateLabel: document.getElementById("date-label"),
  endDateRow: document.getElementById("end-date-row"),
  endDate: document.getElementById("end-date"),
  jobType: document.getElementById("job-type"),
  estimateRow: document.getElementById("estimate-row"),
  estimate: document.getElementById("estimate"),
  ldNote: document.getElementById("ld-note"),
  nbOnlyNote: document.getElementById("nb-only-note"),
  jobNote: document.getElementById("job-note"),
  nbToggle: document.getElementById("nb-toggle"),
  nbFields: document.getElementById("nb-fields"),
  nbHours: document.getElementById("nb-hours"),
  nbReason: document.getElementById("nb-reason"),
  entriesList: document.getElementById("entries-list"),
  weekPrev: document.getElementById("week-prev"),
  weekNext: document.getElementById("week-next"),
  weekToday: document.getElementById("week-today"),
  weekSort: document.getElementById("week-sort"),
  weekDetailDate: document.getElementById("week-detail-date"),
  weekRange: document.getElementById("week-range"),
  weekSummary: document.getElementById("week-summary"),
  weekDetail: document.getElementById("week-detail"),
  clearWeekBtn: document.getElementById("clear-week-btn"),
  deleteAllJobsBtn: document.getElementById("delete-all-jobs-btn"),
  employeePanelTitle: document.getElementById("employee-panel-title"),
  employeePanelCopy: document.getElementById("employee-panel-copy"),
  employeePickerWrap: document.getElementById("employee-picker-wrap"),
  employeeFocusSearch: document.getElementById("employee-focus-search"),
  employeeFocusResults: document.getElementById("employee-focus-results"),
  employeeFocusView: document.getElementById("employee-focus-view"),
  managerPassForm: document.getElementById("manager-pass-form"),
  managerPass1: document.getElementById("manager-pass-1"),
  managerPass2: document.getElementById("manager-pass-2"),
  crewForm: document.getElementById("crew-form"),
  newName: document.getElementById("new-name"),
  newRole: document.getElementById("new-role"),
  newPassword: document.getElementById("new-password"),
  crewList: document.getElementById("crew-list"),
  toast: document.getElementById("toast"),
  syncStatus: document.getElementById("sync-status"),
  syncStatusApp: document.getElementById("sync-status-app"),
  publishDownloadBtn: document.getElementById("publish-download-btn"),
  publishImportInput: document.getElementById("publish-import-input"),
};

init();

async function init() {
  els.loginForm.addEventListener("submit", onLoginSubmit);
  els.logoutBtn.addEventListener("click", onLogout);

  setSyncStatus("local", "Loading shop data…");
  await loadPublishedData();
  refreshPublishStatus();

  session = loadSession();
  if (!isLoggedIn()) {
    showLogin();
    return;
  }

  bootApp();
}

function setSyncStatus(kind, label) {
  const className =
    kind === "live" ? "sync-live" : kind === "error" ? "sync-error" : "sync-local";
  [els.syncStatus, els.syncStatusApp].forEach((el) => {
    if (!el) return;
    el.textContent = label;
    el.className = `sync-status ${className}`;
    if (el === els.syncStatusApp) el.hidden = false;
  });
}

function refreshPublishStatus() {
  if (publishedUpdatedAt && localUpdatedAt <= publishedUpdatedAt) {
    const when = formatPublishTime(publishedUpdatedAt);
    setSyncStatus(
      "live",
      when
        ? `Published shop data (${when}) — employees see this after refresh`
        : "Published shop data loaded"
    );
    return;
  }
  if (state.employees.length || state.entries.length) {
    setSyncStatus(
      "local",
      "Local changes not published yet — Crew tab → Download data.json → upload to GitHub"
    );
    return;
  }
  setSyncStatus(
    "local",
    "No published data yet — add crew/jobs, then download data.json and upload to GitHub"
  );
}

function formatPublishTime(ms) {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

function normalizeSettings(settings) {
  const passwords = settings?.managerPasswords;
  const manager1 =
    Array.isArray(passwords) && passwords.length >= 1
      ? String(passwords[0] || DEFAULT_MANAGER_PASSWORDS[0])
      : DEFAULT_MANAGER_PASSWORDS[0];
  return {
    managerPasswords: [manager1 || DEFAULT_MANAGER_PASSWORDS[0], MANAGER2_PASSWORD],
  };
}

function applyShopPayload(payload, { fromPublishFile = false } = {}) {
  if (!payload || typeof payload !== "object") return false;
  state.employees = Array.isArray(payload.employees) ? payload.employees : [];
  state.entries = Array.isArray(payload.entries) ? payload.entries : [];
  state.settings = normalizeSettings(payload.settings);
  const stamp = Number(payload.updatedAt) || Date.now();
  if (fromPublishFile) {
    publishedUpdatedAt = stamp;
    localUpdatedAt = stamp;
  } else {
    localUpdatedAt = stamp;
  }
  migrateEmployeeRoles({ persist: false });
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      employees: state.employees,
      entries: state.entries,
      settings: state.settings,
    })
  );
  localStorage.setItem(`${STORAGE_KEY}-updatedAt`, String(localUpdatedAt));
  if (appBooted) {
    applyAccessControl();
    renderAll();
  }
  refreshPublishStatus();
  return true;
}

function buildPublishPayload() {
  return {
    employees: state.employees,
    entries: state.entries,
    settings: state.settings,
    updatedAt: Date.now(),
  };
}

async function loadPublishedData() {
  try {
    const response = await fetch(`${DATA_FILE}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      refreshPublishStatus();
      return;
    }
    const payload = await response.json();
    const hasData =
      (Array.isArray(payload.employees) && payload.employees.length) ||
      (Array.isArray(payload.entries) && payload.entries.length) ||
      payload.settings;
    if (!hasData) {
      publishedUpdatedAt = Number(payload.updatedAt) || 0;
      refreshPublishStatus();
      return;
    }
    const remoteStamp = Number(payload.updatedAt) || 0;
    // Prefer newer local edits on this device; otherwise use published file
    if (localUpdatedAt && localUpdatedAt > remoteStamp) {
      publishedUpdatedAt = remoteStamp;
      refreshPublishStatus();
      return;
    }
    applyShopPayload(payload, { fromPublishFile: true });
  } catch {
    // Opening as a local file:// page often can't fetch data.json — localStorage still works
    refreshPublishStatus();
  }
}

function onPublishDownload() {
  if (!isManager()) return;
  const payload = buildPublishPayload();
  localUpdatedAt = payload.updatedAt;
  localStorage.setItem(`${STORAGE_KEY}-updatedAt`, String(localUpdatedAt));
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = DATA_FILE;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Downloaded data.json — replace the file in your GitHub repo, then wait ~1 min");
  refreshPublishStatus();
}

function onPublishImport(event) {
  if (!isManager()) return;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || ""));
      if (!applyShopPayload(payload, { fromPublishFile: false })) {
        showToast("That file doesn’t look like shop data");
        return;
      }
      showToast("Imported shop data into this browser");
    } catch {
      showToast("Could not read that file");
    }
  };
  reader.readAsText(file);
}

function showLogin() {
  els.loginGate.hidden = false;
  els.appShell.hidden = true;
  els.loginError.hidden = true;
  els.loginPassword.value = "";
  requestAnimationFrame(() => els.loginPassword.focus());
}

function bootApp() {
  els.loginGate.hidden = true;
  els.appShell.hidden = false;

  els.date.value = toInputDate(new Date());
  els.weekSort.value = weekSort;

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  els.date.addEventListener("change", () => {
    if (els.jobType.value === "ld") {
      if (!els.endDate.value || els.endDate.value < els.date.value) {
        els.endDate.value = els.date.value;
      }
    }
    renderTruckPanels();
  });
  els.endDate.addEventListener("change", () => renderTruckPanels());
  els.jobType.addEventListener("change", () => {
    syncJobTypeFields();
    renderTruckPanels();
  });
  els.estimate.addEventListener("input", () => renderTruckPanels());
  els.nbHours.addEventListener("input", () => renderTruckPanels());
  els.nbToggle.addEventListener("change", () => {
    els.nbFields.hidden = !els.nbToggle.checked;
    if (!els.nbToggle.checked) {
      els.nbHours.value = "";
      els.nbReason.value = "";
    } else {
      els.nbHours.focus();
    }
    renderTruckPanels();
  });
  els.truckCountBtns.addEventListener("click", onTruckCountClick);
  els.truckPanels.addEventListener("change", onTruckPanelChange);
  els.truckPanels.addEventListener("input", onTruckPanelInput);
  els.truckPanels.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("[data-truck-search]")) {
      event.preventDefault();
    }
  });

  els.logForm.addEventListener("submit", onLogSubmit);
  els.logCancel.addEventListener("click", cancelEdit);
  els.crewForm.addEventListener("submit", onCrewSubmit);
  els.managerPassForm.addEventListener("submit", onManagerPassSubmit);
  els.weekPrev.addEventListener("click", () => shiftWeek(-7));
  els.weekNext.addEventListener("click", () => shiftWeek(7));
  els.weekToday.addEventListener("click", () => {
    weekAnchor = startOfWeek(new Date());
    weekDetailDate = "all";
    renderWeek();
  });
  els.weekSort.addEventListener("change", () => {
    weekSort = els.weekSort.value;
    renderWeek();
  });
  els.weekDetailDate.addEventListener("change", () => {
    weekDetailDate = els.weekDetailDate.value;
    renderWeekDetailOnly();
  });
  els.clearWeekBtn.addEventListener("click", onClearWeek);
  els.deleteAllJobsBtn.addEventListener("click", onDeleteAllJobs);
  if (els.publishDownloadBtn) {
    els.publishDownloadBtn.addEventListener("click", onPublishDownload);
  }
  if (els.publishImportInput) {
    els.publishImportInput.addEventListener("change", onPublishImport);
  }

  els.entriesList.addEventListener("click", onEntriesClick);
  els.weekDetail.addEventListener("click", onEntriesClick);
  els.employeeFocusView.addEventListener("click", onEntriesClick);
  els.employeeFocusSearch.addEventListener("input", renderEmployeeFocusResults);
  els.employeeFocusResults.addEventListener("click", onEmployeeFocusSelect);
  els.crewList.addEventListener("click", onCrewDeleteClick);
  els.crewList.addEventListener("change", onCrewListChange);

  migrateEmployeeRoles();
  syncJobTypeFields();
  syncEditModeUi();
  applyAccessControl();
  appBooted = true;
  renderAll();
}

function onLoginSubmit(event) {
  event.preventDefault();
  const password = els.loginPassword.value;
  const managers = state.settings.managerPasswords;

  const managerIndex = managers.findIndex((p) => p === password);
  if (managerIndex !== -1) {
    session = { role: "manager", managerIndex: managerIndex + 1 };
    saveSession();
    els.loginError.hidden = true;
    location.reload();
    return;
  }

  const employee = state.employees.find(
    (e) => e.password && e.password === password
  );
  if (employee) {
    session = { role: "employee", employeeId: employee.id };
    saveSession();
    els.loginError.hidden = true;
    location.reload();
    return;
  }

  els.loginError.hidden = false;
  els.loginPassword.select();
}

function onLogout() {
  session = null;
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.role === "manager") {
      const idx = Number(parsed.managerIndex) === 2 ? 2 : 1;
      return { role: "manager", managerIndex: idx };
    }
    if (
      parsed.role === "employee" &&
      parsed.employeeId &&
      state.employees.some((e) => e.id === parsed.employeeId)
    ) {
      return { role: "employee", employeeId: parsed.employeeId };
    }
    return null;
  } catch {
    return null;
  }
}

function saveSession() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function applyAccessControl() {
  document.body.classList.toggle("is-manager", isManager());
  document.body.classList.toggle("is-employee-user", isEmployeeUser());

  document.querySelectorAll(".manager-only").forEach((el) => {
    if (isManager()) {
      el.classList.remove("access-hidden");
    } else {
      el.classList.add("access-hidden");
      if (el.matches(".panel")) el.hidden = true;
      if (el.matches(".tab")) el.classList.remove("is-active");
    }
  });

  if (isEmployeeUser()) {
    focusedEmployeeId = currentEmployeeId();
    els.employeePickerWrap.hidden = true;
    els.employeeFocusResults.hidden = true;
    els.employeePanelTitle.textContent = "My hours";
    els.employeePanelCopy.textContent =
      "Your jobs and hours by pay week. Ask a manager if something looks wrong.";
    els.sessionLabel.textContent = `Logged in: ${employeeName(currentEmployeeId())}`;
    const empTab = document.querySelector('.tab[data-tab="employee"]');
    if (empTab) empTab.textContent = "My Hours";
    switchTab("week");
  } else {
    els.employeePickerWrap.hidden = false;
    els.employeeFocusResults.hidden = false;
    els.employeePanelTitle.textContent = "Employee focus";
    els.employeePanelCopy.textContent =
      "Search someone and see their jobs and hours week by week. You can edit jobs from here too.";
    els.sessionLabel.textContent = `Logged in: Manager ${session.managerIndex || 1} · ${state.employees.length} on roster`;
    const empTab = document.querySelector('.tab[data-tab="employee"]');
    if (empTab) empTab.textContent = "Employee";
    els.managerPass1.value = state.settings.managerPasswords[0] || "";
    els.managerPass2.value = state.settings.managerPasswords[1] || "";
    els.managerPass2.readOnly = !isManager2();
    els.managerPass2.title = isManager2()
      ? ""
      : "Only Manager 2 can change this password";
    // Ensure Log Hours is the default visible manager panel
    if (els.panels.log) {
      els.panels.log.hidden = false;
      els.panels.log.classList.add("is-active");
    }
  }

  updateClearWeekButton();
}

function migrateEmployeeRoles({ persist = true } = {}) {
  let changed = false;
  state.employees = (state.employees || [])
    .filter((employee) => employee && (employee.name || employee.id))
    .map((employee) => {
      const next = { ...employee };
      if (!next.id) {
        next.id = crypto.randomUUID();
        changed = true;
      }
      if (!next.name || !String(next.name).trim()) {
        next.name = "Unnamed";
        changed = true;
      } else {
        next.name = String(next.name).trim();
      }
      if (next.role !== "mover" && next.role !== "driver") {
        next.role = "mover";
        changed = true;
      }
      if (next.password == null) {
        next.password = "";
        changed = true;
      }
      return next;
    });
  if (changed && persist) saveState();
  return changed;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        employees: [],
        entries: [],
        settings: {
          managerPasswords: [...DEFAULT_MANAGER_PASSWORDS],
        },
      };
    }
    const parsed = JSON.parse(raw);
    const passwords = parsed.settings?.managerPasswords;
    const manager1 =
      Array.isArray(passwords) && passwords.length >= 1
        ? String(passwords[0] || DEFAULT_MANAGER_PASSWORDS[0])
        : DEFAULT_MANAGER_PASSWORDS[0];
    return {
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      settings: {
        // Manager 2 password is fixed to the ops clear-week credential
        managerPasswords: [manager1 || DEFAULT_MANAGER_PASSWORDS[0], MANAGER2_PASSWORD],
      },
    };
  } catch {
    return {
      employees: [],
      entries: [],
      settings: {
        managerPasswords: [...DEFAULT_MANAGER_PASSWORDS],
      },
    };
  }
}

function saveState() {
  localUpdatedAt = Date.now();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      employees: state.employees,
      entries: state.entries,
      settings: state.settings,
    })
  );
  localStorage.setItem(`${STORAGE_KEY}-updatedAt`, String(localUpdatedAt));
  refreshPublishStatus();
}

function switchTab(name) {
  if (!isManager() && (name === "log" || name === "crew")) {
    name = "week";
  }

  els.tabs.forEach((tab) => {
    const tabName = tab.dataset.tab;
    const allowed = isManager() || (tabName !== "log" && tabName !== "crew");
    tab.classList.toggle("is-active", allowed && tabName === name);
  });
  Object.entries(els.panels).forEach(([key, panel]) => {
    const allowed = isManager() || (key !== "log" && key !== "crew");
    const active = allowed && key === name;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  if (name === "week") renderWeek();
  if (name === "employee") renderEmployeeFocus();
  if (name === "crew") renderCrew();
  if (name === "log") {
    try {
      renderTruckPanels();
      renderEntries();
    } catch (err) {
      console.error("Render failed (log):", err);
    }
  }
}

function syncJobTypeFields() {
  const type = els.jobType.value;
  const isLd = type === "ld";
  const isNbOnly = type === "nb";

  els.estimateRow.hidden = isLd || isNbOnly;
  els.ldNote.hidden = !isLd;
  els.nbOnlyNote.hidden = !isNbOnly;
  els.estimate.required = type === "local";
  els.endDateRow.hidden = !isLd;
  els.endDate.required = isLd;
  els.dateLabel.textContent = isLd ? "Start date" : "Date";

  if (isLd || isNbOnly) {
    els.estimate.value = "";
  }

  if (isLd && !els.endDate.value) {
    els.endDate.value = els.date.value;
  }
  if (!isLd) {
    els.endDate.value = "";
  }

  if (isNbOnly) {
    els.nbToggle.checked = true;
    els.nbFields.hidden = false;
    els.nbToggle.disabled = true;
  } else {
    els.nbToggle.disabled = false;
  }
}

function onTruckCountClick(event) {
  const btn = event.target.closest("[data-trucks]");
  if (!btn) return;
  setTruckCount(Number(btn.getAttribute("data-trucks")));
}

function setTruckCount(count) {
  const next = Math.min(5, Math.max(1, count));
  truckCount = next;
  while (truckCrew.length < next) truckCrew.push(emptyTruck());
  truckCrew = truckCrew.slice(0, next).map((truck) => ({
    driverId: truck.driverId || "",
    moverIds: [...(truck.moverIds || [])],
    search: truck.search || "",
  }));
  renderTruckPanels();
}

function onTruckPanelChange(event) {
  const driverSelect = event.target.closest("[data-truck-driver]");
  if (driverSelect) {
    const index = Number(driverSelect.getAttribute("data-truck-driver"));
    const value = driverSelect.value;
    if (value && isPersonAssignedElsewhere(value, index)) {
      showToast("That person is already on another truck");
      driverSelect.value = truckCrew[index].driverId;
      return;
    }
    truckCrew[index].driverId = value;
    // driver can't also be a mover on same truck
    truckCrew[index].moverIds = truckCrew[index].moverIds.filter((id) => id !== value);
    renderTruckPanels();
    return;
  }

  const moverCheck = event.target.closest("[data-truck-mover]");
  if (moverCheck) {
    const index = Number(moverCheck.getAttribute("data-truck-mover"));
    const employeeId = moverCheck.getAttribute("data-crew-id");
    const truck = truckCrew[index];
    if (moverCheck.checked) {
      if (isPersonAssignedElsewhere(employeeId, index) || truck.driverId === employeeId) {
        moverCheck.checked = false;
        showToast("That person is already assigned");
        return;
      }
      if (truck.moverIds.length >= 4) {
        moverCheck.checked = false;
        showToast("Max 4 movers per truck");
        return;
      }
      truck.moverIds.push(employeeId);
    } else {
      truck.moverIds = truck.moverIds.filter((id) => id !== employeeId);
    }
    updateCrewPickedCount();
    // re-render to update disabled states on other trucks
    renderTruckPanels();
  }
}

function onTruckPanelInput(event) {
  const search = event.target.closest("[data-truck-search]");
  if (!search) return;
  const index = Number(search.getAttribute("data-truck-search"));
  truckCrew[index].search = search.value;
  filterTruckPanel(index);
}

function isPersonAssignedElsewhere(employeeId, truckIndex) {
  return truckCrew.some((truck, i) => {
    if (i === truckIndex) return false;
    return truck.driverId === employeeId || truck.moverIds.includes(employeeId);
  });
}

function getCrewAssignments() {
  const assignments = [];
  truckCrew.forEach((truck, index) => {
    if (truck.driverId) {
      assignments.push({
        employeeId: truck.driverId,
        truckNumber: index + 1,
        jobRole: "driver",
      });
    }
    truck.moverIds.forEach((employeeId) => {
      assignments.push({
        employeeId,
        truckNumber: index + 1,
        jobRole: "mover",
      });
    });
  });
  return assignments;
}

function getSelectedCrewIds() {
  return getCrewAssignments().map((a) => a.employeeId);
}

function updateCrewPickedCount() {
  const count = getSelectedCrewIds().length;
  els.crewPickedCount.textContent = `${count} selected · ${truckCount} truck${truckCount === 1 ? "" : "s"}`;
}

function validateTruckCrew() {
  for (let i = 0; i < truckCrew.length; i++) {
    const truck = truckCrew[i];
    if (!truck.driverId) {
      return `Truck ${i + 1} needs a driver`;
    }
    if (truck.moverIds.length < 1) {
      return `Truck ${i + 1} needs at least 1 mover`;
    }
    if (truck.moverIds.length > 4) {
      return `Truck ${i + 1} can have at most 4 movers`;
    }
  }
  const ids = getSelectedCrewIds();
  if (new Set(ids).size !== ids.length) {
    return "Someone is assigned more than once";
  }
  return null;
}

function driversOnRoster() {
  return [...state.employees].sort((a, b) => {
    const rank = (e) => (e.role === "driver" ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

function moversOnRoster() {
  return [...state.employees].sort((a, b) => {
    const rank = (e) => (e.role === "mover" ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

function onLogSubmit(event) {
  event.preventDefault();
  if (!isManager()) {
    showToast("Managers only");
    return;
  }
  if (!state.employees.length) {
    showToast("Add a crew member first");
    switchTab("crew");
    return;
  }

  const truckError = validateTruckCrew();
  if (truckError) {
    showToast(truckError);
    return;
  }

  const assignments = getCrewAssignments();
  const type = els.jobType.value;
  const isLd = type === "ld";
  const isNbOnly = type === "nb";
  const estimatedHours = isLd || isNbOnly ? 0 : Number(els.estimate.value);
  const includeNb = els.nbToggle.checked || isNbOnly;
  const nonBillableHours = includeNb ? Number(els.nbHours.value || 0) : 0;

  if (type === "local" && (!Number.isFinite(estimatedHours) || estimatedHours <= 0)) {
    showToast("Enter estimated hours, or choose Non-billable only");
    return;
  }
  if (includeNb && (!Number.isFinite(nonBillableHours) || nonBillableHours <= 0)) {
    showToast(
      isNbOnly
        ? "Enter the non-billable hours"
        : "Enter non-billable hours or uncheck the option"
    );
    return;
  }

  const startDate = els.date.value;
  let endDate = startDate;
  if (isLd) {
    endDate = els.endDate.value || startDate;
    if (!endDate) {
      showToast("Enter the LD end date");
      return;
    }
    if (endDate < startDate) {
      showToast("LD end date must be on or after the start date");
      return;
    }
  }

  const jobType = isLd ? "ld" : isNbOnly ? "nb" : "local";
  const isEditing = Boolean(editingJobGroupId);
  const previousMembers = isEditing ? getJobMembers(editingJobGroupId) : [];
  const previous = previousMembers[0] || null;
  const jobGroupId = crypto.randomUUID();
  const createdAt = previous?.createdAt || new Date().toISOString();
  const shared = {
    jobGroupId,
    date: startDate,
    endDate: isLd ? endDate : startDate,
    jobType,
    estimatedHours,
    nonBillableHours,
    nonBillableReason: includeNb ? els.nbReason.value.trim() : "",
    jobNote: els.jobNote.value.trim(),
    truckCount,
    createdAt,
    updatedAt: new Date().toISOString(),
  };

  if (isEditing) {
    removeJobByKey(editingJobGroupId);
  }

  assignments.forEach((assignment) => {
    state.entries.push({
      id: crypto.randomUUID(),
      employeeId: assignment.employeeId,
      truckNumber: assignment.truckNumber,
      jobRole: assignment.jobRole,
      ...shared,
    });
  });

  saveState();
  clearLogForm({ keepEdit: false });
  renderAll();
  const label = isLd ? "LD job" : isNbOnly ? "Non-billable" : "Job";
  showToast(
    isEditing
      ? `${label} updated`
      : `${label} saved · ${truckCount} truck${truckCount === 1 ? "" : "s"} · ${assignments.length} crew`
  );
}

function clearLogForm({ keepEdit = false } = {}) {
  els.logForm.reset();
  els.date.value = toInputDate(new Date());
  els.endDate.value = "";
  els.jobType.value = "local";
  els.nbFields.hidden = true;
  els.nbToggle.disabled = false;
  pendingTruckCrew = null;
  truckCount = 1;
  truckCrew = [emptyTruck()];
  if (!keepEdit) {
    editingJobGroupId = null;
  }
  syncJobTypeFields();
  syncEditModeUi();
}

function syncEditModeUi() {
  const editing = Boolean(editingJobGroupId);
  els.editBanner.hidden = !editing;
  els.logCancel.hidden = !editing;
  els.logSubmit.textContent = editing ? "Update job" : "Save job";
  els.logForm.classList.toggle("is-editing", editing);
}

function startEditJob(jobKey) {
  if (!isManager()) {
    showToast("Managers only");
    return;
  }  const members = getJobMembers(jobKey);
  if (!members.length) {
    showToast("Could not find that job");
    return;
  }

  const entry = members[0];
  editingJobGroupId = entry.jobGroupId || entry.id;
  applyMembersToTruckCrew(members);

  els.date.value = entry.date;
  if (isNbOnlyEntry(entry)) {
    els.jobType.value = "nb";
    els.estimate.value = "";
    els.endDate.value = "";
  } else if (isLdEntry(entry)) {
    els.jobType.value = "ld";
    els.estimate.value = "";
    els.endDate.value = entryEndDate(entry);
  } else {
    els.jobType.value = "local";
    els.estimate.value = entry.estimatedHours;
    els.endDate.value = "";
  }
  els.jobNote.value = entry.jobNote || "";

  const hasNb = Number(entry.nonBillableHours) > 0 || isNbOnlyEntry(entry);
  els.nbToggle.checked = hasNb;
  els.nbFields.hidden = !hasNb;
  els.nbHours.value = hasNb ? entry.nonBillableHours : "";
  els.nbReason.value = entry.nonBillableReason || "";

  syncJobTypeFields();
  syncEditModeUi();
  renderTruckPanels();
  switchTab("log");
  els.logForm.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("Editing job — update when ready");
}

function applyMembersToTruckCrew(members) {
  const hasTruckData = members.some((m) => m.truckNumber || m.jobRole);
  if (hasTruckData) {
    const maxTruck = Math.max(
      ...members.map((m) => Number(m.truckNumber) || 1),
      Number(members[0].truckCount) || 1
    );
    truckCount = Math.min(5, Math.max(1, maxTruck));
    truckCrew = Array.from({ length: truckCount }, () => emptyTruck());
    members.forEach((m) => {
      const index = Math.min(truckCount, Math.max(1, Number(m.truckNumber) || 1)) - 1;
      if (m.jobRole === "driver" || (!m.jobRole && employeeRole(m.employeeId) === "driver")) {
        if (!truckCrew[index].driverId) truckCrew[index].driverId = m.employeeId;
        else if (!truckCrew[index].moverIds.includes(m.employeeId)) {
          truckCrew[index].moverIds.push(m.employeeId);
        }
      } else if (!truckCrew[index].moverIds.includes(m.employeeId) && truckCrew[index].driverId !== m.employeeId) {
        truckCrew[index].moverIds.push(m.employeeId);
      }
    });
    // ensure each truck has a driver if possible
    truckCrew.forEach((truck) => {
      if (!truck.driverId && truck.moverIds.length) {
        const driverLike = truck.moverIds.find((id) => employeeRole(id) === "driver");
        if (driverLike) {
          truck.driverId = driverLike;
          truck.moverIds = truck.moverIds.filter((id) => id !== driverLike);
        }
      }
    });
    return;
  }

  // Legacy jobs: 1 truck, first roster-driver as driver, rest movers
  truckCount = 1;
  const driver = members.find((m) => employeeRole(m.employeeId) === "driver");
  const driverId = driver?.employeeId || members[0]?.employeeId || "";
  truckCrew = [
    {
      driverId,
      moverIds: members
        .map((m) => m.employeeId)
        .filter((id) => id !== driverId)
        .slice(0, 4),
      search: "",
    },
  ];
}

function getJobMembers(jobKey) {
  const byGroup = state.entries.filter((e) => e.jobGroupId && e.jobGroupId === jobKey);
  if (byGroup.length) return byGroup;
  const single = state.entries.find((e) => e.id === jobKey);
  return single ? [single] : [];
}

function removeJobByKey(jobKey) {
  const members = getJobMembers(jobKey);
  const ids = new Set(members.map((m) => m.id));
  state.entries = state.entries.filter((e) => !ids.has(e.id));
}

function cancelEdit() {
  editingJobGroupId = null;
  clearLogForm();
  renderTruckPanels();
  showToast("Edit cancelled");
}

function onEntriesClick(event) {
  if (!isManager()) return;
  const editBtn = event.target.closest("[data-edit-job]");
  if (editBtn) {
    startEditJob(editBtn.getAttribute("data-edit-job"));
    return;
  }
  onDeleteClick(event);
}

function onCrewSubmit(event) {
  event.preventDefault();
  if (!isManager()) return;
  const name = els.newName.value.trim();
  const role = els.newRole.value === "driver" ? "driver" : "mover";
  const password = els.newPassword.value.trim();
  if (!name) return;
  if (!password) {
    showToast("Set a login password for them");
    return;
  }

  const exists = state.employees.some(
    (e) => e.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) {
    showToast("That name is already on the roster");
    return;
  }
  if (passwordConflicts(password)) {
    showToast("That password is already used — pick another");
    return;
  }

  state.employees.push({
    id: crypto.randomUUID(),
    name,
    role,
    password,
    createdAt: new Date().toISOString(),
  });
  state.employees.sort((a, b) => a.name.localeCompare(b.name));
  saveState();
  els.crewForm.reset();
  els.newRole.value = "mover";
  renderAll();
  showToast(`${name} added as ${roleLabel(role)}`);
}

function onManagerPassSubmit(event) {
  event.preventDefault();
  if (!isManager()) return;
  const p1 = els.managerPass1.value;
  const p2 = isManager2() ? els.managerPass2.value : MANAGER2_PASSWORD;
  if (!p1 || !p2) {
    showToast("Both manager passwords are required");
    return;
  }
  if (p1 === p2) {
    showToast("Manager passwords must be different");
    return;
  }
  const employeeHit = state.employees.some(
    (e) => e.password === p1 || e.password === p2
  );
  if (employeeHit) {
    showToast("Manager passwords can’t match an employee password");
    return;
  }
  state.settings.managerPasswords = [p1, p2];
  saveState();
  els.managerPass2.value = p2;
  showToast("Manager passwords saved");
}

function updateClearWeekButton() {
  const show = isManager2();
  if (els.clearWeekBtn) els.clearWeekBtn.hidden = !show;
  if (els.deleteAllJobsBtn) els.deleteAllJobsBtn.hidden = !show;
}

function onClearWeek() {
  if (!isManager2()) {
    showToast("Only Manager 2 can clear a whole week");
    return;
  }
  const start = weekAnchor;
  const end = endOfWeek(start);
  const weekStart = toInputDate(start);
  const weekEnd = toInputDate(end);
  const toRemove = state.entries.filter((e) =>
    entryOverlapsDateRange(e, weekStart, weekEnd)
  );
  if (!toRemove.length) {
    showToast("Nothing to clear for this week");
    return;
  }
  const label = `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  const ok = confirm(
    `Clear the entire week ${label}?\n\nThis permanently deletes ${toRemove.length} entr${toRemove.length === 1 ? "y" : "ies"} (all trucks/jobs that touch this pay week).`
  );
  if (!ok) return;
  const removeIds = new Set(toRemove.map((e) => e.id));
  state.entries = state.entries.filter((e) => !removeIds.has(e.id));
  saveState();
  showToast(`Cleared ${toRemove.length} entr${toRemove.length === 1 ? "y" : "ies"} for that week`);
  renderWeek();
  renderEntries();
  if (focusedEmployeeId) renderEmployeeFocus();
}

function onDeleteAllJobs() {
  if (!isManager2()) {
    showToast("Only Manager 2 can delete all jobs");
    return;
  }
  const count = state.entries.length;
  if (!count) {
    showToast("No jobs to delete");
    return;
  }
  const ok = confirm(
    `Delete ALL jobs and hours?\n\nThis permanently erases ${count} entr${count === 1 ? "y" : "ies"} across every week. Crew names and passwords are kept.\n\nThis cannot be undone.`
  );
  if (!ok) return;
  const okAgain = confirm(
    "Final confirmation: wipe every logged job and make a clean slate?"
  );
  if (!okAgain) return;
  state.entries = [];
  editingJobGroupId = null;
  saveState();
  showToast("All jobs deleted — clean slate");
  syncEditModeUi();
  renderAll();
}

function passwordConflicts(password, exceptEmployeeId = null) {
  if (state.settings.managerPasswords.includes(password)) return true;
  return state.employees.some(
    (e) => e.password === password && e.id !== exceptEmployeeId
  );
}

function onCrewListChange(event) {
  if (!isManager()) return;

  const nameInput = event.target.closest("[data-name-crew]");
  if (nameInput) {
    const id = nameInput.getAttribute("data-name-crew");
    const employee = state.employees.find((e) => e.id === id);
    if (!employee) return;
    const name = nameInput.value.trim();
    if (!name) {
      showToast("Name can’t be empty");
      nameInput.value = employee.name || "";
      return;
    }
    const duplicate = state.employees.some(
      (e) =>
        e.id !== id && e.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      showToast("That name is already on the roster");
      nameInput.value = employee.name || "";
      return;
    }
    const previous = employee.name;
    employee.name = name;
    state.employees.sort((a, b) => a.name.localeCompare(b.name));
    saveState();
    renderAll();
    if (previous !== name) {
      showToast(`Renamed “${previous}” to “${name}”`);
    }
    return;
  }

  const roleSelect = event.target.closest("[data-role-crew]");
  if (roleSelect) {
    const id = roleSelect.getAttribute("data-role-crew");
    const employee = state.employees.find((e) => e.id === id);
    if (!employee) return;
    employee.role = roleSelect.value === "driver" ? "driver" : "mover";
    saveState();
    renderAll();
    showToast(`${employee.name} set as ${roleLabel(employee.role)}`);
    return;
  }

  const passInput = event.target.closest("[data-password-crew]");
  if (passInput) {
    const id = passInput.getAttribute("data-password-crew");
    const employee = state.employees.find((e) => e.id === id);
    if (!employee) return;
    const password = passInput.value.trim();
    if (!password) {
      showToast("Password can’t be empty");
      passInput.value = employee.password || "";
      return;
    }
    if (passwordConflicts(password, id)) {
      showToast("That password is already used — pick another");
      passInput.value = employee.password || "";
      return;
    }
    employee.password = password;
    saveState();
    showToast(`Password updated for ${employee.name}`);
  }
}

function onDeleteClick(event) {
  const multiBtn = event.target.closest("[data-delete-entries]");
  if (multiBtn) {
    const ids = new Set(
      multiBtn
        .getAttribute("data-delete-entries")
        .split(",")
        .filter(Boolean)
    );
    const deletedEdit =
      editingJobGroupId &&
      state.entries.some(
        (e) =>
          ids.has(e.id) &&
          (e.jobGroupId === editingJobGroupId || e.id === editingJobGroupId)
      );
    state.entries = state.entries.filter((e) => !ids.has(e.id));
    if (deletedEdit) {
      editingJobGroupId = null;
      clearLogForm();
    }
    saveState();
    renderAll();
    showToast("Job removed");
    return;
  }

  const btn = event.target.closest("[data-delete-entry]");
  if (!btn) return;
  const id = btn.getAttribute("data-delete-entry");
  const entry = state.entries.find((e) => e.id === id);
  if (
    entry &&
    editingJobGroupId &&
    (entry.jobGroupId === editingJobGroupId || entry.id === editingJobGroupId)
  ) {
    editingJobGroupId = null;
    clearLogForm();
  }
  state.entries = state.entries.filter((e) => e.id !== id);
  saveState();
  renderAll();
  showToast("Entry removed");
}

function onCrewDeleteClick(event) {
  if (!isManager()) return;
  const btn = event.target.closest("[data-delete-crew]");
  if (!btn) return;
  const id = btn.getAttribute("data-delete-crew");
  const employee = state.employees.find((e) => e.id === id);
  const hasEntries = state.entries.some((e) => e.employeeId === id);

  if (hasEntries) {
    const ok = confirm(
      `Remove ${employee?.name || "this person"} and keep their past hour entries?`
    );
    if (!ok) return;
  }

  state.employees = state.employees.filter((e) => e.id !== id);
  saveState();
  renderAll();
  showToast("Removed from roster");
}

function shiftWeek(days) {
  const next = new Date(weekAnchor);
  next.setDate(next.getDate() + days);
  weekAnchor = startOfWeek(next);
  weekDetailDate = "all";
  renderWeek();
}

function renderAll() {
  const steps = [
    ["crew", renderCrew],
    ["trucks", renderTruckPanels],
    ["entries", renderEntries],
    ["week", renderWeek],
    ["employee", renderEmployeeFocus],
  ];
  steps.forEach(([label, fn]) => {
    try {
      fn();
    } catch (err) {
      console.error(`Render failed (${label}):`, err);
    }
  });
}

function renderTruckPanels() {
  if (!els.truckPanels || !els.truckCountBtns) return;

  [...els.truckCountBtns.querySelectorAll("[data-trucks]")].forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.getAttribute("data-trucks")) === truckCount);
  });

  if (!state.employees.length) {
    els.truckPanels.innerHTML = `<p class="empty">No crew yet — add drivers and movers on the Crew tab.</p>`;
    updateCrewPickedCount();
    return;
  }

  const drivers = driversOnRoster();
  const movers = moversOnRoster();
  const pendingHours = pendingJobHours();

  els.truckPanels.innerHTML = truckCrew
    .map((truck, index) => {
      const query = (truck.search || "").trim().toLowerCase();
      const driverOptions = drivers
        .map((employee) => {
          const taken = isPersonAssignedElsewhere(employee.id, index);
          const selected = truck.driverId === employee.id ? "selected" : "";
          const disabled = taken && truck.driverId !== employee.id ? "disabled" : "";
          const status = employeeHoursStatus(employee.id, pendingHours);
          const hotMark = status.isHot ? " ⚠" : "";
          const role = employee.role === "driver" ? "Driver" : "Mover";
          return `<option value="${employee.id}" ${selected} ${disabled}>${escapeHtml(employee.name)} (${role}) — ${formatHours(status.current)} hrs${hotMark}${taken && !selected ? " (on another truck)" : ""}</option>`;
        })
        .join("");

      const moverPicks = movers
        .map((employee) => {
          const nameMatch = !query || employee.name.toLowerCase().includes(query);
          const takenElsewhere = isPersonAssignedElsewhere(employee.id, index);
          const isDriverHere = truck.driverId === employee.id;
          const checked = truck.moverIds.includes(employee.id);
          const disabled = !checked && (takenElsewhere || isDriverHere || truck.moverIds.length >= 4);
          const hiddenClass = nameMatch ? "" : " is-hidden";
          const status = employeeHoursStatus(employee.id, pendingHours);
          const hotClass = status.isHot ? " is-over-hours" : "";
          const role = employee.role === "driver" ? "driver" : "mover";
          return `
            <label class="crew-pick${checked ? " is-checked" : ""}${hiddenClass}${hotClass}" data-crew-name="${escapeHtml(employee.name.toLowerCase())}">
              <input
                type="checkbox"
                data-truck-mover="${index}"
                data-crew-id="${employee.id}"
                ${checked ? "checked" : ""}
                ${disabled ? "disabled" : ""}
              />
              <span class="crew-pick-name">${escapeHtml(employee.name)}</span>
              <span class="hours-pill${status.isHot ? " is-hot" : ""}">${formatHours(status.current)} hrs</span>
              <span class="role-badge role-${role}">${roleLabel(role)}</span>
            </label>
          `;
        })
        .join("");

      const driverStatus = truck.driverId ? employeeHoursStatus(truck.driverId, pendingHours) : null;
      const visibleMovers = movers.filter((employee) => {
        const nameMatch =
          !(truck.search || "").trim() ||
          employee.name.toLowerCase().includes((truck.search || "").trim().toLowerCase());
        return nameMatch;
      });

      return `
        <div class="truck-panel" data-truck-index="${index}">
          <div class="truck-panel-head">
            <h3>Truck ${index + 1}</h3>
            <span class="truck-panel-meta">1 driver · ${truck.moverIds.length}/4 movers</span>
          </div>
          <div class="field-row">
            <label for="truck-driver-${index}">Driver <span class="optional">(pick one)</span></label>
            <select id="truck-driver-${index}" class="${driverStatus?.isHot ? "is-over-hours" : ""}" data-truck-driver="${index}" required>
              <option value="">Select driver…</option>
              ${driverOptions}
            </select>
            ${
              driverStatus
                ? `<p class="hours-hint${driverStatus.isHot ? " is-hot" : ""}">${formatHours(driverStatus.current)} hrs this pay week${driverStatus.isHot ? " — over 40 with this job" : ""}</p>`
                : `<p class="hours-hint">Open the menu to see all crew — drivers listed first.</p>`
            }
          </div>
          <div class="field-row">
            <label for="truck-search-${index}">Movers <span class="optional">(pick 1–4)</span></label>
            <input
              type="search"
              id="truck-search-${index}"
              class="crew-search"
              data-truck-search="${index}"
              placeholder="Search movers…"
              value="${escapeHtml(truck.search || "")}"
              autocomplete="off"
            />
            <div class="crew-picker truck-mover-picker" data-mover-list="${index}">
              ${
                visibleMovers.length
                  ? moverPicks
                  : `<p class="empty crew-picker-empty">${
                      movers.length ? "No names match that search." : "No crew on roster."
                    }</p>`
              }
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  updateCrewPickedCount();
}

function getLogPayWeekRange() {
  let dateValue = els.date?.value;
  if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    dateValue = toInputDate(new Date());
  }
  const start = startOfWeek(parseInputDate(dateValue));
  return {
    weekStart: toInputDate(start),
    weekEnd: toInputDate(endOfWeek(start)),
  };
}

function pendingJobHours() {
  try {
    const type = els.jobType?.value || "local";
    let hours = 0;
    if (type === "local") hours += Number(els.estimate?.value) || 0;
    if ((els.nbToggle?.checked || type === "nb") && Number(els.nbHours?.value) > 0) {
      hours += Number(els.nbHours.value) || 0;
    }
    return hours;
  } catch {
    return 0;
  }
}

function employeePayWeekHours(employeeId) {
  try {
    const { weekStart, weekEnd } = getLogPayWeekRange();
    return (state.entries || [])
      .filter((e) => e && e.employeeId === employeeId)
      .filter((e) => e.date && entryOverlapsDateRange(e, weekStart, weekEnd))
      .filter((e) => {
        if (!editingJobGroupId) return true;
        const key = e.jobGroupId || e.id;
        return key !== editingJobGroupId && e.id !== editingJobGroupId;
      })
      .reduce((sum, e) => {
        const estimated =
          isLdEntry(e) || isNbOnlyEntry(e) ? 0 : Number(e.estimatedHours) || 0;
        return sum + estimated + (Number(e.nonBillableHours) || 0);
      }, 0);
  } catch {
    return 0;
  }
}

function employeeHoursStatus(employeeId, pendingHours = pendingJobHours()) {
  try {
    const current = employeePayWeekHours(employeeId);
    const projected = current + (Number(pendingHours) || 0);
    const isHot = current > WEEK_HOUR_CAP || projected > WEEK_HOUR_CAP;
    return { current, projected, isHot };
  } catch {
    return { current: 0, projected: 0, isHot: false };
  }
}

function filterTruckPanel(index) {
  const panel = els.truckPanels.querySelector(`[data-truck-index="${index}"]`);
  if (!panel) return;
  const query = (truckCrew[index].search || "").trim().toLowerCase();
  panel.querySelectorAll(".crew-pick").forEach((pick) => {
    const name = pick.getAttribute("data-crew-name") || "";
    pick.classList.toggle("is-hidden", Boolean(query) && !name.includes(query));
  });
}

function renderEntries() {
  const sorted = [...state.entries].sort((a, b) => {
    if (a.createdAt === b.createdAt) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });

  if (!sorted.length) {
    els.entriesList.innerHTML = `<p class="empty">No hours logged yet.</p>`;
    return;
  }

  const groups = [];
  const seen = new Set();

  sorted.forEach((entry) => {
    const key = entry.jobGroupId || entry.id;
    if (seen.has(key)) return;
    seen.add(key);

    const members = entry.jobGroupId
      ? sorted.filter((e) => e.jobGroupId === entry.jobGroupId)
      : [entry];

    groups.push(members);
  });

  els.entriesList.innerHTML = groups
    .slice(0, 40)
    .map((members) => jobGroupMarkup(members))
    .join("");
}

function renderCrew() {
  if (!els.crewList) return;
  if (!isManager()) return;

  const people = Array.isArray(state.employees) ? state.employees : [];
  if (!people.length) {
    els.crewList.innerHTML = `<p class="empty">Add your guys here once — they’ll show up when you log hours.</p>`;
    return;
  }

  els.crewList.innerHTML = people
    .map((employee) => {
      const id = employee.id || "";
      const name = employee.name || "Unnamed";
      const role = employee.role === "driver" ? "driver" : "mover";
      const hasPass = Boolean(employee.password);
      return `
      <div class="crew-item">
        <div class="entry-main">
          <div class="crew-edit-grid">
            <div class="crew-pass-row">
              <label for="name-${id}">Name</label>
              <input
                type="text"
                id="name-${id}"
                class="role-select crew-name-input"
                data-name-crew="${id}"
                value="${escapeHtml(name)}"
                placeholder="First and last name"
              />
            </div>
            <div class="crew-pass-row">
              <label for="pass-${id}">Login password</label>
              <input
                type="text"
                id="pass-${id}"
                class="role-select crew-pass-input"
                data-password-crew="${id}"
                value="${escapeHtml(employee.password || "")}"
                placeholder="Login password"
              />
            </div>
          </div>
          <div class="crew-meta-row">
            <span class="role-badge role-${role}">${roleLabel(role)}</span>
            ${hasPass ? "" : `<span class="badge badge-nb">No password</span>`}
          </div>
        </div>
        <div class="crew-actions">
          <label class="sr-only" for="role-${id}">Role</label>
          <select id="role-${id}" class="role-select" data-role-crew="${id}">
            <option value="mover" ${role === "mover" ? "selected" : ""}>Mover</option>
            <option value="driver" ${role === "driver" ? "selected" : ""}>Driver</option>
          </select>
          <button type="button" class="btn-danger" data-delete-crew="${id}">Remove</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function onEmployeeFocusSelect(event) {
  if (isEmployeeUser()) return;
  const btn = event.target.closest("[data-focus-employee]");
  if (!btn) return;
  focusedEmployeeId = btn.getAttribute("data-focus-employee");
  els.employeeFocusSearch.value = employeeName(focusedEmployeeId);
  renderEmployeeFocus();
}

function renderEmployeeFocus() {
  if (isEmployeeUser()) {
    focusedEmployeeId = currentEmployeeId();
  }
  if (
    focusedEmployeeId &&
    !state.employees.some((e) => e.id === focusedEmployeeId)
  ) {
    focusedEmployeeId = null;
  }
  renderEmployeeFocusResults();
  renderEmployeeFocusView();
}

function renderEmployeeFocusResults() {
  if (isEmployeeUser()) {
    els.employeeFocusResults.innerHTML = "";
    return;
  }  const query = els.employeeFocusSearch.value.trim().toLowerCase();
  let matches = state.employees;

  if (query) {
    matches = matches.filter((e) => e.name.toLowerCase().includes(query));
  }

  if (!state.employees.length) {
    els.employeeFocusResults.innerHTML = `<p class="empty">Add crew on the Crew tab first.</p>`;
    return;
  }

  if (!matches.length) {
    els.employeeFocusResults.innerHTML = `<p class="empty">No crew matching “${escapeHtml(
      els.employeeFocusSearch.value.trim()
    )}”.</p>`;
    return;
  }

  const drivers = matches.filter((e) => e.role === "driver");
  const movers = matches.filter((e) => e.role !== "driver");

  const chip = (employee) => {
    const role = employee.role === "driver" ? "driver" : "mover";
    const active = employee.id === focusedEmployeeId ? " is-active" : "";
    return `
      <button type="button" class="employee-focus-chip${active}" data-focus-employee="${employee.id}">
        <span>${escapeHtml(employee.name)}</span>
        <span class="role-badge role-${role}">${roleLabel(role)}</span>
      </button>
    `;
  };

  els.employeeFocusResults.innerHTML = `
    <div class="employee-focus-columns">
      <div class="employee-focus-col">
        <h3 class="employee-focus-col-title">Drivers</h3>
        <div class="employee-focus-col-list">
          ${
            drivers.length
              ? drivers.map(chip).join("")
              : `<p class="empty">No drivers${query ? " match" : ""}.</p>`
          }
        </div>
      </div>
      <div class="employee-focus-col">
        <h3 class="employee-focus-col-title">Movers</h3>
        <div class="employee-focus-col-list">
          ${
            movers.length
              ? movers.map(chip).join("")
              : `<p class="empty">No movers${query ? " match" : ""}.</p>`
          }
        </div>
      </div>
    </div>
  `;
}

function renderEmployeeFocusView() {
  if (!focusedEmployeeId) {
    els.employeeFocusView.innerHTML = `<p class="empty">Select an employee above to see their week-by-week jobs and hours.</p>`;
    return;
  }

  const employee = state.employees.find((e) => e.id === focusedEmployeeId);
  const role = employeeRole(focusedEmployeeId);
  const personEntries = state.entries
    .filter((e) => e.employeeId === focusedEmployeeId)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        entryEndDate(b).localeCompare(entryEndDate(a)) ||
        b.createdAt.localeCompare(a.createdAt)
    );

  if (!personEntries.length) {
    els.employeeFocusView.innerHTML = `
      <div class="employee-focus-header">
        <h3>${escapeHtml(employee.name)} <span class="role-badge role-${role}">${roleLabel(role)}</span></h3>
      </div>
      <p class="empty">No jobs logged for this person yet.</p>
    `;
    return;
  }

  let allEstimated = 0;
  let allNb = 0;
  let allLd = 0;
  let allLocal = 0;
  personEntries.forEach((entry) => {
    if (isLdEntry(entry)) allLd += 1;
    else if (isNbOnlyEntry(entry)) {
      // nb only
    } else {
      allEstimated += Number(entry.estimatedHours) || 0;
      allLocal += 1;
    }
    allNb += Number(entry.nonBillableHours) || 0;
  });

  const weekKeys = new Set();
  personEntries.forEach((entry) => {
    weeksTouchedByEntry(entry).forEach((key) => weekKeys.add(key));
  });

  const weeks = [...weekKeys].sort((a, b) => b.localeCompare(a));

  const weekBlocks = weeks
    .map((weekKey) => {
      const weekStart = parseInputDate(weekKey);
      const weekEnd = endOfWeek(weekStart);
      const weekStartStr = weekKey;
      const weekEndStr = toInputDate(weekEnd);
      const weekEntries = personEntries.filter((e) =>
        entryOverlapsDateRange(e, weekStartStr, weekEndStr)
      );

      let estimated = 0;
      let nonBillable = 0;
      let localJobs = 0;
      let ldJobs = 0;
      weekEntries.forEach((entry) => {
        if (isLdEntry(entry)) ldJobs += 1;
        else if (isNbOnlyEntry(entry)) {
          // nb only
        } else {
          estimated += Number(entry.estimatedHours) || 0;
          localJobs += 1;
        }
        nonBillable += Number(entry.nonBillableHours) || 0;
      });
      const total = estimated + nonBillable;

      const parts = [];
      if (localJobs > 0) {
        parts.push(
          `${formatHours(estimated)} estimated · ${localJobs} local job${localJobs === 1 ? "" : "s"}`
        );
      }
      if (ldJobs > 0) parts.push(`${ldJobs} LD job${ldJobs === 1 ? "" : "s"}`);
      if (nonBillable > 0) parts.push(`${formatHours(nonBillable)} non-billable`);

      // Rebuild full job groups for edit (include all crew on those jobs)
      const groups = groupEntriesForEmployeeJobs(weekEntries);

      return `
        <section class="employee-week-block">
          <div class="employee-week-head">
            <div>
              <h4>${formatDisplayDate(weekStart)} – ${formatDisplayDate(weekEnd)}</h4>
              <p class="entry-meta">${parts.join(" · ") || "No hours"}</p>
            </div>
            <div class="employee-week-total">
              ${localJobs > 0 || nonBillable > 0 ? formatHours(total) : "—"}
              <span>${localJobs > 0 || nonBillable > 0 ? "hrs" : "LD"}</span>
            </div>
          </div>
          <div class="entries">
            ${groups.map((members) => jobGroupMarkup(members)).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  els.employeeFocusView.innerHTML = `
    <div class="employee-focus-header">
      <h3>${escapeHtml(employee.name)} <span class="role-badge role-${role}">${roleLabel(role)}</span></h3>
      <p class="employee-focus-summary">
        All time:
        ${formatHours(allEstimated)} estimated ·
        ${formatHours(allNb)} non-billable ·
        ${allLocal} local ·
        ${allLd} LD ·
        <strong>${formatHours(allEstimated + allNb)} total hrs</strong>
      </p>
    </div>
    ${weekBlocks}
  `;
}

function weeksTouchedByEntry(entry) {
  const keys = [];
  let cursor = startOfWeek(parseInputDate(entry.date));
  const last = startOfWeek(parseInputDate(entryEndDate(entry)));
  while (cursor <= last) {
    keys.push(toInputDate(cursor));
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }
  return keys;
}

function groupEntriesForEmployeeJobs(personEntries) {
  const groups = [];
  const seen = new Set();
  personEntries.forEach((entry) => {
    const key = entry.jobGroupId || entry.id;
    if (seen.has(key)) return;
    seen.add(key);
    if (isEmployeeUser()) {
      groups.push([entry]);
      return;
    }
    const members = getJobMembers(key);
    groups.push(members.length ? members : [entry]);
  });
  return groups;
}

function renderWeek() {
  const start = weekAnchor;
  const end = endOfWeek(start);
  const weekStart = toInputDate(start);
  const weekEnd = toInputDate(end);
  els.weekRange.textContent = `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  updateClearWeekButton();

  const weekEntries = state.entries
    .filter((e) => entryOverlapsDateRange(e, weekStart, weekEnd))
    .filter((e) => !isEmployeeUser() || e.employeeId === currentEmployeeId())
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        entryEndDate(a).localeCompare(entryEndDate(b)) ||
        a.createdAt.localeCompare(b.createdAt)
    );

  if (!weekEntries.length) {
    els.weekSummary.innerHTML = `<p class="empty">No hours logged for this week yet.</p>`;
    weekDetailDate = "all";
    els.weekDetailDate.innerHTML = `<option value="all">All days this week</option>`;
    els.weekDetailDate.value = "all";
    els.weekDetailDate.disabled = true;
    els.weekDetail.innerHTML = `<p class="empty">No hours logged for this week yet.</p>`;
    return;
  }

  const byEmployee = new Map();
  weekEntries.forEach((entry) => {
    const current = byEmployee.get(entry.employeeId) || {
      estimated: 0,
      nonBillable: 0,
      jobs: 0,
      ldJobs: 0,
    };
    if (isLdEntry(entry)) {
      current.ldJobs += 1;
    } else if (isNbOnlyEntry(entry)) {
      // non-billable only — counted in nonBillable below
    } else {
      current.estimated += Number(entry.estimatedHours) || 0;
      current.jobs += 1;
    }
    current.nonBillable += Number(entry.nonBillableHours) || 0;
    byEmployee.set(entry.employeeId, current);
  });

  const cards = [...byEmployee.entries()]
    .map(([employeeId, totals]) => {
      const total = totals.estimated + totals.nonBillable;
      return {
        name: employeeName(employeeId),
        role: employeeRole(employeeId),
        totals,
        total,
      };
    })
    .sort((a, b) => {
      if (weekSort === "high") {
        return b.total - a.total || a.name.localeCompare(b.name);
      }
      if (weekSort === "low") {
        return a.total - b.total || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    })
    .map(({ name, role, totals, total }) => {
      const parts = [];
      if (totals.jobs > 0) {
        parts.push(
          `${formatHours(totals.estimated)} estimated · ${totals.jobs} local job${totals.jobs === 1 ? "" : "s"}`
        );
      }
      if (totals.ldJobs > 0) {
        parts.push(`${totals.ldJobs} LD job${totals.ldJobs === 1 ? "" : "s"}`);
      }
      if (totals.nonBillable > 0) {
        parts.push(`${formatHours(totals.nonBillable)} non-billable`);
      }
      const hoursLabel = totals.jobs > 0 || totals.nonBillable > 0 ? "total hrs" : "LD only";
      return `
        <div class="week-card">
          <div class="name">${escapeHtml(name)} <span class="role-badge role-${role}">${roleLabel(role)}</span></div>
          <div class="total">${totals.jobs > 0 || totals.nonBillable > 0 ? formatHours(total) : "—"}<span>${hoursLabel}</span></div>
          <div class="breakdown">${parts.join(" · ") || "No hours"}</div>
        </div>
      `;
    });

  const grandEstimated = weekEntries.reduce(
    (sum, e) => sum + (isLdEntry(e) || isNbOnlyEntry(e) ? 0 : Number(e.estimatedHours) || 0),
    0
  );
  const grandNb = weekEntries.reduce((sum, e) => sum + (Number(e.nonBillableHours) || 0), 0);
  const grandLd = countUniqueJobs(weekEntries.filter(isLdEntry));
  const grandTotal = grandEstimated + grandNb;

  els.weekSummary.innerHTML =
    cards.join("") +
    `
    <div class="week-total-bar">
      <span>${isEmployeeUser() ? "Your week total" : "Crew week total"}${grandLd ? ` · ${grandLd} LD job${grandLd === 1 ? "" : "s"}` : ""}</span>
      <strong>${formatHours(grandTotal)} hrs</strong>
    </div>
  `;

  renderWeekDetail(weekEntries, weekStart, weekEnd);
}

function renderWeekDetailOnly() {
  const start = weekAnchor;
  const end = endOfWeek(start);
  const weekStart = toInputDate(start);
  const weekEnd = toInputDate(end);
  const weekEntries = state.entries
    .filter((e) => entryOverlapsDateRange(e, weekStart, weekEnd))
    .filter((e) => !isEmployeeUser() || e.employeeId === currentEmployeeId())
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        entryEndDate(a).localeCompare(entryEndDate(b)) ||
        a.createdAt.localeCompare(b.createdAt)
    );
  renderWeekDetail(weekEntries, weekStart, weekEnd);
}

function renderWeekDetail(weekEntries, weekStart, weekEnd) {
  const datesWithJobs = datesInWeekCoveredByEntries(weekEntries, weekStart, weekEnd);

  if (weekDetailDate !== "all" && !datesWithJobs.includes(weekDetailDate)) {
    weekDetailDate = "all";
  }

  els.weekDetailDate.innerHTML =
    `<option value="all">All days this week</option>` +
    datesWithJobs
      .map(
        (date) =>
          `<option value="${date}" ${weekDetailDate === date ? "selected" : ""}>${formatDisplayDate(parseInputDate(date))}</option>`
      )
      .join("");

  els.weekDetailDate.value = weekDetailDate;
  els.weekDetailDate.disabled = !weekEntries.length;

  const filtered =
    weekDetailDate === "all"
      ? weekEntries
      : weekEntries.filter((e) => entryCoversDate(e, weekDetailDate));

  if (!filtered.length) {
    els.weekDetail.innerHTML = `<p class="empty">${
      weekEntries.length
        ? "No jobs on that day."
        : "No hours logged for this week yet."
    }</p>`;
    return;
  }

  const groups = groupEntries(filtered).map((members) => {
    if (!isEmployeeUser()) return members;
    return members.filter((m) => m.employeeId === currentEmployeeId());
  });
  els.weekDetail.innerHTML = groups
    .filter((members) => members.length)
    .map((members) => jobGroupMarkup(members))
    .join("");
}

function groupEntries(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });
  const groups = [];
  const seen = new Set();

  sorted.forEach((entry) => {
    const key = entry.jobGroupId || entry.id;
    if (seen.has(key)) return;
    seen.add(key);
    const members = entry.jobGroupId
      ? sorted.filter((e) => e.jobGroupId === entry.jobGroupId)
      : [entry];
    groups.push(members);
  });

  return groups;
}

function jobGroupMarkup(members) {
  const entry = members[0];
  const ld = isLdEntry(entry);
  const nbOnly = isNbOnlyEntry(entry);
  const hoursBit = ld
    ? `<span class="badge badge-ld">LD</span>`
    : nbOnly
      ? `<span class="badge badge-nb">NB only</span> ${formatHours(entry.nonBillableHours)} hrs`
      : `${formatHours(entry.estimatedHours)} est.`;
  const nb =
    !nbOnly && entry.nonBillableHours > 0
      ? `<span class="badge">+${formatHours(entry.nonBillableHours)} NB each</span>`
      : "";
  const noteBits = [];
  if (entry.jobNote) noteBits.push(entry.jobNote);
  if (entry.nonBillableReason) noteBits.push(`NB: ${entry.nonBillableReason}`);
  const metaExtra = noteBits.length ? ` · ${escapeHtml(noteBits.join(" · "))}` : "";

  const truckLines = isEmployeeUser()
    ? formatSelfHoursLine(members[0])
    : formatTruckCrewLines(members);
  const trucksLabel = isEmployeeUser()
    ? "Your hours"
    : entry.truckCount
      ? `${entry.truckCount} truck${entry.truckCount === 1 ? "" : "s"}`
      : `${members.length} crew`;

  const deleteIds = members.map((m) => m.id).join(",");
  const jobKey = entry.jobGroupId || entry.id;
  const actions = isManager()
    ? `<div class="entry-actions">
        <button type="button" class="btn-ghost btn-edit" data-edit-job="${jobKey}">Edit</button>
        <button type="button" class="btn-danger" data-delete-entries="${deleteIds}">Delete</button>
      </div>`
    : "";

  return `
    <div class="entry${
      editingJobGroupId &&
      (editingJobGroupId === entry.jobGroupId || editingJobGroupId === entry.id)
        ? " is-editing-entry"
        : ""
    }">
      <div class="entry-main">
        <div class="entry-title">
          ${hoursBit}${nb}
          <span class="crew-size">${trucksLabel}</span>
        </div>
        <div class="entry-meta">${formatEntryDates(entry)}${
          ld ? " · Long Distance" : nbOnly ? " · Non-billable only" : ""
        }${metaExtra}</div>
        <div class="entry-crew">${truckLines}</div>
      </div>
      ${actions}
    </div>
  `;
}

function formatSelfHoursLine(entry) {
  if (!entry) return "";
  const role = entry.jobRole === "driver" ? "driver" : employeeRole(entry.employeeId);
  const bits = [];
  if (!isLdEntry(entry) && !isNbOnlyEntry(entry)) {
    bits.push(`${formatHours(entry.estimatedHours)} est`);
  }
  if (isLdEntry(entry)) bits.push("LD");
  if (isNbOnlyEntry(entry) || entry.nonBillableHours > 0) {
    bits.push(`${formatHours(entry.nonBillableHours)} NB`);
  }
  return `${escapeHtml(employeeName(entry.employeeId))} <span class="role-badge role-${role}">${roleLabel(role)}</span> · ${bits.join(" · ")}`;
}

function formatTruckCrewLines(members) {
  const hasTruckData = members.some((m) => m.truckNumber || m.jobRole);
  if (!hasTruckData) {
    return members
      .map((m) => {
        const role = employeeRole(m.employeeId);
        return `${escapeHtml(employeeName(m.employeeId))} <span class="role-badge role-${role}">${roleLabel(role)}</span>`;
      })
      .join(", ");
  }

  const byTruck = new Map();
  members.forEach((m) => {
    const num = Number(m.truckNumber) || 1;
    if (!byTruck.has(num)) byTruck.set(num, { driver: null, movers: [] });
    const bucket = byTruck.get(num);
    if (m.jobRole === "driver") bucket.driver = m;
    else bucket.movers.push(m);
  });

  return [...byTruck.keys()]
    .sort((a, b) => a - b)
    .map((num) => {
      const bucket = byTruck.get(num);
      const driverName = bucket.driver
        ? escapeHtml(employeeName(bucket.driver.employeeId))
        : "No driver";
      const movers = bucket.movers
        .map((m) => escapeHtml(employeeName(m.employeeId)))
        .join(", ");
      return `<div class="truck-line"><strong>Truck ${num}:</strong> ${driverName} <span class="role-badge role-driver">Driver</span>${
        movers ? ` · ${movers}` : ""
      }</div>`;
    })
    .join("");
}

function isLdEntry(entry) {
  return entry.jobType === "ld";
}

function isNbOnlyEntry(entry) {
  return entry.jobType === "nb";
}

function entryEndDate(entry) {
  return entry.endDate || entry.date;
}

function entryOverlapsDateRange(entry, rangeStart, rangeEnd) {
  return entry.date <= rangeEnd && entryEndDate(entry) >= rangeStart;
}

function entryCoversDate(entry, date) {
  return entry.date <= date && entryEndDate(entry) >= date;
}

function datesInWeekCoveredByEntries(entries, weekStart, weekEnd) {
  const dates = new Set();
  entries.forEach((entry) => {
    const from = entry.date > weekStart ? entry.date : weekStart;
    const to = entryEndDate(entry) < weekEnd ? entryEndDate(entry) : weekEnd;
    let cursor = parseInputDate(from);
    const last = parseInputDate(to);
    while (cursor <= last) {
      dates.add(toInputDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return [...dates].sort();
}

function formatEntryDates(entry) {
  const start = formatDisplayDate(parseInputDate(entry.date));
  const end = entryEndDate(entry);
  if (!isLdEntry(entry) || end === entry.date) return start;
  return `${start} – ${formatDisplayDate(parseInputDate(end))}`;
}

function countUniqueJobs(entries) {
  return new Set(entries.map((e) => e.jobGroupId || e.id)).size;
}

function employeeName(id) {
  return state.employees.find((e) => e.id === id)?.name || "Former crew member";
}

function employeeRole(id) {
  const role = state.employees.find((e) => e.id === id)?.role;
  return role === "driver" ? "driver" : "mover";
}

function roleLabel(role) {
  return role === "driver" ? "Driver" : "Mover";
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  d.setDate(d.getDate() - day); // Sunday start (pay period)
  return d;
}

function endOfWeek(start) {
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  return d;
}

function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseInputDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplayDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatHours(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("is-visible");
    setTimeout(() => {
      els.toast.hidden = true;
    }, 200);
  }, 2200);
}
