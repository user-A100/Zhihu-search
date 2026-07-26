(() => {
  const normalize = (input) => {
    const url = new URL(input);
    const answer = url.pathname.match(/^\/question\/(\d+)\/answer\/(\d+)/);
    if (answer) return `https://www.zhihu.com/question/${answer[1]}/answer/${answer[2]}`;
    const question = url.pathname.match(/^\/question\/(\d+)/);
    if (question) return `https://www.zhihu.com/question/${question[1]}`;
    const article = url.pathname.match(/^\/p\/(\d+)/);
    if (article) return `https://zhuanlan.zhihu.com/p/${article[1]}`;
    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  };

  const pageUrl = normalize(location.href);
  const host = document.createElement("div");
  host.id = "zhicang-marker-host";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      button {
        position: fixed;
        z-index: 2147483647;
        right: 22px;
        bottom: 22px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 42px;
        padding: 0 16px;
        border: 1px solid rgba(15, 36, 45, .16);
        border-radius: 999px;
        background: #f7faf8;
        color: #173a42;
        box-shadow: 0 10px 30px rgba(12, 32, 38, .18);
        font: 600 13px/1.2 "Microsoft YaHei UI", sans-serif;
        letter-spacing: .02em;
        cursor: pointer;
        transition: transform .18s ease, background .18s ease, color .18s ease;
      }
      button:hover { transform: translateY(-2px); }
      button:focus-visible { outline: 3px solid #84a98c; outline-offset: 3px; }
      button[data-clipped="true"] { background: #173a42; color: #f7faf8; }
      .dot { width: 8px; height: 8px; border: 2px solid currentColor; border-radius: 50%; }
      button[data-clipped="true"] .dot { background: #b8d8ba; border-color: #b8d8ba; }
      @media (prefers-reduced-motion: reduce) { button { transition: none; } }
    </style>
    <button type="button" aria-label="切换知藏剪藏标记">
      <span class="dot"></span>
      <span class="label">标记为已剪藏</span>
    </button>
  `;
  document.documentElement.appendChild(host);

  const button = shadow.querySelector("button");
  const label = shadow.querySelector(".label");
  let clipped = false;

  function render() {
    button.dataset.clipped = String(clipped);
    label.textContent = clipped ? "已剪藏到 Obsidian" : "标记为已剪藏";
    button.title = clipped ? "点击取消标记（Alt+Shift+M）" : "简悦导出成功后点击（Alt+Shift+M）";
  }

  async function load() {
    const result = await chrome.storage.local.get("clipped");
    clipped = Boolean(result.clipped?.[pageUrl]);
    render();
  }

  async function toggle() {
    const result = await chrome.storage.local.get("clipped");
    const records = result.clipped || {};
    clipped = !Boolean(records[pageUrl]);
    if (clipped) {
      records[pageUrl] = { clippedAt: Date.now() };
    } else {
      delete records[pageUrl];
    }
    await chrome.storage.local.set({ clipped: records });
    render();
  }

  button.addEventListener("click", toggle);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "ZHICANG_TOGGLE_CLIPPED") toggle();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.clipped) load();
  });
  load();
})();

