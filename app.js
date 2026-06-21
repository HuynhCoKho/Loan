const STORAGE_KEY = "loan-planner-v1";
const moneyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

const state = {
  loans: [],
  selectedId: null,
  fileHandle: null,
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
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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

function formatMoney(value) {
  return moneyFormatter.format(Math.round(value || 0));
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

async function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ loans: state.loans, selectedId: state.selectedId }, null, 2),
  );

  if (state.fileHandle) {
    const writable = await state.fileHandle.createWritable();
    await writable.write(JSON.stringify({ loans: state.loans }, null, 2));
    await writable.close();
  }
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
      <span>${formatMoney(Number(loan.principal))}</span>
      <span>${loan.startDate || ""} đến ${getFinalMaturityDate(loan) || ""}</span>
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
  elements.form.startDate.value = loan.startDate || "";
  elements.form.maturityDate.value = loan.maturityDate || "";
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
    dateInput.type = "date";
    dateInput.value = row.date || "";
    dateInput.addEventListener("input", () => updateAdjustment("rateAdjustments", index, "date", dateInput.value));

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
      adjustmentLabel("Ngày áp dụng", dateInput),
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
    dateInput.type = "date";
    dateInput.value = row.date || "";
    dateInput.addEventListener("input", () => updateAdjustment("maturityAdjustments", index, "date", dateInput.value));

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

  loan.name = elements.form.loanName.value.trim() || "Khoản vay chưa đặt tên";
  loan.principal = Number(elements.form.principal.value);
  loan.startDate = elements.form.startDate.value;
  loan.maturityDate = elements.form.maturityDate.value;
  loan.annualRate = Number(elements.form.annualRate.value);
  loan.interestMode = elements.form.interestMode.value;
  loan.repaymentType = elements.form.repaymentType.value;
  loan.notes = elements.form.notes.value.trim();
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

function calculateSchedule(loan) {
  const startDate = fromIsoDate(loan.startDate);
  const maturityDate = fromIsoDate(getFinalMaturityDate(loan));
  if (!(maturityDate > startDate)) {
    throw new Error("Ngày đáo hạn phải sau ngày giải ngân.");
  }

  const dates = buildPaymentDates(startDate, maturityDate);
  let principal = Number(loan.principal);
  let previousDate = startDate;
  const rows = [];

  dates.forEach((paymentDate, index) => {
    const days = dayDiff(previousDate, paymentDate);
    const { rate } = getRateForDate(loan, previousDate);
    const interestResult = getPeriodInterest(loan, principal, previousDate, paymentDate);
    const interest = interestResult.interest;
    const isLast = index === dates.length - 1;
    let principalPaid = 0;

    if (loan.repaymentType === "bullet") {
      principalPaid = isLast ? principal : 0;
    } else {
      const payment = calculatePayment(principal, rate, dates.length - index);
      principalPaid = Math.min(principal, Math.max(0, payment - interest));
      if (isLast) principalPaid = principal;
    }

    const totalPaid = principalPaid + interest;
    principal = Math.max(0, principal - principalPaid);

    rows.push({
      period: index + 1,
      fromDate: toIsoDate(previousDate),
      toDate: toIsoDate(paymentDate),
      days,
      rateLabel: interestResult.rateLabel,
      principalPaid,
      interest,
      totalPaid,
      remainingPrincipal: principal,
      note: isLast ? [interestResult.note, "Đáo hạn"].filter(Boolean).join("; ") : interestResult.note,
    });

    previousDate = paymentDate;
  });

  const totals = rows.reduce(
    (sum, row) => ({
      principalPaid: sum.principalPaid + row.principalPaid,
      interest: sum.interest + row.interest,
      totalPaid: sum.totalPaid + row.totalPaid,
    }),
    { principalPaid: 0, interest: 0, totalPaid: 0 },
  );

  return { rows, totals };
}

function renderSchedule(loan) {
  elements.scheduleBody.innerHTML = "";
  elements.summary.innerHTML = "";

  if (!loan.schedule?.length) {
    elements.scheduleBody.innerHTML = `
      <tr><td colspan="10" class="empty-state">Bấm "Tính toán" để xem kế hoạch trả nợ.</td></tr>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  loan.schedule.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.period}</td>
      <td>${row.fromDate}</td>
      <td>${row.toDate}</td>
      <td>${numberFormatter.format(row.days)}</td>
      <td>${row.rateLabel}</td>
      <td>${formatMoney(row.principalPaid)}</td>
      <td>${formatMoney(row.interest)}</td>
      <td>${formatMoney(row.totalPaid)}</td>
      <td>${formatMoney(row.remainingPrincipal)}</td>
      <td>${row.note || ""}</td>
    `;
    fragment.appendChild(tr);
  });

  const totalRow = document.createElement("tr");
  totalRow.className = "total-row";
  totalRow.innerHTML = `
    <td colspan="5">Tổng cộng</td>
    <td>${formatMoney(loan.totals.principalPaid)}</td>
    <td>${formatMoney(loan.totals.interest)}</td>
    <td>${formatMoney(loan.totals.totalPaid)}</td>
    <td>${formatMoney(loan.schedule.at(-1).remainingPrincipal)}</td>
    <td></td>
  `;
  fragment.appendChild(totalRow);
  elements.scheduleBody.appendChild(fragment);

  elements.summary.innerHTML = `
    <div class="summary-item"><span>Tổng lãi</span><strong>${formatMoney(loan.totals.interest)}</strong></div>
    <div class="summary-item"><span>Gốc + lãi</span><strong>${formatMoney(loan.totals.totalPaid)}</strong></div>
    <div class="summary-item"><span>Số kỳ</span><strong>${loan.schedule.length}</strong></div>
  `;
}

function render() {
  renderLoanCards();
  renderForm();
  renderSchedule(selectedLoan());
}

async function exportData() {
  const blob = new Blob([JSON.stringify({ loans: state.loans }, null, 2)], { type: "application/json" });
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
  state.selectedId = state.loans[0]?.id || null;
  await saveState();
  render();
}

async function connectDriveFile() {
  if (!window.showSaveFilePicker) {
    alert("Trình duyệt này chưa hỗ trợ kết nối file. Bạn vẫn có thể dùng Xuất dữ liệu/Nhập dữ liệu.");
    return;
  }

  state.fileHandle = await window.showSaveFilePicker({
    suggestedName: "loan-planner-data.json",
    types: [{ description: "Loan planner JSON", accept: { "application/json": [".json"] } }],
  });
  await saveState();
  alert("Đã kết nối file dữ liệu. Nếu lưu file này trong thư mục Google Drive đồng bộ, dữ liệu sẽ được Drive sao lưu.");
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
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
elements.importInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importData(file).catch((error) => alert(error.message));
  event.target.value = "";
});

loadState();
render();
