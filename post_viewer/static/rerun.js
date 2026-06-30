(() => {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function parseUrls(value) {
    const seen = new Set();
    const urls = [];
    for (const item of String(value || "").split(/[\n\r,]+/)) {
      const url = item.trim().replace(/^['"]|['"]$/g, "");
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
    return urls;
  }

  function setBusy(isBusy) {
    document.querySelector("#rerunButton").disabled = isBusy;
    document.querySelector("#clearRerunButton").disabled = isBusy;
  }

  function renderSummary(result) {
    document.querySelector("#rerunSummary").innerHTML = `
      <span>输入: <strong>${escapeHtml(result.requested_count || 0)}</strong></span>
      <span>匹配: <strong>${escapeHtml(result.matched_count || 0)}</strong></span>
      <span>更新: <strong>${escapeHtml(result.updated_count || 0)}</strong></span>
      <span>状态: <strong>pending / attempts=1</strong></span>
    `;
  }

  function renderRows(rows) {
    if (!rows.length) return "";
    return `
      <div class="rerun-table-wrap">
        <table class="rerun-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>账号</th>
              <th>状态</th>
              <th>尝试</th>
              <th>行号</th>
              <th>更新时间</th>
              <th>链接</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td>${escapeHtml(row.id)}</td>
                    <td>${escapeHtml(row.account_name)}</td>
                    <td><span class="status-pill">${escapeHtml(row.status)}</span></td>
                    <td>${escapeHtml(row.attempts)}</td>
                    <td>${escapeHtml(row.row_index)}</td>
                    <td>${escapeHtml(row.updated_at)}</td>
                    <td class="url-cell">${escapeHtml(row.post_url)}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderUnmatched(urls) {
    if (!urls.length) return "";
    return `
      <section class="unmatched-box">
        <h2>未匹配链接</h2>
        <ul>
          ${urls.map((url) => `<li>${escapeHtml(url)}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  function renderResult(result) {
    renderSummary(result);
    const rows = result.rows || [];
    const unmatched = result.unmatched_urls || [];
    const rowHtml = renderRows(rows);
    const unmatchedHtml = renderUnmatched(unmatched);
    document.querySelector("#rerunResults").innerHTML =
      rowHtml || unmatchedHtml || `<div class="empty-state">没有匹配到 detail 任务</div>`;
    if (rowHtml && unmatchedHtml) {
      document.querySelector("#rerunResults").insertAdjacentHTML("beforeend", unmatchedHtml);
    }
  }

  function renderError(error) {
    const message = error instanceof Error ? error.message : String(error);
    document.querySelector("#rerunSourceLine").textContent = message;
    document.querySelector("#rerunResults").innerHTML = `<div class="empty-state error">${escapeHtml(message)}</div>`;
  }

  async function rerunPosts() {
    const urls = parseUrls(document.querySelector("#postUrlsInput").value);
    if (!urls.length) {
      renderError(new Error("请输入至少一个帖子链接"));
      return;
    }

    setBusy(true);
    document.querySelector("#rerunSourceLine").textContent = "正在更新 task_submissions...";
    document.querySelector("#rerunResults").innerHTML = `<div class="empty-state">正在处理...</div>`;
    try {
      const response = await fetch("/api/rerun-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_urls: urls }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail || response.statusText);
      }
      document.querySelector("#rerunSourceLine").textContent = "更新完成";
      renderResult(body);
    } catch (error) {
      renderError(error);
    } finally {
      setBusy(false);
    }
  }

  function bindEvents() {
    document.querySelector("#rerunButton").addEventListener("click", () => {
      rerunPosts().catch(renderError);
    });
    document.querySelector("#clearRerunButton").addEventListener("click", () => {
      document.querySelector("#postUrlsInput").value = "";
      document.querySelector("#rerunSummary").innerHTML = "";
      document.querySelector("#rerunResults").innerHTML = `<div class="empty-state">等待输入链接</div>`;
      document.querySelector("#rerunSourceLine").textContent = "crawler_app.task_submissions / detail";
    });
  }

  bindEvents();
})();
