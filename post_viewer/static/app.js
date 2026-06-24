const state = {
  payload: null,
  batches: [],
  dimensions: [],
  selectedBatch: "",
  style: "",
  status: "",
  selectedOptions: {},
  openCategory: "",
  keyword: "",
};

const $ = (selector) => document.querySelector(selector);

async function api(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function styleLabel(style) {
  return {
    rant: "吐槽共鸣",
    question: "提问互动",
    analysis: "轻分析",
  }[style] || style || "";
}

function createBatchValue(tradeDate = "", generatedAt = "", runId = "") {
  return tradeDate || generatedAt || runId ? [tradeDate, generatedAt, runId].join("|") : "";
}

function parseBatchValue(value) {
  const [tradeDate = "", generatedAt = "", runId = ""] = String(value || "").split("|");
  return { tradeDate, generatedAt, runId };
}

function batchValue(batch) {
  return createBatchValue(batch.trade_date || "", batch.generated_at || "", batch.run_id || "");
}

function currentBatchValue() {
  if (state.payload?.trade_date && state.payload?.generated_at && state.payload?.run_id) {
    return createBatchValue(state.payload.trade_date, state.payload.generated_at, state.payload.run_id);
  }
  return state.selectedBatch || "";
}

function restoreUrlState() {
  const params = new URLSearchParams(window.location.search);
  state.selectedBatch = createBatchValue(
    params.get("trade_date") || "",
    params.get("generated_at") || "",
    params.get("run_id") || "",
  );
  state.style = params.get("style") || "";
  state.status = params.get("status") || "";
  state.selectedOptions = parseSelectedOptions(params.get("dims") || "");
  state.keyword = params.get("q") || "";
}

function syncUrlState() {
  const params = new URLSearchParams();
  const batch = parseBatchValue(currentBatchValue());
  if (batch.tradeDate) params.set("trade_date", batch.tradeDate);
  if (batch.generatedAt) params.set("generated_at", batch.generatedAt);
  if (batch.runId) params.set("run_id", batch.runId);
  if (state.style) params.set("style", state.style);
  if (state.status) params.set("status", state.status);
  const selectedOptionIds = selectedDimensionOptions().map((option) => option.option_id);
  if (selectedOptionIds.length) params.set("dims", selectedOptionIds.join(","));
  if (state.keyword) params.set("q", state.keyword);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

function uniqueValues(items, key) {
  return Array.from(
    new Set((items || []).map((item) => String(item?.[key] || "").trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function parseSelectedOptions(value) {
  const optionIds = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return optionIds.length ? { restored: optionIds } : {};
}

function normalizeSelectedOptions() {
  const ids = selectedOptionIds();
  const next = {};
  for (const category of state.dimensions) {
    const optionIds = (category.options || []).filter((option) => ids.has(option.option_id)).map((option) => option.option_id);
    if (optionIds.length) {
      next[category.category_id] = optionIds;
    }
  }
  state.selectedOptions = next;
}

function dimensionParts(value) {
  return String(value || "")
    .split(/\s*(?:\+|\/|\||｜|、|,|，|;|；)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function selectedOptionIds() {
  return new Set(Object.values(state.selectedOptions).flat());
}

function selectedDimensionOptions() {
  const ids = selectedOptionIds();
  return state.dimensions.flatMap((category) => (category.options || []).filter((option) => ids.has(option.option_id)));
}

function selectedDimensionOptionsByCategory() {
  const ids = selectedOptionIds();
  return state.dimensions
    .map((category) => ({
      category,
      options: (category.options || []).filter((option) => ids.has(option.option_id)),
    }))
    .filter((item) => item.options.length);
}

function postMatchesDimensionOptions(post) {
  const selectedByCategory = selectedDimensionOptionsByCategory();
  if (!selectedByCategory.length) return true;
  const parts = new Set(dimensionParts(post.dimension_label));
  return selectedByCategory.every(({ options }) => options.some((option) => parts.has(option.name)));
}

function statusSummary(posts) {
  const counts = {};
  for (const post of posts || []) {
    const status = post.status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([status, count]) => `${status}: ${count}`).join(" / ") : "无";
}

function filteredPosts() {
  const posts = state.payload?.posts || [];
  const keyword = state.keyword.trim().toLowerCase();
  return posts.filter((post) => {
    if (state.style && post.style !== state.style) return false;
    if (state.status && post.status !== state.status) return false;
    if (!postMatchesDimensionOptions(post)) return false;
    if (!keyword) return true;
    const haystack = [
      post.content_id,
      post.style,
      post.style_label,
      post.status,
      post.dimension_label,
      post.title,
      post.body,
      post.trade_date,
      post.generated_at,
      post.run_id,
      ...(post.hashtags || []),
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(keyword);
  });
}

function applyInputsFromState() {
  $("#batchSelect").value = currentBatchValue();
  $("#styleSelect").value = state.style;
  $("#statusSelect").value = state.status;
  $("#searchInput").value = state.keyword;
}

function renderBatches() {
  $("#batchSelect").innerHTML = [
    `<option value="">最新批次</option>`,
    ...state.batches.map((batch) => {
      const statusText = batch.status === "mixed" ? "mixed" : batch.status || "unknown";
      const label = `${batch.trade_date} ${batch.generated_at} ${batch.post_count} rows ${statusText}`;
      return `<option value="${escapeHtml(batchValue(batch))}">${escapeHtml(label)}</option>`;
    }),
  ].join("");
  applyInputsFromState();
}

function renderFilterOptions() {
  const posts = state.payload?.posts || [];
  const styles = uniqueValues(posts, "style");
  const statuses = uniqueValues(posts, "status");

  $("#styleSelect").innerHTML = [
    `<option value="">全部风格</option>`,
    ...styles.map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)} ${escapeHtml(styleLabel(style))}</option>`),
  ].join("");

  $("#statusSelect").innerHTML = [
    `<option value="">全部状态</option>`,
    ...statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`),
  ].join("");

  if (state.style && !styles.includes(state.style)) state.style = "";
  if (state.status && !statuses.includes(state.status)) state.status = "";
  applyInputsFromState();
}

function renderDimensionGroups() {
  const ids = selectedOptionIds();
  if (!state.dimensions.length) {
    $("#dimensionGroups").innerHTML = `<span class="dimension-loading">没有读取到维度字典</span>`;
    return;
  }

  $("#dimensionGroups").innerHTML = state.dimensions
    .map((category) => {
      const options = category.options || [];
      const selectedOptions = options.filter((option) => ids.has(option.option_id));
      const selectedCount = selectedOptions.length;
      const selectedText = selectedOptions.map((option) => option.name).join("、") || "全部";
      return `
        <details class="dimension-group" data-category-id="${escapeHtml(category.category_id)}" open>
          <summary class="dimension-select-toggle">
            <span class="dimension-title">${escapeHtml(category.name)}</span>
            <span class="dimension-selected">${escapeHtml(selectedText)}</span>
            ${selectedCount ? `<em>${selectedCount}</em>` : ""}
          </summary>
          <div class="dimension-menu">
            ${options
              .map((option) => {
                const checked = ids.has(option.option_id) ? " checked" : "";
                return `
                  <label class="dimension-option" title="${escapeHtml(option.description || "")}">
                    <span>${escapeHtml(option.name)}</span>
                    <input
                      type="checkbox"
                      value="${escapeHtml(option.option_id)}"
                      data-category-id="${escapeHtml(category.category_id)}"
                      ${checked}
                    />
                  </label>
                `;
              })
              .join("")}
          </div>
        </details>
      `;
    })
    .join("");

  document.querySelectorAll("#dimensionGroups input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", onDimensionOptionChange);
  });
}

function onDimensionOptionChange(event) {
  const checkbox = event.target;
  const categoryId = checkbox.dataset.categoryId || "";
  const optionId = checkbox.value || "";
  const current = new Set(state.selectedOptions[categoryId] || []);
  if (checkbox.checked) {
    current.add(optionId);
  } else {
    current.delete(optionId);
  }
  if (current.size) {
    state.selectedOptions[categoryId] = Array.from(current);
  } else {
    delete state.selectedOptions[categoryId];
  }
  renderResults();
  renderDimensionGroups();
}

function clearDimensionSelection() {
  state.selectedOptions = {};
  renderDimensionGroups();
  renderResults();
}

function renderSummary(posts) {
  const payload = state.payload || {};
  const selectedNames = selectedDimensionOptions().map((option) => option.name);
  $("#summary").innerHTML = `
    <span>rows: <strong>${escapeHtml(posts.length)}</strong> / ${escapeHtml(payload.generated_count || 0)}</span>
    <span>status: <strong>${escapeHtml(statusSummary(payload.posts || []))}</strong></span>
    <span>dimension: <strong>${escapeHtml(selectedNames.join(" + ") || "全部")}</strong></span>
    <span>run_id: <strong>${escapeHtml(payload.run_id || "")}</strong></span>
  `;
}

function renderResults() {
  const posts = filteredPosts();
  renderSummary(posts);
  syncUrlState();

  if (!posts.length) {
    $("#resultsList").innerHTML = `<div class="empty-state">没有匹配的数据</div>`;
    return;
  }

  $("#resultsList").innerHTML = posts.map(renderPostItem).join("");
  bindCopyButtons();
}

function renderPostItem(post) {
  const styleText = [post.style, styleLabel(post.style)].filter(Boolean).join(" / ");
  return `
    <article class="post-item">
      <div class="post-content">
        <h2>${escapeHtml(post.title || "无标题")}</h2>
        <p>${escapeHtml(post.body || "")}</p>
      </div>
      <footer class="post-footer">
        <div class="post-tags">
          ${post.trade_date ? `<span>${escapeHtml(post.trade_date)}</span>` : ""}
          ${styleText ? `<span>${escapeHtml(styleText)}</span>` : ""}
          <span>score: ${escapeHtml(post.score)}</span>
          ${post.dimension_label ? `<span>${escapeHtml(post.dimension_label)}</span>` : ""}
        </div>
        <button class="secondary compact copy-button" data-copy-id="${escapeHtml(post.content_id)}" type="button">复制内容</button>
      </footer>
    </article>
  `;
}
function formatPostForCopy(post) {
  return ["标题", post.title || "", "", "正文", post.body || ""].join("\n");
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

async function copyPost(postId, button) {
  const post = (state.payload?.posts || []).find((item) => item.content_id === postId);
  if (!post) return;
  await copyText(formatPostForCopy(post));
  const originalText = button.textContent;
  button.textContent = "已复制";
  window.setTimeout(() => {
    button.textContent = originalText;
  }, 1000);
}

function bindCopyButtons() {
  document.querySelectorAll(".copy-button").forEach((button) => {
    button.addEventListener("click", () => {
      copyPost(button.dataset.copyId || "", button).catch(renderError);
    });
  });
}

function setLoading(message) {
  $("#sourceLine").textContent = message;
  $("#summary").innerHTML = "";
  $("#resultsList").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderError(error) {
  const message = error instanceof Error ? error.message : String(error);
  $("#sourceLine").textContent = message;
  $("#summary").innerHTML = "";
  $("#resultsList").innerHTML = `<div class="empty-state error">${escapeHtml(message)}</div>`;
}

async function loadBatches() {
  state.batches = await api("/api/batches");
  renderBatches();
}

async function loadDimensions() {
  state.dimensions = await api("/api/dimensions");
  normalizeSelectedOptions();
  renderDimensionGroups();
}

async function loadPosts(batchValueText = "") {
  state.selectedBatch = batchValueText;
  setLoading("正在读取帖子数据...");
  const batch = parseBatchValue(batchValueText);
  const params = new URLSearchParams();
  if (batch.tradeDate) params.set("trade_date", batch.tradeDate);
  if (batch.generatedAt) params.set("generated_at", batch.generatedAt);
  if (batch.runId) params.set("run_id", batch.runId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  state.payload = await api(`/api/posts${suffix}`);
  $("#sourceLine").textContent = `${state.payload.trade_date || "无日期"} ${state.payload.generated_at || ""} ${state.payload.run_id || ""}`;
  renderBatches();
  renderFilterOptions();
  renderDimensionGroups();
  renderResults();
}

async function refresh() {
  $("#refreshButton").disabled = true;
  try {
    await loadBatches();
    await loadPosts(state.selectedBatch || $("#batchSelect").value || "");
  } catch (error) {
    renderError(error);
  } finally {
    $("#refreshButton").disabled = false;
  }
}

function bindEvents() {
  $("#refreshButton").addEventListener("click", refresh);
  $("#resetButton").addEventListener("click", () => {
    state.style = "";
    state.status = "";
    state.selectedOptions = {};
    state.keyword = "";
    applyInputsFromState();
    renderDimensionGroups();
    renderResults();
  });
  $("#clearDimensionsButton").addEventListener("click", clearDimensionSelection);
  $("#batchSelect").addEventListener("change", () => {
    loadPosts($("#batchSelect").value || "").catch(renderError);
  });
  $("#styleSelect").addEventListener("change", (event) => {
    state.style = event.target.value || "";
    renderResults();
  });
  $("#statusSelect").addEventListener("change", (event) => {
    state.status = event.target.value || "";
    renderResults();
  });
  $("#searchInput").addEventListener("input", (event) => {
    state.keyword = event.target.value || "";
    renderResults();
  });
}

async function boot() {
  restoreUrlState();
  bindEvents();
  applyInputsFromState();
  await loadDimensions();
  await refresh();
}

boot().catch(renderError);
