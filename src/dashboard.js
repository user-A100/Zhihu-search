const {
  extractCollectionId,
  extractProfileToken,
  formatDate,
  matchesAdvancedSearch,
  matchesSearch,
  mergeIndexedItems,
  normalizeZhihuUrl,
  paginateItems,
  parseCollectionItem
} = globalThis.ZhicangLib;

const storageApi = globalThis.zhicangPreviewStorage || chrome.storage;
const storage = storageApi.local;
const state = {
  items: [],
  clipped: {},
  profile: "",
  indexedAt: 0,
  filter: "all",
  collection: "",
  query: "",
  conditions: [{ operator: "and", field: "all", value: "" }],
  page: 1,
  pageSize: 20,
  selected: new Set(),
  exporting: false
};

const els = Object.fromEntries(
  [
    "settingsButton", "searchInput", "totalCount", "allCount", "unclippedCount",
    "clippedCount", "collectionFilter", "pageSizeSelect", "resultSummary", "emptyState",
    "emptySettingsButton", "advancedSearchToggle", "advancedSearchSection", "advancedSearchPanel",
    "conditionList", "conditionTemplate", "addConditionButton",
    "clearConditionsButton", "bulkToolbar", "selectPageCheckbox", "selectedCount",
    "importSelectedButton", "importAllButton", "batchProgress", "batchProgressBar",
    "batchProgressText", "pagination", "previousPageButton", "nextPageButton",
    "pageNumbers", "pageStatus", "footerStatus",
    "results", "settingsDialog", "settingsForm", "profileInput", "syncProgress",
    "progressBar", "progressText", "dialogError", "syncButton", "clearButton",
    "obsidianDirectoryStatus", "obsidianDirectoryButton", "obsidianDirectoryError",
    "resultTemplate", "toast"
  ].map((id) => [id, document.getElementById(id)])
);

function isClipped(item) {
  return Boolean(state.clipped[normalizeZhihuUrl(item.url)]);
}

function typeLabel(type) {
  return ({ answer: "回答", article: "文章", pin: "想法" })[type] || "内容";
}

function visibleItems() {
  return state.items
    .filter((item) => matchesSearch(item, state.query))
    .filter((item) => matchesAdvancedSearch(item, state.conditions, isClipped(item)))
    .filter((item) => !state.collection || item.collectionIds.includes(state.collection))
    .filter((item) => {
      if (state.filter === "clipped") return isClipped(item);
      if (state.filter === "unclipped") return !isClipped(item);
      return true;
    })
    .sort((a, b) => Number(isClipped(a)) - Number(isClipped(b)) || b.updatedAt - a.updatedAt);
}

function resetListing({ clearSelection = true } = {}) {
  state.page = 1;
  if (clearSelection) state.selected.clear();
}

function updateCounts() {
  const clippedCount = state.items.filter(isClipped).length;
  els.totalCount.textContent = state.items.length.toLocaleString("zh-CN");
  els.allCount.textContent = state.items.length;
  els.clippedCount.textContent = clippedCount;
  els.unclippedCount.textContent = state.items.length - clippedCount;
}

function renderCollections() {
  const selected = state.collection;
  const collections = new Map();
  for (const item of state.items) {
    item.collectionIds.forEach((id, index) => collections.set(id, item.collectionTitles[index] || id));
  }

  els.collectionFilter.innerHTML = '<option value="">全部收藏夹</option>';
  [...collections.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "zh-CN"))
    .forEach(([id, title]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = title;
      els.collectionFilter.append(option);
    });
  els.collectionFilter.value = selected;
}

