(() => {
  const sortLabels = {
    base_id: "基础表顺序",
    title: "Title 升序",
    title_desc: "Title 降序",
    date_desc: "日期最新",
    date_asc: "日期最早",
    platform: "平台",
    group: "群",
    fans_desc: "粉丝数高到低",
    growth_desc: "增粉数高到低",
    read_desc: "阅读数高到低",
  };

  const state = {
    payload: null,
    filters: {
      date: "",
      platform: "",
      kol_type: "",
      missing: "",
      sort: "base_id",
      q: "",
      limit: "500",
    },
  };

  const $ = (selector) => document.querySelector(selector);

  function isActive() {
    return window.location.pathname === "/kol-metrics";
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
    if (isEmpty(value)) {
      return `<span class="mysql-null">NULL</span>`;
    }
    return escapeHtml(value);
  }

  function optionList(values, selected, blankLabel) {
    return [
      `<option value="">${escapeHtml(blankLabel)}</option>`,
      ...(values || []).map((value) => `<option value="${escapeHtml(value)}"${String(value) === String(selected) ? " selected" : ""}>${escapeHtml(value)}</option>`),
    ].join("");
  }

  function readFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    for (const key of Object.keys(state.filters)) {
      state.filters[key] = params.get(key === "date" ? "date" : key) || state.filters[key] || "";
    }
    if (!state.filters.sort) state.filters.sort = "base_id";
    if (!state.filters.limit) state.filters.limit = "500";
  }

  function readFiltersFromInputs() {
    state.filters.date = $("#kolDateSelect")?.value || "";
    state.filters.platform = $("#kolPlatformSelect")?.value || "";
    state.filters.kol_type = $("#kolTypeSelect")?.value || "";
    state.filters.missing = $("#kolMissingSelect")?.value || "";
    state.filters.sort = $("#kolSortSelect")?.value || "base_id";
    state.filters.q = $("#kolSearchInput")?.value || "";
    state.filters.limit = $("#kolLimitInput")?.value || "500";
  }

  function syncUrl() {
    if (!isActive()) return;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state.filters)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/kol-metrics?${query}` : "/kol-metrics");
  }

  function apiUrl(path) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state.filters)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }

  async function fetchJson(path) {
    const response = await fetch(path);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || response.statusText);
    return body;
  }

  function renderFilters() {
    const payload = state.payload || {};
    const options = payload.options || {};
    const missingOptions = payload.missing_options || {};
    $("#kolDateSelect").innerHTML = optionList(options.dates || [], state.filters.date, "全部日期");
    $("#kolPlatformSelect").innerHTML = optionList(options.platforms || [], state.filters.platform, "全部平台");
    $("#kolTypeSelect").innerHTML = optionList(options.kol_types || [], state.filters.kol_type, "全部类型");
    $("#kolMissingSelect").innerHTML = Object.entries(missingOptions)
      .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === state.filters.missing ? " selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
    $("#kolSortSelect").innerHTML = (payload.sort_options || Object.keys(sortLabels))
      .map((value) => `<option value="${escapeHtml(value)}"${value === state.filters.sort ? " selected" : ""}>${escapeHtml(sortLabels[value] || value)}</option>`)
      .join("");
    $("#kolSearchInput").value = state.filters.q;
    $("#kolLimitInput").value = state.filters.limit;
  }

  function renderSummary() {
    const payload = state.payload || {};
    const summary = payload.summary || {};
    const rows = payload.rows || [];
    $("#kolMetricsSourceLine").textContent = (payload.tables || []).join(" / ") || "crawler_app.kol_daily_metrics";
    $("#kolMetricsSummary").innerHTML = `
      <span>显示: <strong>${rows.length}</strong></span>
      <span>总计: <strong>${summary.total_rows || 0}</strong></span>
      <span>日期: <strong>${summary.date_count || 0}</strong></span>
      <span>大V: <strong>${summary.kol_count || 0}</strong></span>
      <span>粉丝数: <strong>${summary.fans_rows || 0}</strong></span>
      <span>阅读数: <strong>${summary.read_rows || 0}</strong></span>
      <span>未匹配基础: <strong>${summary.unmatched_base_rows || 0}</strong></span>
    `;
  }

  function renderTable() {
    const payload = state.payload || {};
    const columns = payload.columns || [];
    const rows = payload.rows || [];
    $("#kolMetricsTableHead").innerHTML = `<tr><th>#</th>${columns.map(([title]) => `<th>${escapeHtml(title)}</th>`).join("")}</tr>`;
    if (!rows.length) {
      $("#kolMetricsTableBody").innerHTML = `<tr><td colspan="${(columns.length || 0) + 1}" class="mysql-empty-row">Empty set</td></tr>`;
      return;
    }
    const numericKeys = new Set(["fans_count", "growth_count", "read_count", "post_count_24h"]);
    const wideKeys = new Set(["kol_name", "homepage_url", "source_doc_url", "target_doc_url"]);
    $("#kolMetricsTableBody").innerHTML = rows
      .map((row, index) => {
        const cells = columns.map(([, key]) => {
          if (key === "homepage_url" && row[key]) {
            return `<td class="mysql-cell mysql-wide"><a class="mysql-link" href="${escapeHtml(row[key])}" target="_blank" rel="noreferrer">${escapeHtml(row[key])}</a></td>`;
          }
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
    $("#kolMetricsSourceLine").textContent = message;
    $("#kolMetricsSummary").innerHTML = "";
    $("#kolMetricsTableHead").innerHTML = "";
    $("#kolMetricsTableBody").innerHTML = `<tr><td class="mysql-empty-row">${escapeHtml(message)}</td></tr>`;
  }

  async function loadKolMetrics() {
    if (!isActive()) return;
    $("#kolMetricsRefreshButton").disabled = true;
    $("#kolMetricsSourceLine").textContent = "正在读取 KOL 指标...";
    try {
      state.payload = await fetchJson(apiUrl("/api/kol-metrics"));
      renderFilters();
      renderSummary();
      renderTable();
      syncUrl();
    } catch (error) {
      renderError(error);
    } finally {
      $("#kolMetricsRefreshButton").disabled = false;
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

  async function copyTable() {
    await copyText(rowsToTsv());
    const button = $("#kolMetricsCopyButton");
    const oldText = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = oldText;
    }, 1200);
  }

  function downloadExcel() {
    window.location.href = apiUrl("/api/kol-metrics/export.xlsx");
  }

  function bindEvents() {
    const filterIds = ["#kolDateSelect", "#kolPlatformSelect", "#kolTypeSelect", "#kolMissingSelect", "#kolSortSelect", "#kolLimitInput"];
    for (const selector of filterIds) {
      $(selector)?.addEventListener("change", () => {
        readFiltersFromInputs();
        loadKolMetrics();
      });
    }
    $("#kolSearchInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        readFiltersFromInputs();
        loadKolMetrics();
      }
    });
    $("#kolMetricsRefreshButton")?.addEventListener("click", () => {
      readFiltersFromInputs();
      loadKolMetrics();
    });
    $("#kolMetricsCopyButton")?.addEventListener("click", () => copyTable().catch(renderError));
    $("#kolMetricsExportButton")?.addEventListener("click", downloadExcel);
  }

  readFiltersFromUrl();
  bindEvents();
  loadKolMetrics();
})();
