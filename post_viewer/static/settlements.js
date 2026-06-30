(() => {
  const fields = [
    "date",
    "partner",
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
  const csvHeaders = [
    "日期",
    "合作方",
    "产品",
    "IP名称",
    "粉丝数",
    "文章类型",
    "费用",
    "创作者费用",
    "大V类型",
    "买入金额",
    "链接",
    "文章标题",
    "截图",
    "阅读量",
    "评论",
    "点赞",
    "打款进度-合作方",
    "结算进度-创作者",
    "备注",
  ];
  const numericFields = new Set(["fansCount", "fee", "creatorFee", "buyAmount", "readCount", "commentCount", "likeCount"]);

  let rows = [];

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

  function displayValue(row, field) {
    const value = row[field];
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

  function render() {
    const body = document.querySelector("#settlementTableBody");
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td class="mysql-empty-row" colspan="20">Empty set</td>
        </tr>
      `;
      renderSummary();
      return;
    }
    body.innerHTML = rows
      .map(
        (row, index) => `
          <tr data-row-id="${escapeHtml(row.id || "")}">
            <td class="mysql-row-index">${index + 1}</td>
            ${fields.map((field) => cell(row, field)).join("")}
            <td class="settlement-row-actions">
              <button class="secondary compact" data-settlement-action="autofill" data-row-id="${escapeHtml(row.id || "")}" type="button">补全</button>
            </td>
          </tr>
        `,
      )
      .join("");
    renderSummary();
  }

  function renderSummary(extra = "") {
    const totalFee = rows.reduce((sum, row) => sum + Number(row.fee || 0), 0);
    const totalCreatorFee = rows.reduce((sum, row) => sum + Number(row.creatorFee || 0), 0);
    const filledLinks = rows.filter((row) => row.link).length;
    document.querySelector("#settlementSummary").innerHTML = `
      <span>Rows: <strong>${rows.length}</strong></span>
      <span>Links: <strong>${filledLinks}</strong></span>
      <span>SUM(fee): <strong>${totalFee || 0}</strong></span>
      <span>SUM(creator_fee): <strong>${totalCreatorFee || 0}</strong></span>
      ${extra ? `<span>${escapeHtml(extra)}</span>` : ""}
    `;
  }

  async function loadServerRows(extra = "") {
    document.querySelector("#settlementSourceLine").textContent = "SELECT * FROM crawler_app.kol_business_settlements ORDER BY settlement_date DESC, id DESC LIMIT 500";
    renderSummary("Loading...");
    try {
      const response = await fetch("/api/settlements");
      if (!response.ok) throw new Error(await response.text());
      rows = await response.json();
      render();
      if (extra) renderSummary(extra);
    } catch (error) {
      document.querySelector("#settlementSourceLine").textContent = error instanceof Error ? error.message : String(error);
      rows = [];
      render();
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
    rows = body.rows || [];
    render();
    renderSummary(`Imported ${body.valid_count}, inserted ${body.inserted_count}, updated ${body.updated_count}`);
    document.querySelector("#settlementSourceLine").textContent = `IMPORT FILE ${file.name}`;
  }

  async function autofillRow(id) {
    const row = rows.find((item) => String(item.id) === String(id));
    if (!row?.link) return;
    document.querySelector("#settlementSourceLine").textContent = `AUTO FILL WHERE id = ${id}`;
    const response = await fetch(`/api/settlement-autofill?post_url=${encodeURIComponent(row.link)}`);
    const body = await response.json();
    if (!response.ok) {
      document.querySelector("#settlementSourceLine").textContent = body.detail || response.statusText;
      return;
    }
    for (const field of ["date", "product", "ipName", "fansCount", "articleTitle", "screenshot", "readCount", "commentCount", "likeCount"]) {
      if (!row[field] && body[field]) row[field] = String(body[field]);
    }
    render();
    renderSummary(body.sources?.length ? `Autofill: ${body.sources.join(", ")}` : "Autofill: no source data");
  }

  async function autofillAll() {
    for (const row of rows) {
      if (row.link) await autofillRow(row.id);
    }
  }

  function csvValue(value) {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function exportCsv() {
    const lines = [
      csvHeaders.map(csvValue).join(","),
      ...rows.map((row) => fields.map((field) => csvValue(row[field])).join(",")),
    ];
    const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `大V商单结算-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bindEvents() {
    document.querySelector("#refreshSettlementButton").addEventListener("click", () => {
      loadServerRows();
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
    document.querySelector("#autofillAllSettlementButton").addEventListener("click", () => {
      autofillAll();
    });
    document.querySelector("#exportSettlementButton").addEventListener("click", exportCsv);
    document.querySelector("#settlementTableBody").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.settlementAction === "autofill") {
        autofillRow(button.dataset.rowId);
      }
    });
  }

  bindEvents();
  loadServerRows();
})();