function renderConditions() {
  els.conditionList.replaceChildren();
  state.conditions.forEach((condition, index) => {
    const node = els.conditionTemplate.content.cloneNode(true);
    const row = node.querySelector(".condition-row");
    const level = node.querySelector(".condition-level");
    const operator = node.querySelector(".condition-operator");
    const field = node.querySelector(".condition-field");
    const value = node.querySelector(".condition-value");
    const remove = node.querySelector(".condition-remove");

    level.textContent = `第 ${index + 1} 层`;
    operator.value = condition.operator;
    operator.disabled = index === 0;
    operator.setAttribute("aria-label", index === 0 ? "首层条件" : `第 ${index + 1} 层条件关系`);
    field.value = condition.field;
    value.value = condition.value;
    remove.disabled = state.conditions.length === 1;

    operator.addEventListener("change", () => {
      condition.operator = operator.value;
      resetListing();
      render();
    });
    field.addEventListener("change", () => {
      condition.field = field.value;
      resetListing();
      render();
    });
    value.addEventListener("input", () => {
      condition.value = value.value;
      resetListing();
      render();
    });
    remove.addEventListener("click", () => {
      state.conditions.splice(index, 1);
      resetListing();
      renderConditions();
      render();
    });
    els.conditionList.append(row);
  });

}

function paginationWindow(page, pageCount) {
  const values = new Set([1, pageCount]);
  for (let current = Math.max(1, page - 2); current <= Math.min(pageCount, page + 2); current += 1) {
    values.add(current);
  }
  return [...values].sort((a, b) => a - b);
}

function renderPagination(pagination) {
  els.pagination.hidden = pagination.total === 0;
  els.previousPageButton.disabled = pagination.page <= 1;
  els.nextPageButton.disabled = pagination.page >= pagination.pageCount;
  els.pageStatus.textContent = `第 ${pagination.page} / ${pagination.pageCount} 页`;
  els.pageNumbers.replaceChildren();

  let previous = 0;
  for (const page of paginationWindow(pagination.page, pagination.pageCount)) {
    if (previous && page - previous > 1) {
      const gap = document.createElement("span");
      gap.className = "page-gap";
      gap.textContent = "…";
      els.pageNumbers.append(gap);
    }
    const button = document.createElement("button");
    button.className = "page-number";
    button.type = "button";
    button.textContent = page;
    button.dataset.current = String(page === pagination.page);
    button.setAttribute("aria-label", `第 ${page} 页`);
    if (page === pagination.page) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => {
      state.page = page;
      render();
      scrollToResults();
    });
    els.pageNumbers.append(button);
    previous = page;
  }
}

function currentPageItems() {
  return paginateItems(visibleItems(), state.page, state.pageSize).items;
}

function updateBulkToolbar(pageItems = currentPageItems(), allItems = visibleItems()) {
  const selectedItems = allItems.filter((item) => state.selected.has(item.id));
  const selectedOnPage = pageItems.filter((item) => state.selected.has(item.id)).length;
  els.bulkToolbar.hidden = state.items.length === 0;
  els.selectedCount.textContent = `已选 ${selectedItems.length} 篇`;
  els.selectPageCheckbox.checked = pageItems.length > 0 && selectedOnPage === pageItems.length;
  els.selectPageCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < pageItems.length;
  els.selectPageCheckbox.disabled = state.exporting || pageItems.length === 0;
  els.importSelectedButton.disabled = state.exporting || selectedItems.length === 0;
  els.importAllButton.disabled = state.exporting || allItems.length === 0;
  els.importSelectedButton.textContent = state.exporting ? "正在导入…" : `导入所选${selectedItems.length ? `（${selectedItems.length}）` : ""}`;
  els.importAllButton.textContent = state.exporting ? "正在导入…" : `导入全部结果${allItems.length ? `（${allItems.length}）` : ""}`;
}

function scrollToResults() {
  const top = els.resultSummary.getBoundingClientRect().top + window.scrollY - 24;
  const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  window.scrollTo({ top, behavior });
}

