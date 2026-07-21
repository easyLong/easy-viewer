(() => {
  const fields = [
    "date",
    "partner",
    "deliveryPlatform",
    "product",
    "ipName",
    "fansCount",
    "articleType",
    "fee",
    "creatorFee",
    "kolType",
    "buyAmount",
    "link",
    "articleTitle",
    "screenshot",
    "readCount",
    "commentCount",
    "likeCount",
    "partnerPaymentStatus",
    "creatorSettlementStatus",
    "notes",
  ];
  const numericFields = new Set(["fansCount", "fee", "creatorFee", "buyAmount", "readCount", "commentCount", "likeCount"]);
  const headerLabels = {
    date: "日期",
    partner: "合作方",
    deliveryPlatform: "投放平台",
    product: "产品",
    ipName: "IP名称",
    fansCount: "粉丝数",
    articleType: "文章类型",
    fee: "费用",
    creatorFee: "创作者费用",
    kolType: "大V类型",
    buyAmount: "买入金额",
    link: "链接",
    articleTitle: "文章标题",
    screenshot: "截图",
    readCount: "阅读量",
    commentCount: "评论",
    likeCount: "点赞",
    notes: "备注",
    partnerPaymentStatus: "打款进度-合作方",
    creatorSettlementStatus: "结算进度-创作者",
  };

  let rows = [];
  let viewMode = "all";
  let chartsVisible = false;
  let publicBaseUrl = "";
  const filters = {
    startDate: "",
    endDate: "",
    partner: "",
    deliveryPlatform: "",
    kolType: "",
    ipName: "",
    missing: "",
    sort: "date_desc",
  };
  const customerHiddenFields = new Set(["creatorFee", "kolType", "partnerPaymentStatus", "creatorSettlementStatus"]);
  const metricMissingFields = ["fansCount", "commentCount", "likeCount"];
  const missingOptions = {
    "": "全部",
    metrics_any_empty: "粉丝/评论/点赞任一为空",
    fans_empty: "粉丝数为空",
    comments_empty: "评论为空",
    likes_empty: "点赞为空",
    metrics_complete: "粉丝/评论/点赞完整",
  };
  const sortOptions = {
    date_desc: "日期最新",
    date_asc: "日期最早",
    fee_desc: "费用高到低",
    fee_asc: "费用低到高",
    read_desc: "阅读量高到低",
    read_asc: "阅读量低到高",
    partner_asc: "合作方升序",
    delivery_platform_asc: "投放平台升序",
    ip_asc: "IP名称升序",
  };

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function isEmpty(value) {
    return value === null || value === undefined || value === "";
  }

  function normalizeLocalUrl(value) {
    const text = String(value || "").trim();
    if (!text || !publicBaseUrl) return text;
    try {
      const source = new URL(text);
      if (!["127.0.0.1", "localhost", "0.0.0.0", "::1"].includes(source.hostname)) return text;
      const target = new URL(publicBaseUrl);
      source.protocol = target.protocol;
      source.host = target.host;
      return source.toString();
    } catch {
      return text;
    }
  }

  function normalizeRow(row) {
    return {
      ...row,
      screenshot: normalizeLocalUrl(row.screenshot),
    };
  }

  function setRows(nextRows) {
    rows = Array.isArray(nextRows) ? nextRows.map(normalizeRow) : [];
  }

  function displayValue(row, field) {
    const value = field === "screenshot" ? normalizeLocalUrl(row[field]) : row[field];
    if (isEmpty(value)) {
      return `<span class="mysql-null">NULL</span>`;
    }
    if (field === "link" || field === "screenshot") {
      return `<a class="mysql-link" href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`;
    }
    return escapeHtml(value);
  }

  function statusClass(value) {
    if (String(value || "").includes("已")) return "done";
    if (String(value || "").includes("未")) return "todo";
    return "pending";
  }

  function cell(row, field) {
    const classNames = ["mysql-cell"];
    if (numericFields.has(field)) classNames.push("mysql-number");
    if (field === "link" || field === "articleTitle" || field === "screenshot" || field === "notes") classNames.push("mysql-wide");
    if (field === "partnerPaymentStatus" || field === "creatorSettlementStatus") classNames.push(`mysql-status-${statusClass(row[field])}`);
    return `<td class="${classNames.join(" ")}">${displayValue(row, field)}</td>`;
  }

  function numericSum(rowsToSum, field) {
    return rowsToSum.reduce((sum, row) => {
      const value = Number(row[field]);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }

  function formatSum(field, value) {
    if (["fee", "creatorFee", "buyAmount"].includes(field)) return value.toFixed(2);
    return String(Math.round(value));
  }

  function moneyValue(value) {
    const number = Number(String(value ?? "").replaceAll(",", ""));
    return Number.isFinite(number) ? number : 0;
  }

  function formatMoney(value) {
    return moneyValue(value).toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPercent(value, total) {
    if (!total) return "0.0%";
    return `${((value / total) * 100).toFixed(1)}%`;
  }

  function groupFee(rowsToGroup, keyFn) {
    const groups = new Map();
    for (const row of rowsToGroup) {
      const key = keyFn(row) || "未填写";
      groups.set(key, (groups.get(key) || 0) + moneyValue(row.fee));
    }
    return [...groups.entries()].map(([label, value]) => ({ label, value }));
  }

  function renderEmptyChart(selector) {
    const element = document.querySelector(selector);
    if (element) element.innerHTML = `<div class="settlement-chart-empty">暂无费用数据</div>`;
  }

  function renderVerticalBarChart(selector, items) {
    const element = document.querySelector(selector);
    if (!element) return;
    const max = Math.max(...items.map((item) => item.value), 0);
    if (!max) {
      renderEmptyChart(selector);
      return;
    }
    element.innerHTML = `
      <div class="settlement-vbar-chart">
        ${items
          .map((item) => {
            const height = Math.max(4, (item.value / max) * 100);
            return `
              <div class="settlement-vbar-item">
                <div class="settlement-vbar-value">${escapeHtml(formatMoney(item.value))}</div>
                <div class="settlement-vbar-track">
                  <div class="settlement-vbar-fill" style="height:${height}%"></div>
                </div>
                <div class="settlement-vbar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderHorizontalBarChart(selector, items) {
    const element = document.querySelector(selector);
    if (!element) return;
    const max = Math.max(...items.map((item) => item.value), 0);
    if (!max) {
      renderEmptyChart(selector);
      return;
    }
    element.innerHTML = `
      <div class="settlement-hbar-chart">
        ${items
          .map((item) => {
            const width = Math.max(3, (item.value / max) * 100);
            return `
              <div class="settlement-hbar-row">
                <div class="settlement-hbar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div>
                <div class="settlement-hbar-track">
                  <div class="settlement-hbar-fill" style="width:${width}%"></div>
                </div>
                <div class="settlement-hbar-value">${escapeHtml(formatMoney(item.value))}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderPieChart(selector, items) {
    const element = document.querySelector(selector);
    if (!element) return;
    const total = items.reduce((sum, item) => sum + item.value, 0);
    if (!total) {
      renderEmptyChart(selector);
      return;
    }
    const colors = ["#93c5fd", "#fca5a5", "#dbeafe"];
    let cursor = 0;
    const stops = items
      .map((item, index) => {
        const start = cursor;
        cursor += (item.value / total) * 100;
        return `${colors[index % colors.length]} ${start}% ${cursor}%`;
      })
      .join(", ");
    element.innerHTML = `
      <div class="settlement-pie" style="background:conic-gradient(${stops})">
        <span>${escapeHtml(formatMoney(total))}</span>
      </div>
      <div class="settlement-pie-legend">
        ${items
          .map(
            (item, index) => `
              <div class="settlement-pie-row">
                <i style="background:${colors[index % colors.length]}"></i>
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(formatMoney(item.value))}</strong>
                <em>${escapeHtml(formatPercent(item.value, total))}</em>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function typeBucket(row) {
    const value = String(row.kolType || "").trim();
    if (value.includes("内")) return "内部";
    if (value.includes("外")) return "外部";
    return "未填写";
  }

  function renderCharts(summaryRows) {
    const section = document.querySelector("#settlementCharts");
    if (!section) return;
    section.hidden = !chartsVisible;
    if (!chartsVisible) return;

    const feeRows = summaryRows.filter((row) => moneyValue(row.fee) > 0);
    const dateItems = groupFee(feeRows, (row) => row.date || "未填写").sort((a, b) => compareText(b.label, a.label));
    const typeItems = groupFee(feeRows, typeBucket).sort((a, b) => {
      const order = { 外部: 0, 内部: 1, 未填写: 2 };
      return (order[a.label] ?? 3) - (order[b.label] ?? 3);
    });
    const partnerItems = groupFee(feeRows, (row) => row.partner || "未填写").sort((a, b) => b.value - a.value || compareText(a.label, b.label));

    renderVerticalBarChart("#settlementDateChart", dateItems);
    renderPieChart("#settlementTypeChart", typeItems);
    renderHorizontalBarChart("#settlementPartnerChart", partnerItems);
  }

  function renderStatsPanel(summaryRows) {
    const panel = document.querySelector("#settlementStats");
    if (!panel) return;
    panel.innerHTML = "";
  }

  function renderStatsRow(summaryRows, tableFields) {
    const foot = document.querySelector("#settlementTableFoot");
    if (!foot) return;
    if (!summaryRows.length) {
      foot.innerHTML = "";
      return;
    }
    foot.innerHTML = `
      <tr class="mysql-sum-row">
        <td class="mysql-row-index">SUM</td>
        ${tableFields
          .map((field) => {
            if (!numericFields.has(field)) return `<td></td>`;
            return `<td class="mysql-cell mysql-number">${formatSum(field, numericSum(summaryRows, field))}</td>`;
          })
          .join("")}
      </tr>
    `;
  }

  function visibleFields() {
    if (viewMode !== "customer") return fields;
    return fields.filter((field) => !customerHiddenFields.has(field));
  }

  function renderColumnVisibility() {
    document.querySelectorAll("[data-settlement-field]").forEach((element) => {
      const field = element.dataset.settlementField;
      element.hidden = viewMode === "customer" && customerHiddenFields.has(field);
    });
    const table = document.querySelector(".settlement-table");
    if (table) table.classList.toggle("settlement-table-customer", viewMode === "customer");
    const select = document.querySelector("#settlementViewModeSelect");
    if (select) select.value = viewMode;
  }

  function hasMetricEmpty(row) {
    return metricMissingFields.some((field) => isEmpty(row[field]));
  }

  function hasMetricComplete(row) {
    return metricMissingFields.every((field) => !isEmpty(row[field]));
  }

  function matchesMissingFilter(row) {
    if (filters.missing === "metrics_any_empty") return hasMetricEmpty(row);
    if (filters.missing === "fans_empty") return isEmpty(row.fansCount);
    if (filters.missing === "comments_empty") return isEmpty(row.commentCount);
    if (filters.missing === "likes_empty") return isEmpty(row.likeCount);
    if (filters.missing === "metrics_complete") return hasMetricComplete(row);
    return true;
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function compareText(a, b) {
    return String(a || "").localeCompare(String(b || ""), "zh-Hans-CN");
  }

  function sortedRows(sourceRows) {
    const sort = filters.sort || "date_desc";
    const sorted = [...sourceRows];
    sorted.sort((a, b) => {
      if (sort === "date_asc") return compareText(a.date, b.date) || Number(a.id || 0) - Number(b.id || 0);
      if (sort === "fee_desc" || sort === "fee_asc") {
        const av = numberValue(a.fee);
        const bv = numberValue(b.fee);
        const value = (av ?? -Infinity) - (bv ?? -Infinity);
        return sort === "fee_asc" ? value : -value;
      }
      if (sort === "read_desc" || sort === "read_asc") {
        const av = numberValue(a.readCount);
        const bv = numberValue(b.readCount);
        const value = (av ?? -Infinity) - (bv ?? -Infinity);
        return sort === "read_asc" ? value : -value;
      }
      if (sort === "partner_asc") return compareText(a.partner, b.partner) || compareText(a.date, b.date);
      if (sort === "delivery_platform_asc") return compareText(a.deliveryPlatform, b.deliveryPlatform) || compareText(a.date, b.date);
      if (sort === "ip_asc") return compareText(a.ipName, b.ipName) || compareText(a.date, b.date);
      return compareText(b.date, a.date) || Number(b.id || 0) - Number(a.id || 0);
    });
    return sorted;
  }

  function filteredRows() {
    const matchedRows = rows.filter((row) => {
      if (filters.startDate && row.date < filters.startDate) return false;
      if (filters.endDate && row.date > filters.endDate) return false;
      if (filters.partner && row.partner !== filters.partner) return false;
      if (filters.deliveryPlatform && row.deliveryPlatform !== filters.deliveryPlatform) return false;
      if (filters.kolType && row.kolType !== filters.kolType) return false;
      if (filters.ipName && row.ipName !== filters.ipName) return false;
      return matchesMissingFilter(row);
    });
    return sortedRows(matchedRows);
  }

  function uniqueOptions(field) {
    return [...new Set(rows.map((row) => String(row[field] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }

  function optionList(values, selected, allLabel) {
    return [
      `<option value="">${escapeHtml(allLabel)}</option>`,
      ...values.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`),
    ].join("");
  }

  function renderFilterSelects() {
    const configs = [
      ["#settlementPartnerSelect", "partner", "partner", "全部合作方"],
      ["#settlementDeliveryPlatformSelect", "deliveryPlatform", "deliveryPlatform", "全部投放平台"],
      ["#settlementKolTypeSelect", "kolType", "kolType", "全部内外部"],
      ["#settlementIpNameSelect", "ipName", "ipName", "全部 IP"],
    ];
    for (const [selector, filterKey, field, allLabel] of configs) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const values = uniqueOptions(field);
      if (filters[filterKey] && !values.includes(filters[filterKey])) {
        filters[filterKey] = "";
      }
      element.innerHTML = optionList(values, filters[filterKey], allLabel);
      element.value = filters[filterKey];
    }
    const missingSelect = document.querySelector("#settlementMissingSelect");
    if (missingSelect) {
      missingSelect.innerHTML = Object.entries(missingOptions)
        .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === filters.missing ? " selected" : ""}>${escapeHtml(label)}</option>`)
        .join("");
    }
    const sortSelect = document.querySelector("#settlementSortSelect");
    if (sortSelect) {
      sortSelect.innerHTML = Object.entries(sortOptions)
        .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === filters.sort ? " selected" : ""}>${escapeHtml(label)}</option>`)
        .join("");
    }
    const startDateInput = document.querySelector("#settlementStartDateInput");
    if (startDateInput) startDateInput.value = filters.startDate;
    const endDateInput = document.querySelector("#settlementEndDateInput");
    if (endDateInput) endDateInput.value = filters.endDate;
  }

  function render() {
    const body = document.querySelector("#settlementTableBody");
    if (!body) return;
    renderColumnVisibility();
    renderFilterSelects();
    const visibleRows = filteredRows();
    const tableFields = visibleFields();
    if (!visibleRows.length) {
      body.innerHTML = `
        <tr>
          <td class="mysql-empty-row" colspan="${tableFields.length + 1}">Empty set</td>
        </tr>
      `;
      renderStatsRow(visibleRows, tableFields);
      renderSummary(visibleRows);
      renderCharts(visibleRows);
      return;
    }
    body.innerHTML = visibleRows
      .map(
        (row, index) => `
          <tr data-row-id="${escapeHtml(row.id || "")}">
            <td class="mysql-row-index">${index + 1}</td>
            ${tableFields.map((field) => cell(row, field)).join("")}
          </tr>
        `,
      )
      .join("");
    renderStatsRow(visibleRows, tableFields);
    renderSummary(visibleRows);
    renderCharts(visibleRows);
  }

  function renderSummary(summaryRows = filteredRows(), extra = "") {
    if (typeof summaryRows === "string") {
      extra = summaryRows;
      summaryRows = filteredRows();
    }
    renderStatsPanel(summaryRows);
    const summary = document.querySelector("#settlementSummary");
    if (summary) summary.textContent = extra || "";
  }

  async function loadServerRows(extra = "") {
    document.querySelector("#settlementSourceLine").textContent = "SELECT * FROM crawler_app.kol_business_settlements ORDER BY settlement_date DESC, id DESC LIMIT 500";
    renderSummary("Loading...");
    try {
      const response = await fetch("/api/settlements");
      if (!response.ok) throw new Error(await response.text());
      setRows(await response.json());
      render();
      if (extra) renderSummary(extra);
    } catch (error) {
      document.querySelector("#settlementSourceLine").textContent = error instanceof Error ? error.message : String(error);
      setRows([]);
      render();
    }
  }

  async function loadPublicBase() {
    try {
      const response = await fetch("/api/public-base");
      if (!response.ok) return;
      const body = await response.json();
      publicBaseUrl = String(body.base_url || "");
    } catch {
      publicBaseUrl = "";
    }
  }

  async function importFile(file) {
    renderSummary("Importing...");
    const data = new FormData();
    data.append("file", file);
    const response = await fetch("/api/settlements/import-file", {
      method: "POST",
      body: data,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail || response.statusText);
    setRows(body.rows || []);
    render();
    renderSummary(`Imported ${body.valid_count}, inserted ${body.inserted_count}, updated ${body.updated_count}`);
    document.querySelector("#settlementSourceLine").textContent = `IMPORT FILE ${file.name}`;
  }

  async function fillFansCount() {
    const targetRows = filteredRows().filter((row) => row.id && row.date && row.deliveryPlatform && row.ipName);
    if (!targetRows.length) {
      renderSummary(filteredRows(), "没有可通过 日期 + 投放平台 + IP名称 补全粉丝数的行");
      return;
    }
    document.querySelector("#settlementSourceLine").textContent = `UPDATE crawler_app.kol_business_settlements AS s JOIN crawler_app.kol_daily_metrics AS m ON s.settlement_date = m.metric_date AND s.delivery_platform = m.platform AND s.ip_name = m.kol_name SET s.fans_count = m.fans_count WHERE id IN (${targetRows.length} rows)`;
    renderSummary(filteredRows(), "正在通过 日期 + 投放平台 + IP名称 补全粉丝数...");
    const response = await fetch("/api/settlements/fill-fans-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: targetRows.map((row) => row.id) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail || response.statusText);
    setRows(body.rows || []);
    render();
    renderSummary(filteredRows(), `同步粉丝数：匹配 ${body.matched_count || 0} 行，覆盖 ${body.updated_count || 0} 行，未匹配 ${body.unmatched_count || 0} 行`);
  }

  function statsExportRow(tableFields, summaryRows) {
    return tableFields.map((field, index) => {
      if (index === 0) return "SUM";
      if (!numericFields.has(field)) return "";
      return formatSum(field, numericSum(summaryRows, field));
    });
  }

  async function exportExcel() {
    const tableFields = visibleFields();
    const exportRows = filteredRows();
    const response = await fetch("/api/settlements/export.xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: tableFields,
        rows: exportRows,
        stats: statsExportRow(tableFields, exportRows),
      }),
    });
    const blob = await response.blob();
    if (!response.ok) {
      const message = await blob.text();
      throw new Error(message || response.statusText);
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `社区大V业务看板-图片版-${today()}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bindEvents() {
    document.querySelector("#refreshSettlementButton").addEventListener("click", () => {
      loadServerRows();
    });
    document.querySelector("#downloadSettlementTemplateButton").addEventListener("click", () => {
      window.location.href = "/api/settlements/template.xlsx";
    });
    document.querySelector("#importSettlementButton").addEventListener("click", () => {
      document.querySelector("#importSettlementFileInput").click();
    });
    document.querySelector("#importSettlementFileInput").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      importFile(file).catch((error) => {
        document.querySelector("#settlementSourceLine").textContent = error instanceof Error ? error.message : String(error);
      });
      event.target.value = "";
    });
    document.querySelector("#fillFansSettlementButton").addEventListener("click", () => {
      fillFansCount().catch((error) => {
        document.querySelector("#settlementSourceLine").textContent = error instanceof Error ? error.message : String(error);
      });
    });
    document.querySelector("#toggleSettlementChartsButton").addEventListener("click", () => {
      chartsVisible = !chartsVisible;
      const button = document.querySelector("#toggleSettlementChartsButton");
      if (button) button.textContent = chartsVisible ? "隐藏图表" : "图表展示";
      render();
    });
    document.querySelector("#exportSettlementExcelButton").addEventListener("click", () => {
      exportExcel().catch((error) => {
        document.querySelector("#settlementSourceLine").textContent = error instanceof Error ? error.message : String(error);
      });
    });
    document.querySelector("#settlementViewModeSelect").addEventListener("change", (event) => {
      viewMode = event.target.value === "customer" ? "customer" : "all";
      render();
    });
    document.querySelector("#settlementStartDateInput").addEventListener("change", (event) => {
      filters.startDate = event.target.value || "";
      render();
    });
    document.querySelector("#settlementEndDateInput").addEventListener("change", (event) => {
      filters.endDate = event.target.value || "";
      render();
    });
    document.querySelector("#settlementPartnerSelect").addEventListener("change", (event) => {
      filters.partner = event.target.value || "";
      render();
    });
    document.querySelector("#settlementDeliveryPlatformSelect").addEventListener("change", (event) => {
      filters.deliveryPlatform = event.target.value || "";
      render();
    });
    document.querySelector("#settlementKolTypeSelect").addEventListener("change", (event) => {
      filters.kolType = event.target.value || "";
      render();
    });
    document.querySelector("#settlementIpNameSelect").addEventListener("change", (event) => {
      filters.ipName = event.target.value || "";
      render();
    });
    document.querySelector("#settlementMissingSelect").addEventListener("change", (event) => {
      filters.missing = event.target.value || "";
      render();
    });
    document.querySelector("#settlementSortSelect").addEventListener("change", (event) => {
      filters.sort = event.target.value || "date_desc";
      render();
    });
  }

  bindEvents();
  loadPublicBase().finally(() => loadServerRows());
})();
