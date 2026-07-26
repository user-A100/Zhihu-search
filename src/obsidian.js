(() => {
  const DB_NAME = "zhicang";
  const STORE_NAME = "handles";
  const OBSIDIAN_HANDLE_KEY = "obsidian-directory";
  let cachedHandle = null;
  let cacheInitialized = false;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getStoredHandle() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(OBSIDIAN_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function storeHandle(handle) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, OBSIDIAN_HANDLE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(handle);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function chooseDirectory() {
    if (typeof window.showDirectoryPicker !== "function") {
      throw new Error("当前浏览器不支持直接写入文件夹，请升级 Chrome 或 Edge。");
    }
    const handle = await window.showDirectoryPicker({
      id: "zhicang-obsidian",
      mode: "readwrite",
      startIn: "documents"
    });
    await storeHandle(handle);
    cachedHandle = handle;
    cacheInitialized = true;
    return handle;
  }

  async function ensureDirectoryAccess() {
    if (!cacheInitialized) {
      cachedHandle = await getStoredHandle();
      cacheInitialized = true;
    }
    const handle = cachedHandle;
    if (!handle) return chooseDirectory();

    let permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await handle.requestPermission({ mode: "readwrite" });
    }
    if (permission !== "granted") {
      throw new Error("没有获得 Obsidian 文件夹的写入权限。");
    }
    return handle;
  }

  function sanitizeFileName(value) {
    const cleaned = String(value || "未命名")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();
    return (cleaned || "未命名").slice(0, 120);
  }

  function yamlString(value) {
    return JSON.stringify(String(value || ""));
  }

  function createTurndown() {
    const service = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      strongDelimiter: "**"
    });
    if (globalThis.turndownPluginGfm?.gfm) {
      service.use(globalThis.turndownPluginGfm.gfm);
    }
    service.addRule("zhihu-equation", {
      filter(node) {
        return node.nodeType === 1 && Boolean(node.getAttribute("data-tex"));
      },
      replacement(_content, node) {
        const tex = node.getAttribute("data-tex") || "";
        return tex ? `$${tex}$` : "";
      }
    });
    service.addRule("fenced-pre", {
      filter: "pre",
      replacement(content, node) {
        const code = node.textContent || content;
        const language = node.querySelector("code")?.className?.match(/language-([\w-]+)/)?.[1] || "";
        return `\n\n\`\`\`${language}\n${code.replace(/\n+$/, "")}\n\`\`\`\n\n`;
      }
    });
    return service;
  }

  function buildMarkdown(item, html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("[data-tex]").forEach((node) => {
      const tex = node.getAttribute("data-tex") || "";
      node.replaceWith(doc.createTextNode(tex ? `$${tex}$` : ""));
    });
    const body = createTurndown().turndown(doc.body.innerHTML);
    const collections = JSON.stringify(item.collectionTitles || []);
    const frontmatter = [
      "---",
      `title: ${yamlString(item.title)}`,
      `author: ${yamlString(item.author)}`,
      `source: ${yamlString(item.url)}`,
      `collections: ${collections}`,
      `saved_at: ${yamlString(new Date().toISOString())}`,
      `zhicang_status: clipped`,
      "---",
      "",
      `# ${item.title}`,
      "",
      `> [!info] 来源`,
      `> 作者：${item.author || "未知作者"}`,
      `> 原文：[知乎](${item.url})`,
      ""
    ].join("\n");
    return `${frontmatter}\n${body.trim()}\n`;
  }

  function findInitialStateContent(doc, item) {
    const script = doc.querySelector("script#js-initialData");
    if (!script?.textContent) return "";
    try {
      const state = JSON.parse(script.textContent)?.initialState?.entities || {};
      const [type, id] = String(item.id || "").split(":");
      if (type === "answer") return state.answers?.[id]?.content || "";
      if (type === "article") return state.articles?.[id]?.content || "";
    } catch {}
    return "";
  }

  async function resolveHtml(item) {
    if (item.htmlContent?.trim()) return item.htmlContent;
    try {
      const response = await fetch(item.url, {
        credentials: "include",
        headers: { Accept: "text/html" }
      });
      if (response.ok) {
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const stateContent = findInitialStateContent(doc, item);
        if (stateContent) return stateContent;
        const readable = doc.querySelector(
          ".RichContent-inner, .Post-RichTextContainer, article .RichText"
        );
        if (readable?.innerHTML) return readable.innerHTML;
      }
    } catch {}
    const text = item.fullText || item.excerpt || "";
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    return paragraph.outerHTML;
  }

  async function writeItemToDirectory(directory, item) {
    const html = await resolveHtml(item);
    const markdown = buildMarkdown(item, html);
    const suffix = sanitizeFileName(String(item.id || "").replace(":", "-"));
    const filename = `${sanitizeFileName(item.title)} - ${suffix}.md`;
    await writeMarkdownToDirectory(directory, filename, markdown);
    return { filename, directoryName: directory.name, markdown };
  }

  async function writeItem(item) {
    const directory = await ensureDirectoryAccess();
    return writeItemToDirectory(directory, item);
  }

  async function writeItems(items, onProgress) {
    const directory = await ensureDirectoryAccess();
    const successes = [];
    const failures = [];
    const list = Array.from(items || []);

    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      try {
        const result = await writeItemToDirectory(directory, item);
        successes.push({ item, result });
        onProgress?.({
          completed: index + 1,
          total: list.length,
          item,
          result,
          error: null
        });
      } catch (error) {
        failures.push({ item, error });
        onProgress?.({
          completed: index + 1,
          total: list.length,
          item,
          result: null,
          error
        });
      }
    }

    return {
      directoryName: directory.name,
      successes,
      failures
    };
  }

  async function writeMarkdownToDirectory(directory, filename, markdown) {
    const fileHandle = await directory.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(markdown);
    await writable.close();
  }

  async function getDirectoryStatus() {
    if (!cacheInitialized) {
      cachedHandle = await getStoredHandle();
      cacheInitialized = true;
    }
    const handle = cachedHandle;
    if (!handle) return { connected: false, name: "" };
    const permission = await handle.queryPermission({ mode: "readwrite" });
    return { connected: permission === "granted", name: handle.name };
  }

  function downloadItem(item, markdown) {
    const suffix = sanitizeFileName(String(item.id || "").replace(":", "-"));
    const filename = `${sanitizeFileName(item.title)} - ${suffix}.md`;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  globalThis.ZhicangObsidian = {
    buildMarkdown,
    chooseDirectory,
    downloadItem,
    getDirectoryStatus,
    initialize: getDirectoryStatus,
    resolveHtml,
    writeMarkdownToDirectory,
    writeItem,
    writeItems
  };
})();