function render() {
  updateCounts();
  const items = visibleItems();
  const pagination = paginateItems(items, state.page, state.pageSize);
  state.page = pagination.page;
  const hasIndex = state.items.length > 0;
  els.emptyState.hidden = hasIndex;
  els.results.hidden = !hasIndex;
  els.results.replaceChildren();
  els.footerStatus.textContent = state.indexedAt ? `索引更新于 ${formatDate(state.indexedAt)}` : "尚未同步";

  if (!hasIndex) {
    els.resultSummary.textContent = "尚未同步收藏";
    els.bulkToolbar.hidden = true;
    els.pagination.hidden = true;
    return;
  }

  const queryText = state.query ? `“${state.query}” · ` : "";
  const rangeText = items.length ? ` · 当前显示 ${pagination.start + 1}–${pagination.end}` : "";
  els.resultSummary.textContent = `${queryText}找到 ${items.length} 篇${rangeText}`;
  updateBulkToolbar(pagination.items, items);
  renderPagination(pagination);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<div class='empty-glyph'>空</div><h2>这里还没有内容</h2><p>换一个关键词、收藏夹或剪藏状态试试。</p>";
    els.results.append(empty);
    return;
  }

  for (const item of pagination.items) {
    const node = els.resultTemplate.content.cloneNode(true);
    const card = node.querySelector(".result-card");
    const selection = node.querySelector(".result-checkbox");
    selection.checked = state.selected.has(item.id);
    selection.setAttribute("aria-label", `选择“${item.title}”`);
    selection.addEventListener("change", () => {
      if (selection.checked) state.selected.add(item.id);
      else state.selected.delete(item.id);
      updateBulkToolbar();
    });
    const toggle = node.querySelector(".clip-toggle");
    const clipped = isClipped(item);
    toggle.dataset.clipped = String(clipped);
    toggle.querySelector("b").textContent = clipped ? "已剪藏" : "待剪藏";
    toggle.addEventListener("click", () => toggleClipped(item));

    node.querySelector(".content-type").textContent = typeLabel(item.type);
    node.querySelector(".collection-name").textContent = item.collectionTitles.join("、");
    const titleLink = node.querySelector(".title-link");
    titleLink.textContent = item.title;
    titleLink.href = item.url;
    node.querySelector(".byline").textContent = item.author;
    const excerpt = node.querySelector(".excerpt");
    excerpt.textContent = item.excerpt || item.fullText || "暂无摘要";
    node.querySelector(".date").textContent = formatDate(item.updatedAt);
    const clipLink = node.querySelector(".clip-link");
    clipLink.href = item.url;
    clipLink.addEventListener("click", () => showToast("已打开知乎原文"));
    const obsidianButton = node.querySelector(".obsidian-button");
    if (state.clipped[normalizeZhihuUrl(item.url)]?.filename) {
      obsidianButton.textContent = "更新 Obsidian 笔记";
    }
    obsidianButton.addEventListener("click", () => exportToObsidian(item, obsidianButton));
    card.dataset.url = item.url;
    els.results.append(node);
  }
}

async function exportToObsidian(item, button) {
  button.disabled = true;
  button.dataset.state = "loading";
  button.textContent = "正在转换…";
  try {
    const result = await globalThis.ZhicangObsidian.writeItem(item);
    const key = normalizeZhihuUrl(item.url);
    state.clipped[key] = {
      clippedAt: Date.now(),
      filename: result.filename,
      directoryName: result.directoryName
    };
    await storage.set({ clipped: state.clipped });
    button.dataset.state = "success";
    button.textContent = "已存入 Obsidian";
    showToast(`已写入 ${result.directoryName} / ${result.filename}`);
    setTimeout(render, 900);
  } catch (error) {
    button.dataset.state = "error";
    button.textContent = error?.name === "AbortError" ? "已取消选择" : "导出失败";
    showToast(error?.name === "AbortError" ? "没有选择 Obsidian 文件夹" : (error.message || "Markdown 导出失败"));
    setTimeout(() => {
      button.disabled = false;
      button.dataset.state = "";
      button.textContent = "存入 Obsidian";
    }, 1800);
  }
}

