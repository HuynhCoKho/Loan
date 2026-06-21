const STORAGE_KEY = "loan-planner-v1";
const DRIVE_SETTINGS_KEY = "loan-planner-drive-v1";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FILE_NAME = "loan-planner-data.json";
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const state = {
  loans: [],
  selectedId: null,
  accessToken: "",
  driveFileId: "",
  driveFileLink: "",
  driveClientId: "",
  driveSaveTimer: null,
  isDriveSaving: false,
};

const elements = {
  form: document.getElementById("loanForm"),
  formTitle: document.getElementById("formTitle"),
  loanCards: document.getElementById("loanCards"),
  scheduleBody: document.getElementById("scheduleBody"),
  summary: document.getElementById("summary"),
  rateAdjustments: document.getElementById("rateAdjustments"),
  maturityAdjustments: document.getElementById("maturityAdjustments"),
  newLoanButton: document.getElementById("newLoanButton"),
  deleteLoanButton: document.getElementById("deleteLoanButton"),
  addRateButton: document.getElementById("addRateButton"),
  addMaturityButton: document.getElementById("addMaturityButton"),
  exportButton: document.getElementById("exportButton"),
  importInput: document.getElementById("importInput"),
  connectDriveButton: document.getElementById("connectDriveButton"),
  googleClientId: document.getElementById("googleClientId"),
  driveStatus: document.getElementById("driveStatus"),
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseDateInput(value) {
  const trimmed = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return toIsoDate(date);
}

function addMonths(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function dayDiff(start, end) {
  return Math.max(0, Math.round((end - start) / 86400000));
}

function formatNumber(value) {
  return numberFormatter.format(Math.round(value || 0));
}

function formatDate(value) {
  if (!value) return "";
  const date = typeof value === "string" ? fromIsoDate(value) : value;
  if (!date) return value;
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function emptyToNull(value) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}

function valueOrDefault(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function getDefaultLoan() {
  const start = new Date();
  const maturity = addMonths(start, 12);
  return {
    id: uid(),
    name: "Khoản vay mới",
    principal: 100000000,
    startDate: toIsoDate(start),
    maturityDate: toIsoDate(maturity),
    annualRate: 12,
    interestMode: "simple",
    repaymentType: "bullet",
    notes: "",
    rateAdjustments: [],
    maturityAdjustments: [],
    actualPayments: {},
    schedule: [],
    totals: null,
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.loans = Array.isArray(parsed.loans) ? parsed.loans : [];
      state.selectedId = parsed.selectedId || state.loans[0]?.id || null;
      return;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const firstLoan = getDefaultLoan();
  state.loans = [firstLoan];
  state.selectedId = firstLoan.id;
}

function loadDriveSettings() {
  const saved = localStorage.getItem(DRIVE_SETTINGS_KEY);
  if (!saved) return;

  try {
    const settings = JSON.parse(saved);
    state.driveClientId = settings.clientId || "";
    state.driveFileId = settings.fileId || "";
    state.driveFileLink = settings.fileLink || "";
    elements.googleClientId.value = state.driveClientId;
  } catch {
    localStorage.removeItem(DRIVE_SETTINGS_KEY);
  }
}

function saveDriveSettings() {
  localStorage.setItem(
    DRIVE_SETTINGS_KEY,
    JSON.stringify({
      clientId: state.driveClientId,
      fileId: state.driveFileId,
      fileLink: state.driveFileLink,
    }),
  );
}

function updateDriveStatus(text) {
  if (text) {
    elements.driveStatus.textContent = text;
    return;
  }

  if (state.accessToken && state.driveFileId) {
    elements.driveStatus.innerHTML = state.driveFileLink
      ? `Drive đã kết nối. <a href="${state.driveFileLink}" target="_blank" rel="noreferrer">Mở file dữ liệu</a>`
      : "Drive đã kết nối.";
    return;
  }

  if (state.driveClientId) {
    elements.driveStatus.textContent = "Đã lưu Client ID. Bấm Kết nối Drive để đăng nhập Google.";
    return;
  }

  elements.driveStatus.textContent = "Drive chưa kết nối.";
}

function getDataPayload() {
  return { loans: state.loans, selectedId: state.selectedId };
}

async function saveState(options = {}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(getDataPayload(), null, 2),
  );

  if (!options.skipDrive) scheduleDriveSave();
}

function selectedLoan() {
  return state.loans.find((loan) => loan.id === state.selectedId) || null;
}

function renderLoanCards() {
  elements.loanCards.innerHTML = "";

  if (!state.loans.length) {
    elements.loanCards.innerHTML = '<div class="empty-state">Chưa có khoản vay nào.</div>';
    return;
  }

  state.loans.forEach((loan) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `loan-card${loan.id === state.selectedId ? " active" : ""}`;
    button.innerHTML = `
      <strong>${loan.name || "Khoản vay chưa đặt tên"}</strong>
      <span>${formatNumber(Number(loan.principal))}</span>
      <span>${formatDate(loan.startDate)} đến ${formatDate(getFinalMaturityDate(loan))}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedId = loan.id;
      render();
      saveState();
    });
    elements.loanCards.appendChild(button);
  });
}

function renderForm() {
  const loan = selectedLoan();
  if (!loan) return;

  elements.formTitle.textContent = loan.name || "Khoản vay mới";
  elements.form.loanName.value = loan.name || "";
  elements.form.principal.value = loan.principal || 0;
  elements.form.startDate.value = formatDate(loan.startDate);
  elements.form.maturityDate.value = formatDate(loan.maturityDate);
  elements.form.annualRate.value = loan.annualRate ?? 0;
  elements.form.interestMode.value = loan.interestMode || "simple";
  elements.form.repaymentType.value = loan.repaymentType || "bullet";
  elements.form.notes.value = loan.notes || "";

  renderRateAdjustments(loan.rateAdjustments || []);
  renderMaturityAdjustments(loan.maturityAdjustments || []);
}

function adjustmentLabel(text, input) {
  const label = document.createElement("label");
  label.textContent = text;
  label.appendChild(input);
  return label;
}

function renderRateAdjustments(rows) {
  elements.rateAdjustments.innerHTML = "";
  if (!rows.length) {
    elements.rateAdjustments.innerHTML = '<div class="empty-state">Chưa có điều chỉnh lãi suất.</div>';
    return;
  }

  rows.forEach((row, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "adjustment-row";

    const dateInput = document.createElement("input");
    dateInput.type = "text";
    dateInput.inputMode = "numeric";
    dateInput.placeholder = "dd/mm/yyyy";
    dateInput.value = formatDate(row.date);
    dateInput.addEventListener("change", () =>
      updateAdjustment("rateAdjustments", index, "date", parseDateInput(dateInput.value)),
    );

    const rateInput = document.createElement("input");
    rateInput.type = "number";
    rateInput.step = "0.01";
    rateInput.min = "0";
    rateInput.value = row.rate ?? "";
    rateInput.addEventListener("input", () => updateAdjustment("rateAdjustments", index, "rate", Number(rateInput.value)));

    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.value = row.note || "";
    noteInput.placeholder = "Lý do/ghi chú";
    noteInput.addEventListener("input", () => updateAdjustment("rateAdjustments", index, "note", noteInput.value));

    wrapper.append(
      adjustmentLabel("Ngày bắt đầu áp dụng", dateInput),
      adjustmentLabel("Lãi mới (%/năm)", rateInput),
      adjustmentLabel("Ghi chú", noteInput),
      removeButton(() => removeAdjustment("rateAdjustments", index)),
    );
    elements.rateAdjustments.appendChild(wrapper);
  });
}

function renderMaturityAdjustments(rows) {
  elements.maturityAdjustments.innerHTML = "";
  if (!rows.length) {
    elements.maturityAdjustments.innerHTML = '<div class="empty-state">Chưa có gia hạn đáo hạn.</div>';
    return;
  }

  rows.forEach((row, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "adjustment-row maturity-row";

    const dateInput = document.createElement("input");
    dateInput.type = "text";
    dateInput.inputMode = "numeric";
    dateInput.placeholder = "dd/mm/yyyy";
    dateInput.value = formatDate(row.date);
    dateInput.addEventListener("change", () =>
      updateAdjustment("maturityAdjustments", index, "date", parseDateInput(dateInput.value)),
    );

    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.value = row.note || "";
    noteInput.placeholder = "Lý do/ghi chú";
    noteInput.addEventListener("input", () => updateAdjustment("maturityAdjustments", index, "note", noteInput.value));

    wrapper.append(
      adjustmentLabel("Ngày đáo hạn mới", dateInput),
      adjustmentLabel("Ghi chú", noteInput),
      removeButton(() => removeAdjustment("maturityAdjustments", index)),
    );
    elements.maturityAdjustments.appendChild(wrapper);
  });
}

function removeButton(onClick) {
  const button = document.createElement("button");
  button.className = "remove-row";
  button.type = "button";
  button.textContent = "×";
  button.title = "Xóa dòng";
  button.addEventListener("click", onClick);
  return button;
}

function updateAdjustment(collection, index, key, value) {
  const loan = selectedLoan();
  loan[collection][index][key] = value;
  saveState();
}

function removeAdjustment(collection, index) {
  const loan = selectedLoan();
  loan[collection].splice(index, 1);
  render();
  saveState();
}

function readFormIntoLoan() {
  const loan = selectedLoan();
  if (!loan) return null;
  const startDateValue = elements.form.startDate.value.trim();
  const maturityDateValue = elements.form.maturityDate.value.trim();
  const parsedStartDate = parseDateInput(startDateValue);
  const parsedMaturityDate = parseDateInput(maturityDateValue);

  loan.name = elements.form.loanName.value.trim() || "Khoản vay chưa đặt tên";
  loan.principal = Number(elements.form.principal.value);
  if (parsedStartDate || !startDateValue) loan.startDate = parsedStartDate;
  if (parsedMaturityDate || !maturityDateValue) loan.maturityDate = parsedMaturityDate;
  loan.annualRate = Number(elements.form.annualRate.value);
  loan.interestMode = elements.form.interestMode.value;
  loan.repaymentType = elements.form.repaymentType.value;
  loan.notes = elements.form.notes.value.trim();
  loan.actualPayments = loan.actualPayments || {};
  return loan;
}

function getFinalMaturityDate(loan) {
  const dates = [loan.maturityDate, ...(loan.maturityAdjustments || []).map((item) => item.date)].filter(Boolean);
  return dates.sort()[dates.length - 1] || loan.maturityDate;
}

function getRateForDate(loan, date) {
  const adjustments = [...(loan.rateAdjustments || [])]
    .filter((row) => row.date && Number.isFinite(Number(row.rate)))
    .sort((a, b) => a.date.localeCompare(b.date));

  let rate = Number(loan.annualRate);
  let note = "";
  const iso = toIsoDate(date);
  adjustments.forEach((row) => {
    if (row.date <= iso) {
      rate = Number(row.rate);
      note = row.note || `Điều chỉnh lãi từ ${row.date}`;
    }
  });
  return { rate, note };
}

function getPeriodInterest(loan, principal, startDate, endDate) {
  const adjustmentDates = (loan.rateAdjustments || [])
    .filter((row) => row.date && row.date > toIsoDate(startDate) && row.date < toIsoDate(endDate))
    .map((row) => fromIsoDate(row.date))
    .sort((a, b) => a - b);

  const boundaries = [startDate, ...adjustmentDates, endDate];
  let interest = 0;
  const rates = [];
  const notes = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const segmentStart = boundaries[index];
    const segmentEnd = boundaries[index + 1];
    const { rate, note } = getRateForDate(loan, segmentStart);
    const days = dayDiff(segmentStart, segmentEnd);
    interest += periodInterest(principal, rate, days, loan.interestMode);
    rates.push(rate);
    if (note) notes.push(note);
  }

  return {
    interest,
    rateLabel: [...new Set(rates.map((rate) => `${rate.toFixed(2)}%`))].join(" / "),
    note: [...new Set(notes)].join("; "),
  };
}

function periodInterest(principal, annualRate, days, mode) {
  if (days <= 0 || principal <= 0 || annualRate <= 0) return 0;
  const yearlyRate = annualRate / 100;
  if (mode === "compound") {
    return principal * (Math.pow(1 + yearlyRate, days / 365) - 1);
  }
  return principal * yearlyRate * (days / 365);
}

function buildPaymentDates(startDate, maturityDate) {
  const dates = [];
  let cursor = addMonths(startDate, 1);
  while (cursor < maturityDate) {
    dates.push(new Date(cursor));
    cursor = addMonths(cursor, 1);
  }
  dates.push(new Date(maturityDate));
  return dates;
}

function calculatePayment(principal, annualRate, remainingPeriods) {
  if (remainingPeriods <= 1) return principal;
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / remainingPeriods;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remainingPeriods));
}

function normalizeActualPayment(loan, period, plannedPrincipal, plannedInterest) {
  const saved = loan.actualPayments?.[period] || {};
  return {
    principal: valueOrDefault(saved.principal, plannedPrincipal),
    interest: valueOrDefault(saved.interest, plannedInterest),
    penaltyOrPrepayment: valueOrDefault(saved.penaltyOrPrepayment, 0),
  };
}

function calculateSchedule(loan) {
  const startDate = fromIsoDate(loan.startDate);
  const maturityDate = fromIsoDate(getFinalMaturityDate(loan));
  if (!startDate || !maturityDate) {
    throw new Error("Vui lòng nhập ngày theo định dạng dd/mm/yyyy.");
  }
  if (!(maturityDate > startDate)) {
    throw new Error("Ngày đáo hạn phải sau ngày giải ngân.");
  }

  const dates = buildPaymentDates(startDate, maturityDate);
  loan.actualPayments = loan.actualPayments || {};
  let principal = Number(loan.principal);
  let previousDate = startDate;
  const rows = [];

  dates.forEach((paymentDate, index) => {
    const period = index + 1;
    const days = dayDiff(previousDate, paymentDate);
    const { rate } = getRateForDate(loan, previousDate);
    const interestResult = getPeriodInterest(loan, principal, previousDate, paymentDate);
    const plannedInterest = interestResult.interest;
    const isLast = index === dates.length - 1;
    let plannedPrincipalPaid = 0;

    if (loan.repaymentType === "bullet") {
      plannedPrincipalPaid = isLast ? principal : 0;
    } else {
      const payment = calculatePayment(principal, rate, dates.length - index);
      plannedPrincipalPaid = Math.min(principal, Math.max(0, payment - plannedInterest));
      if (isLast) plannedPrincipalPaid = principal;
    }

    const actual = normalizeActualPayment(loan, period, plannedPrincipalPaid, plannedInterest);
    const actualPrincipalPaid = Math.min(principal, Math.max(0, actual.principal));
    const actualInterestPaid = Math.max(0, actual.interest);
    const penaltyOrPrepayment = actual.penaltyOrPrepayment;
    const totalPaid = actualPrincipalPaid + actualInterestPaid + penaltyOrPrepayment;
    principal = Math.max(0, principal - actualPrincipalPaid);

    rows.push({
      period,
      fromDate: toIsoDate(previousDate),
      toDate: toIsoDate(paymentDate),
      days,
      rateLabel: interestResult.rateLabel,
      plannedPrincipalPaid,
      plannedInterest,
      actualPrincipalPaid,
      actualInterestPaid,
      penaltyOrPrepayment,
      totalPaid,
      remainingPrincipal: principal,
      note: isLast ? [interestResult.note, "Đáo hạn"].filter(Boolean).join("; ") : interestResult.note,
    });

    previousDate = paymentDate;
  });

  const totals = rows.reduce(
    (sum, row) => ({
      plannedPrincipalPaid: sum.plannedPrincipalPaid + row.plannedPrincipalPaid,
      plannedInterest: sum.plannedInterest + row.plannedInterest,
      actualPrincipalPaid: sum.actualPrincipalPaid + row.actualPrincipalPaid,
      actualInterestPaid: sum.actualInterestPaid + row.actualInterestPaid,
      penaltyOrPrepayment: sum.penaltyOrPrepayment + row.penaltyOrPrepayment,
      totalPaid: sum.totalPaid + row.totalPaid,
    }),
    {
      plannedPrincipalPaid: 0,
      plannedInterest: 0,
      actualPrincipalPaid: 0,
      actualInterestPaid: 0,
      penaltyOrPrepayment: 0,
      totalPaid: 0,
    },
  );

  return { rows, totals };
}

function renderSchedule(loan) {
  elements.scheduleBody.innerHTML = "";
  elements.summary.innerHTML = "";

  if (!loan.schedule?.length) {
    elements.scheduleBody.innerHTML = `
      <tr><td colspan="13" class="empty-state">Bấm "Tính toán" để xem kế hoạch trả nợ.</td></tr>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  loan.schedule.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.period}</td>
      <td>${formatDate(row.fromDate)}</td>
      <td>${formatDate(row.toDate)}</td>
      <td>${formatNumber(row.days)}</td>
      <td>${row.rateLabel}</td>
      <td>${formatNumber(row.plannedPrincipalPaid)}</td>
      <td>${formatNumber(row.plannedInterest)}</td>
      <td>${paymentInput(row.period, "principal", row.actualPrincipalPaid)}</td>
      <td>${paymentInput(row.period, "interest", row.actualInterestPaid)}</td>
      <td>${paymentInput(row.period, "penaltyOrPrepayment", row.penaltyOrPrepayment)}</td>
      <td>${formatNumber(row.totalPaid)}</td>
      <td>${formatNumber(row.remainingPrincipal)}</td>
      <td>${row.note || ""}</td>
    `;
    fragment.appendChild(tr);
  });

  const totalRow = document.createElement("tr");
  totalRow.className = "total-row";
  totalRow.innerHTML = `
    <td colspan="5">Tổng cộng</td>
    <td>${formatNumber(loan.totals.plannedPrincipalPaid)}</td>
    <td>${formatNumber(loan.totals.plannedInterest)}</td>
    <td>${formatNumber(loan.totals.actualPrincipalPaid)}</td>
    <td>${formatNumber(loan.totals.actualInterestPaid)}</td>
    <td>${formatNumber(loan.totals.penaltyOrPrepayment)}</td>
    <td>${formatNumber(loan.totals.totalPaid)}</td>
    <td>${formatNumber(loan.schedule.at(-1).remainingPrincipal)}</td>
    <td></td>
  `;
  fragment.appendChild(totalRow);
  elements.scheduleBody.appendChild(fragment);

  elements.summary.innerHTML = `
    <div class="summary-item"><span>Lãi thực trả</span><strong>${formatNumber(loan.totals.actualInterestPaid)}</strong></div>
    <div class="summary-item"><span>Phạt/trả trước</span><strong>${formatNumber(loan.totals.penaltyOrPrepayment)}</strong></div>
    <div class="summary-item"><span>Tổng thực trả</span><strong>${formatNumber(loan.totals.totalPaid)}</strong></div>
    <div class="summary-item"><span>Số kỳ</span><strong>${loan.schedule.length}</strong></div>
  `;
}

function paymentInput(period, field, value) {
  return `
    <input
      class="payment-input"
      type="number"
      min="0"
      step="1000"
      data-period="${period}"
      data-field="${field}"
      value="${Math.round(value || 0)}"
      aria-label="${field} kỳ ${period}"
    />
  `;
}

function render() {
  renderLoanCards();
  renderForm();
  renderSchedule(selectedLoan());
}

async function exportData() {
  const blob = new Blob([JSON.stringify(getDataPayload(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "loan-planner-data.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.loans)) throw new Error("File dữ liệu không hợp lệ.");
  state.loans = parsed.loans;
  state.selectedId = parsed.selectedId || state.loans[0]?.id || null;
  await saveState();
  render();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Không tải được thư viện đăng nhập Google."));
    document.head.appendChild(script);
  });
}

function getDriveClientId() {
  const clientId = elements.googleClientId.value.trim();
  if (!clientId) {
    throw new Error("Vui lòng nhập Google OAuth Client ID trước khi kết nối Drive.");
  }
  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    throw new Error("Google OAuth Client ID chưa đúng định dạng.");
  }
  state.driveClientId = clientId;
  saveDriveSettings();
  updateDriveStatus();
  return clientId;
}

function requestGoogleAccessToken(clientId) {
  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      prompt: "consent",
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  });
}

async function driveRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    const error = new Error(message || `Google Drive trả lỗi ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

async function createDriveFile() {
  const boundary = `loan_planner_${Date.now()}`;
  const metadata = { name: DRIVE_FILE_NAME, mimeType: "application/json" };
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(getDataPayload(), null, 2),
    `--${boundary}--`,
  ].join("\r\n");

  return driveRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function updateDriveFile() {
  return driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${state.driveFileId}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(getDataPayload(), null, 2),
  });
}

async function saveToDriveNow() {
  if (!state.accessToken) return;
  if (state.isDriveSaving) return;

  state.isDriveSaving = true;
  updateDriveStatus("Đang lưu dữ liệu lên Google Drive...");

  try {
    if (state.driveFileId) {
      try {
        await updateDriveFile();
      } catch (error) {
        if (error.status !== 404) throw error;
        state.driveFileId = "";
        state.driveFileLink = "";
        const file = await createDriveFile();
        state.driveFileId = file.id;
        state.driveFileLink = file.webViewLink || "";
        saveDriveSettings();
      }
    } else {
      const file = await createDriveFile();
      state.driveFileId = file.id;
      state.driveFileLink = file.webViewLink || "";
      saveDriveSettings();
    }
    updateDriveStatus();
  } catch (error) {
    updateDriveStatus("Không lưu được lên Drive. Bấm Kết nối Drive để đăng nhập lại.");
    console.error(error);
  } finally {
    state.isDriveSaving = false;
  }
}

function scheduleDriveSave() {
  if (!state.accessToken) return;
  clearTimeout(state.driveSaveTimer);
  state.driveSaveTimer = setTimeout(() => {
    saveToDriveNow();
  }, 900);
}

async function connectDriveFile() {
  const clientId = getDriveClientId();
  updateDriveStatus("Đang mở màn hình đăng nhập Google...");
  await loadScript("https://accounts.google.com/gsi/client");
  state.accessToken = await requestGoogleAccessToken(clientId);
  updateDriveStatus("Đã đăng nhập Google. Đang tạo/cập nhật file trên Drive...");
  await saveToDriveNow();
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!parseDateInput(elements.form.startDate.value) || !parseDateInput(elements.form.maturityDate.value)) {
    alert("Vui lòng nhập ngày theo định dạng dd/mm/yyyy.");
    return;
  }
  const loan = readFormIntoLoan();
  try {
    const { rows, totals } = calculateSchedule(loan);
    loan.schedule = rows;
    loan.totals = totals;
    await saveState();
    render();
  } catch (error) {
    alert(error.message);
  }
});

