const requestId = new URLSearchParams(location.search).get("request") || "";
const heading = document.getElementById("heading");
const description = document.getElementById("description");
const continueButton = document.getElementById("continueButton");
const errorElement = document.getElementById("error");
let task = null;
let writing = false;

function normalize(input) {
  try {
    const url = new URL(input);
    const answer = url.pathname.match(/^\/question\/(\d+)\/answer\/(\d+)/);
    if (answer) return `https://www.zhihu.com/question/${answer[1]}/answer/${answer[2]}`;
    const question = url.pathname.match(/^\/question\/(\d+)/);
    if (question) return `https://www.zhihu.com/question/${question[1]}`;
    const article = url.pathname.match(/^\/p\/(\d+)/);
    if (article) return `https://zhuanlan.zhihu.com/p/${article[1]}`;
    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return String(input || "");
  }
}

async function loadTask() {
  const saved = await chrome.storage.local.get("pendingExports");
  return saved.pendingExports?.[requestId] || null;
}

async function saveSuccessfulExport(result) {
  const saved = await chrome.storage.local.get(["items", "clipped"]);
  const clipped = saved.clipped || {};
  const key = normalize(task.item.url);
  clipped[key] = {
    clippedAt: Date.now(),
    filename: result.filename,
    directoryName: result.directoryName
  };

  const items = Array.isArray(saved.items) ? saved.items : [];
  const existingIndex = items.findIndex((item) => normalize(item.url) === key);
  if (existingIndex >= 0) {
    const existing = items[existingIndex];
    items[existingIndex] = {
      ...task.item,
      ...existing,
      htmlContent: task.item.htmlContent || existing.htmlContent || "",
      fullText: task.item.fullText || existing.fullText || "",
      excerpt: task.item.excerpt || existing.excerpt || "",
      collectedAt: existing.collectedAt || task.item.collectedAt || Date.now(),
      updatedAt: Math.max(existing.updatedAt || 0, task.item.updatedAt || 0)
    };
  } else {
    items.unshift(task.item);
  }
  await chrome.storage.local.set({ clipped, items });
}

async function complete() {
  if (writing || !task) return;
  writing = true;
  continueButton.disabled = true;
  continueButton.textContent = "正在写入…";
  heading.textContent = "正在导入 Obsidian…";
  description.textContent = task.item.title;
  errorElement.hidden = true;

  try {
    const result = await globalThis.ZhicangObsidian.writeItem(task.item);
    await saveSuccessfulExport(result);
    heading.textContent = "已收藏并剪藏";
    description.textContent = `已写入 ${result.directoryName} / ${result.filename}`;
    await chrome.runtime.sendMessage({
      type: "ZHICANG_EXPORT_COMPLETE",
      requestId,
      ok: true,
      detail: description.textContent
    });
  } catch (error) {
    writing = false;
    continueButton.disabled = false;
    continueButton.hidden = false;
    continueButton.textContent = "重试导入";
    heading.textContent = "还没有写入 Obsidian";
    errorElement.hidden = false;
    errorElement.textContent = error?.name === "AbortError"
      ? "你取消了文件夹选择。可以点击下方按钮再次选择。"
      : (error.message || "写入失败，请重试。");
    await chrome.runtime.sendMessage({
      type: "ZHICANG_EXPORT_COMPLETE",
      requestId,
      ok: false,
      error: errorElement.textContent
    });
  }
}

async function init() {
  task = await loadTask();
  if (!task) {
    heading.textContent = "剪藏任务已失效";
    description.textContent = "请回到知乎页面重新点击“收藏并剪藏”。";
    return;
  }

  await globalThis.ZhicangObsidian.initialize();
  const status = await globalThis.ZhicangObsidian.getDirectoryStatus();
  if (status.connected) {
    await complete();
    return;
  }

  heading.textContent = status.name ? "请重新授权 Obsidian 文件夹" : "选择 Obsidian 文件夹";
  description.textContent = status.name
    ? `浏览器需要你确认继续写入“${status.name}”。`
    : "首次使用需要选择一次 Obsidian 仓库或其中的笔记文件夹。";
  continueButton.hidden = false;
  continueButton.textContent = status.name ? "授权并继续" : "选择文件夹并继续";
  await chrome.runtime.sendMessage({ type: "ZHICANG_EXPORT_NEEDS_ATTENTION", requestId });
}

continueButton.addEventListener("click", complete);
init().catch(async (error) => {
  heading.textContent = "知藏没有正常启动";
  description.textContent = "请关闭此页，重新加载扩展后再试。";
  errorElement.hidden = false;
  errorElement.textContent = error.message || "初始化失败";
  await chrome.runtime.sendMessage({
    type: "ZHICANG_EXPORT_COMPLETE",
    requestId,
    ok: false,
    error: errorElement.textContent
  }).catch(() => {});
});