async function exportManyToObsidian(items) {
  if (state.exporting || !items.length) return;
  state.exporting = true;
  els.batchProgress.hidden = false;
  els.batchProgressBar.style.transform = "scaleX(0)";
  els.batchProgressText.textContent = `准备导入 ${items.length} 篇…`;
  updateBulkToolbar();

  try {
    const batch = await globalThis.ZhicangObsidian.writeItems(items, ({ completed, total, item, error }) => {
      const percentage = Math.round((completed / Math.max(total, 1)) * 100);
      els.batchProgressBar.style.transform = `scaleX(${percentage / 100})`;
      els.batchProgressText.textContent = error
        ? `已处理 ${completed}/${total} · “${item.title}”导入失败 · ${percentage}%`
        : `正在导入 ${completed}/${total} · ${percentage}%`;
    });

    for (const { item, result } of batch.successes) {
      state.clipped[normalizeZhihuUrl(item.url)] = {
        clippedAt: Date.now(),
        filename: result.filename,
        directoryName: result.directoryName
      };
      state.selected.delete(item.id);
    }
    await storage.set({ clipped: state.clipped });

    const completed = batch.successes.length;
    const failed = batch.failures.length;
    els.batchProgressBar.style.transform = "scaleX(1)";
    els.batchProgressText.textContent = failed
      ? `导入完成：成功 ${completed} 篇，失败 ${failed} 篇。失败项仍保持选中，可再次导入。`
      : `导入完成：${completed} 篇已写入 ${batch.directoryName}。`;
    if (failed) {
      batch.failures.forEach(({ item }) => state.selected.add(item.id));
      showToast(`有 ${failed} 篇导入失败，请检查网络后重试`);
    }
  } catch (error) {
    els.batchProgressText.textContent = error?.name === "AbortError"
      ? "已取消选择导出文件夹。"
      : `批量导入未开始：${error.message || "无法写入 Obsidian 文件夹。"}`;
    showToast(error?.name === "AbortError" ? "没有选择 Obsidian 文件夹" : "批量导入失败");
  } finally {
    state.exporting = false;
    render();
  }
}

async function toggleClipped(item) {
  const key = normalizeZhihuUrl(item.url);
  if (state.clipped[key]) {
    delete state.clipped[key];
    showToast("已取消剪藏标记");
  } else {
    state.clipped[key] = { clippedAt: Date.now() };
    showToast("已标记为剪藏到 Obsidian");
  }
  await storage.set({ clipped: state.clipped });
  render();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function setProgress(current, total, text) {
  const percentage = total
    ? Math.max(0, Math.min(100, Math.round((current / total) * 100)))
    : 0;
  const detail = `${text} · ${percentage}%`;
  els.syncProgress.hidden = false;
  els.progressBar.style.transform = `scaleX(${percentage / 100})`;
  els.progressText.textContent = detail;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.error?.message || "";
    } catch {}
    const error = new Error(detail || `知乎接口返回 ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchAllPages(urlFactory, onPage) {
  const rows = [];
  let offset = 0;
  const limit = 20;
  for (let page = 0; page < 500; page += 1) {
    const payload = await fetchJson(urlFactory(offset, limit));
    rows.push(...(payload.data || []));
    onPage?.(rows.length, payload.paging?.totals || rows.length);
    if (payload.paging?.is_end || !(payload.data || []).length) break;
    offset += limit;
  }
  return rows;
}

async function runSync(profileInput) {
  const collectionId = extractCollectionId(profileInput);
  const token = extractProfileToken(profileInput);
  if (!collectionId && !token) {
    throw new Error("请输入有效的知乎收藏夹地址（/collection/数字）或个人主页地址（/people/用户名）。");
  }

  setProgress(0, 1, "正在读取收藏夹…");
  let collections;
  if (collectionId) {
    const payload = await fetchJson(`https://www.zhihu.com/api/v4/collections/${collectionId}`);
    const detail = payload.collection || payload;
    collections = [{
      id: String(detail.id || collectionId),
      title: detail.title || `收藏夹 ${collectionId}`
    }];
  } else {
    collections = await fetchAllPages(
      (offset, limit) => `https://www.zhihu.com/api/v4/members/${encodeURIComponent(token)}/favlists?offset=${offset}&limit=${limit}`,
      (current, total) => setProgress(current, total, `已发现 ${current} 个收藏夹…`)
    );
  }
  if (!collections.length) throw new Error("没有找到可读取的收藏夹。请确认主页地址和知乎登录状态。");

  const parsed = [];
  for (let index = 0; index < collections.length; index += 1) {
    const collection = collections[index];
    setProgress(index, collections.length, `正在同步 ${collection.title}（${index + 1}/${collections.length}）`);
    const entries = await fetchAllPages(
      (offset, limit) => `https://www.zhihu.com/api/v4/collections/${collection.id}/items?offset=${offset}&limit=${limit}`,
      (current, total) => setProgress(
        index + (current / Math.max(total, 1)),
        collections.length,
        `正在同步 ${collection.title}：${current}/${total}`
      )
    );
    for (const entry of entries) {
      try {
        const item = parseCollectionItem(entry, collection);
        if (item.url) {
          item.collectedOrder = parsed.length;
          parsed.push(item);
        }
      } catch (error) {
        console.warn("跳过无法解析的收藏内容", entry, error);
      }
    }
  }

  const items = mergeIndexedItems(parsed);
  const indexedAt = Date.now();
  await storage.set({ items, profile: profileInput.trim(), indexedAt });
  state.items = items;
  state.profile = profileInput.trim();
  state.indexedAt = indexedAt;
  resetListing();
  setProgress(collections.length, collections.length, `同步完成：${items.length} 篇内容`);
  renderCollections();
  render();
  return items.length;
}

