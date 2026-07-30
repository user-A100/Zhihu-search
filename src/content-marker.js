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

  let pageUrl = normalize(location.href);
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
      button:hover:not(:disabled) { transform: translateY(-2px); }
      button:focus-visible { outline: 3px solid #84a98c; outline-offset: 3px; }
      button:disabled { cursor: wait; opacity: .86; }
      button[data-state="clipped"],
      button[data-state="success"] { background: #173a42; color: #f7faf8; }
      button[data-state="error"] { background: #8c3f35; color: #fff8f3; }
      .dot { width: 8px; height: 8px; border: 2px solid currentColor; border-radius: 50%; }
      button[data-state="working"] .dot {
        border-top-color: transparent;
        animation: zhicang-spin .75s linear infinite;
      }
      button[data-state="clipped"] .dot,
      button[data-state="success"] .dot { background: #b8d8ba; border-color: #b8d8ba; }
      @keyframes zhicang-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        button { transition: none; }
        button[data-state="working"] .dot { animation: none; border-top-color: currentColor; }
      }
    </style>
    <button type="button" aria-label="收藏并剪藏到 Obsidian">
      <span class="dot"></span>
      <span class="label">收藏并剪藏</span>
    </button>
  `;
  document.documentElement.appendChild(host);

  const button = shadow.querySelector("button");
  const label = shadow.querySelector(".label");
  let clipped = false;
  let working = false;
  let resetTimer = 0;

  function setTemporaryState(state, text, title = "") {
    clearTimeout(resetTimer);
    button.dataset.state = state;
    label.textContent = text;
    button.title = title;
    if (state === "error") {
      resetTimer = setTimeout(render, 4200);
    }
  }

  function render() {
    clearTimeout(resetTimer);
    if (working) {
      button.dataset.state = "working";
      button.disabled = true;
      label.textContent = "正在收藏并导入…";
      button.title = "知藏正在处理当前内容";
      return;
    }
    button.disabled = false;
    button.dataset.state = clipped ? "clipped" : "idle";
    label.textContent = clipped ? "更新 Obsidian 剪藏" : "收藏并剪藏";
    button.title = clipped
      ? "重新写入当前内容并保留剪藏标记（Alt+Shift+M）"
      : "收藏到知乎、导入 Obsidian 并标记已剪藏（Alt+Shift+M）";
  }

  async function load() {
    pageUrl = normalize(location.href);
    const result = await chrome.storage.local.get("clipped");
    clipped = Boolean(result.clipped?.[pageUrl]);
    if (!working) render();
  }

  function textOf(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function currentContentRoot() {
    const answerId = pageUrl.match(/\/answer\/(\d+)/)?.[1];
    if (answerId) {
      const exactAnswer = [...document.querySelectorAll(".AnswerItem, [itemprop='answer']")].find((node) => {
        const zop = node.getAttribute("data-zop") || "";
        const url = node.querySelector(`a[href*="/answer/${answerId}"]`)?.href || "";
        return zop.includes(`"itemId":${answerId}`) || zop.includes(`"itemId":"${answerId}"`) || url.includes(`/answer/${answerId}`);
      });
      if (exactAnswer) return exactAnswer;
    }
    if (location.hostname === "zhuanlan.zhihu.com") {
      return document.querySelector(".Post-Main, article") || document.body;
    }
    return document.querySelector(".Question-mainColumn .AnswerItem, .AnswerItem, main") || document.body;
  }

  function findCollectionAction() {
    const root = currentContentRoot();
    const matchesAction = (candidate) => {
      const text = textOf(candidate);
      const label = candidate.getAttribute("aria-label") || "";
      return text === "收藏" || text.startsWith("收藏 ") || label === "收藏";
    };
    const matchesCollected = (candidate) => {
      const text = textOf(candidate);
      const label = candidate.getAttribute("aria-label") || "";
      return text === "已收藏" || text.startsWith("已收藏 ") || label === "已收藏";
    };
    const scoped = [...root.querySelectorAll("button")];
    const scopedMatch = scoped.find(matchesAction) || scoped.find(matchesCollected);
    if (scopedMatch) return scopedMatch;

    const globalMatches = [...document.querySelectorAll("button")].filter((candidate) => {
      return matchesAction(candidate) || matchesCollected(candidate);
    });
    return globalMatches.length === 1 ? globalMatches[0] : null;
  }

  function collectionDialog() {
    return [...document.querySelectorAll("[role='dialog'], .Modal-wrapper, .Modal-content")].find((node) => {
      const text = textOf(node);
      return text.includes("收藏") && (text.includes("收藏夹") || text.includes("创建"));
    }) || null;
  }

  function waitForCollectionDialog(timeout = 2200) {
    const existing = collectionDialog();
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const dialog = collectionDialog();
        if (!dialog) return;
        observer.disconnect();
        clearTimeout(timer);
        resolve(dialog);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  function findEnabledConfirmButton(dialog) {
    return [...dialog.querySelectorAll("button")].find((candidate) => {
      const text = textOf(candidate);
      return !candidate.disabled && (text === "收藏" || text === "确定");
    }) || null;
  }

  function waitForEnabledConfirmButton(dialog, timeout = 1600) {
    const existing = findEnabledConfirmButton(dialog);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const candidate = findEnabledConfirmButton(dialog);
        if (!candidate) return;
        observer.disconnect();
        clearTimeout(timer);
        resolve(candidate);
      });
      observer.observe(dialog, { attributes: true, childList: true, subtree: true });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(findEnabledConfirmButton(dialog));
      }, timeout);
    });
  }

  async function chooseDefaultCollection(dialog) {
    const selected = dialog.querySelector(
      "input[type='checkbox']:checked, input[type='radio']:checked, [aria-checked='true']"
    );
    if (!selected) {
      const input = dialog.querySelector("input[type='checkbox'], input[type='radio']");
      const row = input?.closest("label") || input?.parentElement;
      if (row) row.click();
      else {
        const option = [...dialog.querySelectorAll("button, [role='checkbox'], [role='radio']")].find((node) => {
          const text = textOf(node);
          return text && !/创建|新建|取消|确定|收藏/.test(text);
        });
        option?.click();
      }
    }

    const confirmButton = await waitForEnabledConfirmButton(dialog);
    confirmButton?.click();
    return Boolean(confirmButton);
  }

  async function ensureCollectedOnZhihu() {
    const action = findCollectionAction();
    if (!action) return { ok: false, reason: "当前页面没有找到知乎收藏按钮" };
    if (textOf(action).startsWith("已收藏") || action.getAttribute("aria-pressed") === "true") {
      return { ok: true, alreadyCollected: true };
    }

    action.click();
    const dialog = await waitForCollectionDialog();
    if (!dialog) {
      return { ok: true, alreadyCollected: false };
    }
    if (!await chooseDefaultCollection(dialog)) {
      return { ok: false, reason: "知乎收藏夹需要手动确认" };
    }
    return { ok: true, alreadyCollected: false };
  }

  function extractItem() {
    const root = currentContentRoot();
    const answerId = pageUrl.match(/\/answer\/(\d+)/)?.[1];
    const articleId = pageUrl.match(/\/p\/(\d+)/)?.[1];
    const questionId = pageUrl.match(/\/question\/(\d+)/)?.[1];
    const type = answerId ? "answer" : articleId ? "article" : "question";
    const id = answerId || articleId || questionId || pageUrl;
    const title = textOf(
      document.querySelector(".QuestionHeader-title, .Post-Title, article h1, h1")
    ) || document.title.replace(/\s*-\s*知乎.*$/, "").trim() || "未命名内容";
    const author = textOf(
      root.querySelector(".AuthorInfo-name, [itemprop='author'] [itemprop='name'], .Post-Author .UserLink-link")
    ) || "未知作者";
    const content = root.querySelector(
      ".RichContent-inner, .Post-RichTextContainer, article .RichText, .RichText"
    );
    const fullText = textOf(content);
    const excerpt = fullText.slice(0, 240);

    return {
      id: `${type}:${id}`,
      type,
      title,
      author,
      excerpt,
      fullText,
      htmlContent: content?.innerHTML || "",
      url: pageUrl,
      collectionIds: ["zhicang-quick"],
      collectionTitles: ["知藏快捷收藏"],
      collectedAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  async function clipCurrentPage() {
    if (working) return;
    pageUrl = normalize(location.href);
    working = true;
    render();

    try {
      const collection = await ensureCollectedOnZhihu();
      if (!collection.ok) throw new Error(collection.reason);

      label.textContent = "正在导入 Obsidian…";
      const response = await chrome.runtime.sendMessage({
        type: "ZHICANG_EXPORT_PAGE",
        item: extractItem()
      });
      if (!response?.ok) throw new Error(response?.error || "知藏导入任务未能启动");
      button.title = "知藏正在后台写入 Obsidian";
    } catch (error) {
      working = false;
      button.disabled = false;
      setTemporaryState("error", "收藏或导入失败", error?.message || "请稍后重试");
    }
  }

  button.addEventListener("click", clipCurrentPage);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "ZHICANG_CLIP_CURRENT_PAGE") {
      clipCurrentPage();
      return;
    }
    if (message?.type !== "ZHICANG_EXPORT_RESULT") return;
    working = false;
    button.disabled = false;
    if (message.ok) {
      clipped = true;
      setTemporaryState("success", "已收藏并剪藏", message.detail || "已写入 Obsidian");
      resetTimer = setTimeout(render, 2400);
    } else {
      setTemporaryState("error", "导入失败，点击重试", message.error || "无法写入 Obsidian");
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.clipped) load();
  });
  load();
})();
