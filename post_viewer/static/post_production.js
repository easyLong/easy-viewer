(() => {
  const state = {
    payload: null,
    filters: {
      date: "",
      title: "",
      limit: "200",
    },
    searchTimer: null,
  };

  const $ = (selector) => document.querySelector(selector);

  function isActive() {
    return window.location.pathname === "/post-production";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function plainText(value) {
    return String(value ?? "").trim();
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
    state.filters.title = params.get("title") || "";
    state.filters.limit = params.get("limit") || state.filters.limit;
  }

  function readFiltersFromInputs() {
    state.filters.date = $("#publishDateSelect")?.value || "";
    state.filters.title = $("#publishTitleInput")?.value || "";
    state.filters.limit = $("#publishLimitInput")?.value || "200";
  }

  function syncUrl() {
    if (!isActive()) return;
    const params = new URLSearchParams();
    if (state.filters.date) params.set("date", state.filters.date);
    if (state.filters.title) params.set("title", state.filters.title);
    if (state.filters.limit && state.filters.limit !== "200") params.set("limit", state.filters.limit);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/post-production?${query}` : "/post-production");
  }

  function apiUrl(path) {
    const params = new URLSearchParams();
    if (state.filters.date) params.set("date", state.filters.date);
    if (state.filters.title) params.set("title", state.filters.title);
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
    $("#publishDateSelect").innerHTML = optionList(options.dates || [], state.filters.date, "最新日期");
    $("#publishTitleInput").value = state.filters.title;
    $("#publishLimitInput").value = state.filters.limit;
  }

  function renderSummary() {
    const payload = state.payload || {};
    const summary = payload.summary || {};
    const rows = payload.rows || [];
    $("#publishSourceLine").textContent = payload.table || "post_supplement_lib.t_publish_tasks";
    $("#publishSummary").innerHTML = `
      <span>显示: <strong>${rows.length}</strong></span>
      <span>总计: <strong>${summary.total_rows || 0}</strong></span>
      <span>日期: <strong>${summary.date_count || 0}</strong></span>
      <span>选题: <strong>${summary.title_count || 0}</strong></span>
    `;
  }

  function taskCopyText(row) {
    const title = plainText(row.title);
    const body = plainText(row.body);
    return [`选题：${title}`, "", "最终版正文：", body].join("\n");
  }

  function taskTags(row) {
    return [
      row.date ? `<span>${escapeHtml(row.date)}</span>` : "",
      row.task_id ? `<span>task_id: ${escapeHtml(row.task_id)}</span>` : "",
      row.status ? `<span>${escapeHtml(row.status)}</span>` : "",
      row.quality_score !== "" ? `<span>score: ${escapeHtml(row.quality_score)}</span>` : "",
    ].join("");
  }

  function renderTaskItem(row, index) {
    const title = row.title || "无选题";
    const body = row.body || "";
    return `
      <article class="post-item publish-post-item">
        <div class="post-content">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(body)}</p>
        </div>
        <footer class="post-footer">
          <div class="post-tags">${taskTags(row)}</div>
          <button class="secondary compact publish-copy-button" data-index="${index}" type="button">复制正文</button>
        </footer>
      </article>
    `;
  }

  function renderResults() {
    const rows = state.payload?.rows || [];
    const list = $("#publishResultsList");
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state">没有找到符合条件的帖子</div>`;
      return;
    }
    list.innerHTML = rows.map(renderTaskItem).join("");
  }

  function renderError(error) {
    const message = error instanceof Error ? error.message : String(error);
    $("#publishSourceLine").textContent = message;
    $("#publishSummary").innerHTML = "";
    $("#publishResultsList").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  async function loadPublishTasks() {
    if (!isActive()) return;
    $("#publishRefreshButton").disabled = true;
    $("#publishSourceLine").textContent = "正在读取KOL帖子生产数据...";
    try {
      state.payload = await fetchJson(apiUrl("/api/post-production"));
      if (!state.filters.date && state.payload?.filters?.trade_date) {
        state.filters.date = state.payload.filters.trade_date;
      }
      renderFilters();
      renderSummary();
      renderResults();
      syncUrl();
    } catch (error) {
      renderError(error);
    } finally {
      $("#publishRefreshButton").disabled = false;
    }
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

  async function copyTask(index, button) {
    const row = state.payload?.rows?.[index];
    if (!row) return;
    await copyText(taskCopyText(row));
    const oldText = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = oldText;
    }, 1200);
  }

  function debounceLoad() {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      readFiltersFromInputs();
      loadPublishTasks();
    }, 300);
  }

  function bindEvents() {
    $("#publishDateSelect")?.addEventListener("change", () => {
      readFiltersFromInputs();
      loadPublishTasks();
    });
    $("#publishTitleInput")?.addEventListener("input", debounceLoad);
    $("#publishLimitInput")?.addEventListener("change", () => {
      readFiltersFromInputs();
      loadPublishTasks();
    });
    $("#publishRefreshButton")?.addEventListener("click", () => {
      readFiltersFromInputs();
      loadPublishTasks();
    });
    $("#publishResultsList")?.addEventListener("click", (event) => {
      const button = event.target.closest(".publish-copy-button");
      if (!button) return;
      copyTask(Number(button.dataset.index), button).catch(renderError);
    });
  }

  readFiltersFromUrl();
  bindEvents();
  loadPublishTasks();
})();
