(() => {
const PORTABLE_LIBRARY_FORMAT = "zhicang-portable-library";
const PORTABLE_LIBRARY_VERSION = 1;

function extractProfileToken(input) {
  const value = String(input || "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/people\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return value.replace(/^@/, "").split(/[/?#]/)[0];
  }
}

function extractCollectionId(input) {
  const value = String(input || "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/collection\/(\d+)/);
    return match ? match[1] : "";
  } catch {
    return /^\d+$/.test(value) ? value : "";
  }
}

function normalizeZhihuUrl(input) {
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

function stripHtml(value) {
  if (!value) return "";
  const doc = new DOMParser().parseFromString(String(value), "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function timestampToMs(value) {
  const number = Number(value || 0);
  if (!number) return 0;
  return number > 1e12 ? number : number * 1000;
}

function parseCollectionItem(entry, collection) {
  const content = entry?.content || entry || {};
  const type = content.type || entry?.type || "unknown";
  let title = content.title || content.question?.title || "未命名内容";
  let url = content.url || "";
  let excerpt = content.excerpt || content.excerpt_title || "";

  if (type === "answer") {
    const questionId = content.question?.id || content.question?.url?.match(/questions\/(\d+)/)?.[1];
    const answerId = content.id || content.url?.match(/answers\/(\d+)/)?.[1];
    if (questionId && answerId) {
      url = `https://www.zhihu.com/question/${questionId}/answer/${answerId}`;
    }
  } else if (type === "article") {
    const articleId = content.id || content.url?.match(/articles\/(\d+)/)?.[1];
    if (articleId) url = `https://zhuanlan.zhihu.com/p/${articleId}`;
  }

  const normalizedUrl = normalizeZhihuUrl(url);
  const htmlContent = String(content.content || content.detail || "");
  const fullText = stripHtml(htmlContent);
  const collectedAt = timestampToMs(
    entry?.created_time ||
    entry?.created ||
    entry?.collected_time ||
    content.collected_time
  );

  return {
    id: `${type}:${content.id || normalizedUrl}`,
    type,
    title: stripHtml(title),
    author: stripHtml(content.author?.name || content.author?.headline || "未知作者"),
    excerpt: stripHtml(excerpt),
    fullText,
    htmlContent,
    url: normalizedUrl,
    collectionIds: [String(collection.id)],
    collectionTitles: [collection.title],
    collectedAt,
    updatedAt: Number(content.updated_time || content.updated || content.created_time || 0) * 1000
  };
}

function mergeIndexedItems(items) {
  const merged = new Map();
  for (const item of items) {
    const key = item.url || item.id;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...item });
      continue;
    }

    current.collectionIds = [...new Set([...current.collectionIds, ...item.collectionIds])];
    current.collectionTitles = [...new Set([...current.collectionTitles, ...item.collectionTitles])];
    if (!current.fullText && item.fullText) current.fullText = item.fullText;
    if ((item.collectedAt || 0) > (current.collectedAt || 0)) current.collectedAt = item.collectedAt;
    if (
      Number.isFinite(item.collectedOrder) &&
      (!Number.isFinite(current.collectedOrder) || item.collectedOrder < current.collectedOrder)
    ) {
      current.collectedOrder = item.collectedOrder;
    }
    if (item.updatedAt > current.updatedAt) current.updatedAt = item.updatedAt;
  }
  return [...merged.values()];
}

function portableHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizePortableItem(item, index) {
  if (!item || typeof item !== "object" || (!item.id && !item.url)) {
    throw new Error(`数据包中的第 ${index + 1} 篇收藏缺少标识。`);
  }

  const collectedOrder = Number(item.collectedOrder);
  return {
    ...item,
    id: String(item.id || item.url),
    type: String(item.type || "unknown"),
    title: String(item.title || "未命名内容"),
    author: String(item.author || "未知作者"),
    excerpt: String(item.excerpt || ""),
    fullText: String(item.fullText || ""),
    htmlContent: String(item.htmlContent || ""),
    url: portableHttpUrl(item.url),
    collectionIds: Array.isArray(item.collectionIds) ? item.collectionIds.map(String) : [],
    collectionTitles: Array.isArray(item.collectionTitles) ? item.collectionTitles.map(String) : [],
    collectedAt: Number(item.collectedAt || 0),
    updatedAt: Number(item.updatedAt || 0),
    collectedOrder: Number.isFinite(collectedOrder) ? collectedOrder : index
  };
}

function createPortableLibrary({ items, profile = "", indexedAt = 0, exportedAt = Date.now() }) {
  if (!Array.isArray(items)) throw new Error("没有可导出的收藏数据。");
  const portableItems = mergeIndexedItems(items.map(normalizePortableItem));
  return {
    format: PORTABLE_LIBRARY_FORMAT,
    version: PORTABLE_LIBRARY_VERSION,
    exportedAt: Number(exportedAt || Date.now()),
    indexedAt: Number(indexedAt || 0),
    profile: String(profile || ""),
    itemCount: portableItems.length,
    items: portableItems
  };
}

function parsePortableLibrary(value) {
  let archive = value;
  if (typeof value === "string") {
    try {
      archive = JSON.parse(value);
    } catch {
      throw new Error("文件不是有效的 JSON 数据。");
    }
  }

  if (!archive || typeof archive !== "object" || archive.format !== PORTABLE_LIBRARY_FORMAT) {
    throw new Error("这不是由知藏导出的手机数据包。");
  }
  if (Number(archive.version) !== PORTABLE_LIBRARY_VERSION) {
    throw new Error(`暂不支持版本 ${archive.version ?? "未知"} 的知藏数据包。`);
  }
  if (!Array.isArray(archive.items) || archive.items.length === 0) {
    throw new Error("数据包中没有可载入的收藏。");
  }

  const items = mergeIndexedItems(archive.items.map(normalizePortableItem));
  return {
    format: PORTABLE_LIBRARY_FORMAT,
    version: PORTABLE_LIBRARY_VERSION,
    exportedAt: Number(archive.exportedAt || 0),
    indexedAt: Number(archive.indexedAt || 0),
    profile: String(archive.profile || ""),
    itemCount: items.length,
    items
  };
}

function sortByCollectionOrder(items) {
  return [...(items || [])].sort((a, b) => {
    const aCollectedAt = Number(a.collectedAt || 0);
    const bCollectedAt = Number(b.collectedAt || 0);
    if (aCollectedAt || bCollectedAt) {
      const aTime = aCollectedAt || Number(a.updatedAt || 0);
      const bTime = bCollectedAt || Number(b.updatedAt || 0);
      if (aTime !== bTime) return bTime - aTime;
    }

    const aOrder = Number.isFinite(a.collectedOrder) ? a.collectedOrder : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.collectedOrder) ? b.collectedOrder : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aUpdatedAt = Number(a.updatedAt || 0);
    const bUpdatedAt = Number(b.updatedAt || 0);
    if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

function matchesSearch(item, query) {
  const terms = String(query || "")
    .toLocaleLowerCase("zh-CN")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return true;

  const haystack = [
    item.title,
    item.author,
    item.excerpt,
    item.fullText,
    ...(item.collectionTitles || [])
  ].join("\n").toLocaleLowerCase("zh-CN");

  return terms.every((term) => haystack.includes(term));
}

function fieldSearchText(item, field, clipped) {
  const fields = {
    title: item.title,
    author: item.author,
    content: [item.excerpt, item.fullText].join("\n"),
    collection: (item.collectionTitles || []).join("\n"),
    type: ({
      answer: "回答 answer",
      article: "文章 article",
      pin: "想法 pin"
    })[item.type] || item.type,
    status: clipped ? "已剪藏 已导入 clipped imported" : "待剪藏 未导入 unclipped pending"
  };

  if (field !== "all") return String(fields[field] || "");
  return [
    fields.title,
    fields.author,
    fields.content,
    fields.collection,
    fields.type,
    fields.status
  ].join("\n");
}

function matchesFieldSearch(item, field, query, clipped = false) {
  const terms = String(query || "")
    .toLocaleLowerCase("zh-CN")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return true;

  const haystack = fieldSearchText(item, field, clipped).toLocaleLowerCase("zh-CN");
  return terms.every((term) => haystack.includes(term));
}

function matchesAdvancedSearch(item, conditions, clipped = false) {
  const active = (conditions || []).filter((condition) => String(condition?.value || "").trim());
  if (!active.length) return true;

  let matched = matchesFieldSearch(item, active[0].field || "all", active[0].value, clipped);
  for (const condition of active.slice(1)) {
    const current = matchesFieldSearch(item, condition.field || "all", condition.value, clipped);
    if (condition.operator === "or") matched = matched || current;
    else if (condition.operator === "not") matched = matched && !current;
    else matched = matched && current;
  }
  return matched;
}

function paginateItems(items, page = 1, pageSize = 20) {
  const safeSize = Math.max(1, Number(pageSize) || 20);
  const pageCount = Math.max(1, Math.ceil(items.length / safeSize));
  const safePage = Math.min(pageCount, Math.max(1, Number(page) || 1));
  const start = (safePage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    page: safePage,
    pageCount,
    pageSize: safeSize,
    start,
    end: Math.min(start + safeSize, items.length),
    total: items.length
  };
}

function formatDate(timestamp) {
  if (!timestamp) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

globalThis.ZhicangLib = {
  PORTABLE_LIBRARY_FORMAT,
  PORTABLE_LIBRARY_VERSION,
  createPortableLibrary,
  extractCollectionId,
  extractProfileToken,
  formatDate,
  matchesAdvancedSearch,
  matchesFieldSearch,
  matchesSearch,
  mergeIndexedItems,
  normalizeZhihuUrl,
  paginateItems,
  parseCollectionItem,
  parsePortableLibrary,
  sortByCollectionOrder,
  stripHtml
};
})();