async function refreshObsidianDirectoryStatus() {
  const status = await globalThis.ZhicangObsidian.getDirectoryStatus();
  if (!status.name) {
    els.obsidianDirectoryStatus.textContent = "尚未选择。首次导出时也可以直接选择。";
    els.obsidianDirectoryButton.textContent = "选择文件夹";
    return;
  }
  els.obsidianDirectoryStatus.textContent = status.connected
    ? `当前文件夹：${status.name}`
    : `已选择“${status.name}”；下次导出时浏览器会重新确认写入权限。`;
  els.obsidianDirectoryButton.textContent = "更改文件夹";
}

function openSettings() {
  els.profileInput.value = state.profile;
  els.dialogError.hidden = true;
  els.obsidianDirectoryError.hidden = true;
  els.syncProgress.hidden = true;
  els.settingsDialog.showModal();
  refreshObsidianDirectoryStatus().catch((error) => {
    els.obsidianDirectoryStatus.textContent = "无法读取当前文件夹设置。";
    els.obsidianDirectoryError.hidden = false;
    els.obsidianDirectoryError.textContent = error.message;
  });
  setTimeout(() => els.profileInput.focus(), 50);
}

els.settingsButton.addEventListener("click", openSettings);
els.emptySettingsButton.addEventListener("click", openSettings);
els.obsidianDirectoryButton.addEventListener("click", async () => {
  els.obsidianDirectoryError.hidden = true;
  els.obsidianDirectoryButton.disabled = true;
  els.obsidianDirectoryButton.textContent = "正在选择…";
  try {
    const handle = await globalThis.ZhicangObsidian.chooseDirectory();
    els.obsidianDirectoryStatus.textContent = `当前文件夹：${handle.name}`;
    els.obsidianDirectoryButton.textContent = "更改文件夹";
    showToast(`导出文件夹已改为 ${handle.name}`);
  } catch (error) {
    if (error?.name !== "AbortError") {
      els.obsidianDirectoryError.hidden = false;
      els.obsidianDirectoryError.textContent = error.message || "无法更改导出文件夹。";
    }
    await refreshObsidianDirectoryStatus();
  } finally {
    els.obsidianDirectoryButton.disabled = false;
  }
});
els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  resetListing();
  render();
});
els.collectionFilter.addEventListener("change", (event) => {
  state.collection = event.target.value;
  resetListing();
  render();
});
els.pageSizeSelect.addEventListener("change", () => {
  state.pageSize = Number(els.pageSizeSelect.value);
  state.page = 1;
  render();
});
els.advancedSearchToggle.addEventListener("click", () => {
  const willOpen = els.advancedSearchSection.hidden;
  els.advancedSearchSection.hidden = !willOpen;
  els.advancedSearchToggle.setAttribute("aria-expanded", String(willOpen));
  els.advancedSearchToggle.textContent = willOpen ? "收起多级搜索" : "多级搜索";
  if (willOpen) els.conditionList.querySelector("input")?.focus();
});
els.addConditionButton.addEventListener("click", () => {
  state.conditions.push({ operator: "and", field: "all", value: "" });
  renderConditions();
  els.conditionList.querySelector(".condition-row:last-child input")?.focus();
});
els.clearConditionsButton.addEventListener("click", () => {
  state.conditions = [{ operator: "and", field: "all", value: "" }];
  resetListing();
  renderConditions();
  render();
});
els.selectPageCheckbox.addEventListener("change", () => {
  for (const item of currentPageItems()) {
    if (els.selectPageCheckbox.checked) state.selected.add(item.id);
    else state.selected.delete(item.id);
  }
  render();
});
els.importSelectedButton.addEventListener("click", () => {
  const items = visibleItems().filter((item) => state.selected.has(item.id));
  exportManyToObsidian(items);
});
els.importAllButton.addEventListener("click", () => exportManyToObsidian(visibleItems()));
els.previousPageButton.addEventListener("click", () => {
  if (state.page <= 1) return;
  state.page -= 1;
  render();
  scrollToResults();
});
els.nextPageButton.addEventListener("click", () => {
  const pageCount = paginateItems(visibleItems(), state.page, state.pageSize).pageCount;
  if (state.page >= pageCount) return;
  state.page += 1;
  render();
  scrollToResults();
});
document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    resetListing();
    render();
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    els.searchInput.focus();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
    event.preventDefault();
    els.searchInput.focus();
  }
  if (event.key === "Escape" && els.settingsDialog.open) els.settingsDialog.close();
});