elements.form.addEventListener("input", () => {
  readFormIntoLoan();
  renderLoanCards();
  saveState();
});

elements.scheduleBody.addEventListener("change", async (event) => {
  const input = event.target.closest(".payment-input");
  if (!input) return;

  const loan = selectedLoan();
  if (!loan) return;

  const period = input.dataset.period;
  const field = input.dataset.field;
  loan.actualPayments = loan.actualPayments || {};
  loan.actualPayments[period] = loan.actualPayments[period] || {};
  loan.actualPayments[period][field] = emptyToNull(input.value);

  try {
    const { rows, totals } = calculateSchedule(loan);
    loan.schedule = rows;
    loan.totals = totals;
    await saveState();
    renderSchedule(loan);
  } catch (error) {
    alert(error.message);
  }
});

elements.newLoanButton.addEventListener("click", async () => {
  const loan = getDefaultLoan();
  state.loans.unshift(loan);
  state.selectedId = loan.id;
  await saveState();
  render();
});

elements.deleteLoanButton.addEventListener("click", async () => {
  const loan = selectedLoan();
  if (!loan || !confirm(`Xóa "${loan.name}"?`)) return;
  state.loans = state.loans.filter((item) => item.id !== loan.id);
  if (!state.loans.length) state.loans.push(getDefaultLoan());
  state.selectedId = state.loans[0].id;
  await saveState();
  render();
});

elements.addRateButton.addEventListener("click", async () => {
  const loan = selectedLoan();
  loan.rateAdjustments.push({ date: loan.startDate, rate: loan.annualRate, note: "" });
  await saveState();
  render();
});

elements.addMaturityButton.addEventListener("click", async () => {
  const loan = selectedLoan();
  loan.maturityAdjustments.push({ date: getFinalMaturityDate(loan), note: "" });
  await saveState();
  render();
});

elements.exportButton.addEventListener("click", exportData);
elements.connectDriveButton.addEventListener("click", () => connectDriveFile().catch((error) => alert(error.message)));
elements.googleClientId.addEventListener("change", () => {
  state.driveClientId = elements.googleClientId.value.trim();
  saveDriveSettings();
  updateDriveStatus();
});
elements.importInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importData(file).catch((error) => alert(error.message));
  event.target.value = "";
});

loadState();
loadDriveSettings();
updateDriveStatus();
render();
