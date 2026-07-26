(() => {
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
    if (item.updatedAt > current.updatedAt) current.updatedAt = item.updatedAt;
  }
  return [...merged.values()];
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
  stripHtml
};
})();