els.settingsForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  els.dialogError.hidden = true;
  els.syncButton.disabled = true;
  els.syncButton.textContent = "同步中…";
  try {
    const count = await runSync(els.profileInput.value);
    showToast(`已更新 ${count} 篇收藏内容`);
    setTimeout(() => els.settingsDialog.close(), 450);
  } catch (error) {
    els.dialogError.hidden = false;
    els.dialogError.textContent = error.status === 401
      ? "知乎拒绝了读取请求。请先在当前浏览器登录知乎，再重新同步。"
      : `${error.message} 如果知乎刚触发了验证码，请先访问知乎完成验证。`;
  } finally {
    els.syncButton.disabled = false;
    els.syncButton.textContent = "同步收藏";
  }
});

els.clearButton.addEventListener("click", async () => {
  const confirmed = confirm("清除本机中的收藏索引和全部剪藏标记？此操作无法撤销。");
  if (!confirmed) return;
  await storage.clear();
  Object.assign(state, {
    items: [],
    clipped: {},
    profile: "",
    indexedAt: 0,
    query: "",
    collection: "",
    filter: "all",
    conditions: [{ operator: "and", field: "all", value: "" }],
    page: 1,
    selected: new Set()
  });
  els.searchInput.value = "";
  renderConditions();
  renderCollections();
  render();
  els.settingsDialog.close();
  showToast("本地数据已清除");
});

storageApi.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.clipped) {
    state.clipped = changes.clipped.newValue || {};
    render();
  }
});

async function init() {
  await globalThis.ZhicangObsidian.initialize();
  const saved = await storage.get(["items", "clipped", "profile", "indexedAt"]);
  const demoItems = [
    {
      id: "answer:demo-1",
      type: "answer",
      title: "如何建立一个真正会使用的个人知识库？",
      author: "山川与笔记",
      excerpt: "收藏只是入口。把信息带进自己的问题、项目和写作，才是知识开始发生作用的地方。",
      fullText: "Obsidian 简悦 知识管理 工作流",
      url: "https://www.zhihu.com/question/123456/answer/10001",
      collectionIds: ["demo-a"],
      collectionTitles: ["知识管理"],
      updatedAt: Date.now() - 86400000 * 3
    },
    {
      id: "article:demo-2",
      type: "article",
      title: "从网页剪藏到长期笔记：我的 Obsidian 整理流程",
      author: "纸页实验室",
      excerpt: "这套流程把待阅读、已剪藏和已消化分开，避免收藏夹变成信息坟场。",
      fullText: "网页剪藏 双向链接",
      url: "https://zhuanlan.zhihu.com/p/10002",
      collectionIds: ["demo-a", "demo-b"],
      collectionTitles: ["知识管理", "写作方法"],
      updatedAt: Date.now() - 86400000 * 12
    }
  ];
  state.items = new URLSearchParams(location.search).has("demo") ? demoItems : (saved.items || []);
  state.clipped = saved.clipped || {};
  state.profile = saved.profile || "";
  state.indexedAt = saved.indexedAt || 0;
  els.pageSizeSelect.value = String(state.pageSize);
  renderConditions();
  renderCollections();
  render();
  document.documentElement.dataset.zhicangReady = "true";
}

init();
