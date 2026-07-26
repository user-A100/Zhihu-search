const DASHBOARD_URL = chrome.runtime.getURL("src/dashboard.html");

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
    chrome.tabs.sendMessage(tab.id, { type: "ZHICANG_TOGGLE_CLIPPED" }).catch(() => {});
  }
});

