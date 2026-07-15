(() => {
  const state = {
    payload: null,
    filters: {
      date: "",
      limit: "200",
    },
  };

  const $ = (selector) => document.querySelector(selector);

  function isActive() {
    return window.location.pathname === "/hot-funds";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function cell(value) {
    return String(value ?? "").replace(/\r?\n/g, " ").replace(/\t/g, " ").trim();
  }

  function numberText(value) {
    if (value === null || value === undefined || value === "") return "";
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("zh-CN") : String(value);
  }

  function isEmpty(value) {
    return value === null || value === undefined || value === "";
  }

  function mysqlValue(value) {
    if (isEmpty(value)) return `<span class="mysql-null">NULL</span>`;
    return escapeHtml(value);
  }

  function optionList(values, selected, blankLabel) {
    return [
      `<option value="">${escapeHtml(blankLabel)}</option>`,
      ...(values || []).map((value) => `<option value="${escapeHtml(value)}"${String(value) === selected ? " selected" : ""}>${escapeHtml(value)}</option>`),
    ].join("");
  }

  function readFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    state.filters.date = params.get("date") || "";
    state.filters.limit = params.get("limit") || state.filters.limit;
  }

  function readFiltersFromInputs() {
    state.filters.date = $("#hotFundsDateSelect")?.value || "";
    state.filters.limit = $("#hotFundsLimitInput")?.value || "200";
  }

  function syncUrl() {
    if (!isActive()) return;
    const params = new URLSearchParams();
    if (state.filters.date) params.set("date", state.filters.date);
    if (state.filters.limit && state.filters.limit !== "200") params.set("limit", state.filters.limit);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/hot-funds?${query}` : "/hot-funds");
  }

  function apiUrl(path) {
    const params = new URLSearchParams();
    if (state.filters.date) params.set("date", state.filters.date);
    if (state.filters.limit) params.set("limit", state.filters.limit);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || response.statusText);
    return body;
  }

  function renderFilters() {
    const payload = state.payload || {};
    const options = payload.options || {};
    $("#hotFundsDateSelect").innerHTML = optionList(options.dates || [], state.filters.date, "全部日期");
    $("#hotFundsLimitInput").value = state.filters.limit;
  }

  function renderSummary() {
    const payload = state.payload || {};
    const summary = payload.summary || {};
    const rows = payload.rows || [];
    $("#hotFundsSourceLine").textContent = payload.table || "crawler_app.alipay_hot_fund_rankings";
    $("#hotFundsSummary").innerHTML = `
      <span>显示: <strong>${rows.length}</strong></span>
      <span>总计: <strong>${summary.total_rows || 0}</strong></span>
      <span>日期: <strong>${summary.date_count || 0}</strong></span>
      <span>截图: <strong>${summary.screenshot_rows || 0}</strong></span>
    `;
  }

  function screenshotCell(row) {
    const url = row.screenshot_url || "";
    if (!url) return `<td class="mysql-cell mysql-wide">${mysqlValue(url)}</td>`;
    return `
      <td class="mysql-cell mysql-wide hot-funds-screenshot-cell">
        <a class="mysql-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
      </td>
    `;
  }

  function renderTable() {
    const payload = state.payload || {};
    const columns = payload.columns || [];
    const rows = payload.rows || [];
    $("#hotFundsTableHead").innerHTML = `<tr><th>#</th>${columns.map(([title]) => `<th>${escapeHtml(title)}</th>`).join("")}</tr>`;
    if (!rows.length) {
      $("#hotFundsTableBody").innerHTML = `<tr><td colspan="${(columns.length || 0) + 1}" class="mysql-empty-row">Empty set</td></tr>`;
      return;
    }
    const numericKeys = new Set(["rank_no"]);
    const wideKeys = new Set(["fund_name", "screenshot_url"]);
    $("#hotFundsTableBody").innerHTML = rows
      .map((row, index) => {
        const cells = columns.map(([, key]) => {
          if (key === "screenshot_url") return screenshotCell(row);
          const value = numericKeys.has(key) ? numberText(row[key]) : row[key];
          const classNames = ["mysql-cell"];
          if (numericKeys.has(key)) classNames.push("mysql-number");
          if (wideKeys.has(key)) classNames.push("mysql-wide");
          return `<td class="${classNames.join(" ")}">${mysqlValue(value)}</td>`;
        });
        return `<tr><td class="mysql-row-index">${index + 1}</td>${cells.join("")}</tr>`;
      })
      .join("");
  }

  function renderError(error) {
    const message = error instanceof Error ? error.message : String(error);
    $("#hotFundsSourceLine").textContent = message;
    $("#hotFundsSummary").innerHTML = "";
    $("#hotFundsTableHead").innerHTML = "";
    $("#hotFundsTableBody").innerHTML = `<tr><td class="mysql-empty-row">${escapeHtml(message)}</td></tr>`;
  }

  async function loadHotFunds() {
    if (!isActive()) return;
    $("#hotFundsRefreshButton").disabled = true;
    $("#hotFundsSourceLine").textContent = "正在读取支付宝热门基金榜...";
    try {
      state.payload = await fetchJson(apiUrl("/api/hot-funds"));
      renderFilters();
      renderSummary();
      renderTable();
      syncUrl();
    } catch (error) {
      renderError(error);
    } finally {
      $("#hotFundsRefreshButton").disabled = false;
    }
  }

  function rowsToTsv() {
    const payload = state.payload || {};
    const columns = payload.columns || [];
    const rows = payload.rows || [];
    return [
      columns.map(([title]) => title).join("\t"),
      ...rows.map((row) => columns.map(([, key]) => cell(row[key])).join("\t")),
    ].join("\r\n");
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  async function copyTable() {
    await copyText(rowsToTsv());
    const button = $("#hotFundsCopyButton");
    const oldText = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = oldText;
    }, 1200);
  }

  function bindEvents() {
    $("#hotFundsDateSelect")?.addEventListener("change", () => {
      readFiltersFromInputs();
      loadHotFunds();
    });
    $("#hotFundsLimitInput")?.addEventListener("change", () => {
      readFiltersFromInputs();
      loadHotFunds();
    });
    $("#hotFundsRefreshButton")?.addEventListener("click", () => {
      readFiltersFromInputs();
      loadHotFunds();
    });
    $("#hotFundsCopyButton")?.addEventListener("click", () => copyTable().catch(renderError));
  }

  readFiltersFromUrl();
  bindEvents();
  loadHotFunds();
})();
