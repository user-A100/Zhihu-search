const DASHBOARD_URL = chrome.runtime.getURL("src/dashboard.html");
const CLIPPER_URL = chrome.runtime.getURL("src/clipper.html");
const PENDING_EXPORTS_KEY = "pendingExports";

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => tab.url === DASHBOARD_URL);

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: DASHBOARD_URL });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-clipped") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "ZHICANG_CLIP_CURRENT_PAGE" }).catch(() => {});
  }
});

async function createExportTask(item, sourceTabId) {
  const requestId = crypto.randomUUID();
  const saved = await chrome.storage.local.get(PENDING_EXPORTS_KEY);
  const pendingExports = saved[PENDING_EXPORTS_KEY] || {};
  pendingExports[requestId] = {
    item,
    sourceTabId,
    createdAt: Date.now()
  };
  await chrome.storage.local.set({ [PENDING_EXPORTS_KEY]: pendingExports });
  await chrome.tabs.create({
    url: `${CLIPPER_URL}?request=${encodeURIComponent(requestId)}`,
    active: false
  });
  return requestId;
}

async function focusClipperTab(tab) {
  if (!tab?.id) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

async function finishExportTask(message, clipperTab) {
  const saved = await chrome.storage.local.get(PENDING_EXPORTS_KEY);
  const pendingExports = saved[PENDING_EXPORTS_KEY] || {};
  const task = pendingExports[message.requestId];
  if (!task) return;

  chrome.tabs.sendMessage(task.sourceTabId, {
    type: "ZHICANG_EXPORT_RESULT",
    ok: Boolean(message.ok),
    detail: message.detail || "",
    error: message.error || ""
  }).catch(() => {});

  if (!message.ok) {
    await focusClipperTab(clipperTab);
    return;
  }

  delete pendingExports[message.requestId];
  await chrome.storage.local.set({ [PENDING_EXPORTS_KEY]: pendingExports });
  if (clipperTab?.id) {
    await chrome.tabs.remove(clipperTab.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ZHICANG_EXPORT_PAGE") {
    const item = message.item;
    const sourceTabId = sender.tab?.id;
    if (!sourceTabId || !item?.url || !item?.title || !item?.id) {
      sendResponse({ ok: false, error: "当前知乎内容不完整，无法导入。" });
      return false;
    }
    createExportTask(item, sourceTabId)
      .then((requestId) => sendResponse({ ok: true, requestId }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "无法创建导入任务。" }));
    return true;
  }

  if (message?.type === "ZHICANG_EXPORT_NEEDS_ATTENTION") {
    focusClipperTab(sender.tab).catch(() => {});
    return false;
  }

  if (message?.type === "ZHICANG_EXPORT_COMPLETE") {
    finishExportTask(message, sender.tab).catch(() => {});
    return false;
  }

  return false;
});
