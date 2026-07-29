import test from "node:test";
import assert from "node:assert/strict";
import "../src/lib.js";

const {
  createPortableLibrary,
  extractCollectionId,
  extractProfileToken,
  matchesAdvancedSearch,
  matchesSearch,
  mergeIndexedItems,
  normalizeZhihuUrl,
  paginateItems,
  parsePortableLibrary,
  sortByCollectionOrder
} = globalThis.ZhicangLib;

test("extracts a Zhihu profile token from common inputs", () => {
  assert.equal(extractProfileToken("https://www.zhihu.com/people/wang-xiang-wei-93/collections"), "wang-xiang-wei-93");
  assert.equal(extractProfileToken("@someone"), "someone");
});

test("extracts a collection id from a collection URL or raw id", () => {
  assert.equal(extractCollectionId("https://www.zhihu.com/collection/959441365"), "959441365");
  assert.equal(extractCollectionId("959441365"), "959441365");
  assert.equal(extractCollectionId("https://www.zhihu.com/people/someone"), "");
});

test("normalizes answer, question and article URLs", () => {
  assert.equal(
    normalizeZhihuUrl("https://www.zhihu.com/question/123/answer/456?utm_source=x"),
    "https://www.zhihu.com/question/123/answer/456"
  );
  assert.equal(normalizeZhihuUrl("https://zhuanlan.zhihu.com/p/789?x=1"), "https://zhuanlan.zhihu.com/p/789");
});

test("search requires every term and includes collection titles", () => {
  const item = {
    title: "建立个人知识库",
    author: "作者",
    excerpt: "把网页剪藏到笔记",
    fullText: "",
    collectionTitles: ["Obsidian 工作流"]
  };
  assert.equal(matchesSearch(item, "知识库 Obsidian"), true);
  assert.equal(matchesSearch(item, "知识库 不存在"), false);
});

test("advanced search evaluates field-specific AND, OR and NOT layers", () => {
  const item = {
    type: "article",
    title: "个人知识库整理方法",
    author: "纸页实验室",
    excerpt: "从网页剪藏到长期笔记",
    fullText: "使用 Obsidian 建立双向链接",
    collectionTitles: ["知识管理"]
  };
  assert.equal(matchesAdvancedSearch(item, [
    { field: "title", value: "知识库", operator: "and" },
    { field: "author", value: "纸页", operator: "and" },
    { field: "content", value: "Notion", operator: "not" }
  ]), true);
  assert.equal(matchesAdvancedSearch(item, [
    { field: "title", value: "不存在", operator: "and" },
    { field: "collection", value: "知识管理", operator: "or" }
  ]), true);
  assert.equal(matchesAdvancedSearch(item, [
    { field: "status", value: "已导入", operator: "and" }
  ], true), true);
});

test("pagination clamps the page and returns a stable slice", () => {
  const rows = Array.from({ length: 45 }, (_, index) => index + 1);
  assert.deepEqual(paginateItems(rows, 2, 20), {
    items: rows.slice(20, 40),
    page: 2,
    pageCount: 3,
    pageSize: 20,
    start: 20,
    end: 40,
    total: 45
  });
  assert.equal(paginateItems(rows, 99, 20).page, 3);
});

test("deduplicates the same URL while preserving collection membership", () => {
  const base = {
    id: "answer:1",
    type: "answer",
    title: "标题",
    author: "作者",
    excerpt: "",
    fullText: "",
    url: "https://www.zhihu.com/question/1/answer/1",
    updatedAt: 1
  };
  const result = mergeIndexedItems([
    { ...base, collectionIds: ["a"], collectionTitles: ["甲"] },
    { ...base, collectionIds: ["b"], collectionTitles: ["乙"], fullText: "正文", updatedAt: 2 }
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].collectionTitles, ["甲", "乙"]);
  assert.equal(result[0].fullText, "正文");
  assert.equal(result[0].updatedAt, 2);
});

test("sorts the library by collection time and stable API order", () => {
  const rows = [
    { id: "older", collectedAt: 100, collectedOrder: 0 },
    { id: "same-second-later", collectedAt: 200, collectedOrder: 2 },
    { id: "same-second-first", collectedAt: 200, collectedOrder: 1 },
    { id: "fallback", updatedAt: 150 }
  ];
  assert.deepEqual(
    sortByCollectionOrder(rows).map((item) => item.id),
    ["same-second-first", "same-second-later", "fallback", "older"]
  );
});

test("creates and parses a versioned portable library", () => {
  const archive = createPortableLibrary({
    items: [{
      id: "answer:42",
      type: "answer",
      title: "会带到手机的收藏",
      author: "知友",
      excerpt: "摘要",
      fullText: "正文",
      htmlContent: "<p>正文</p>",
      url: "https://www.zhihu.com/question/1/answer/42",
      collectionIds: ["9"],
      collectionTitles: ["稍后阅读"],
      collectedAt: 123,
      collectedOrder: 4,
      updatedAt: 456
    }],
    profile: "demo-user",
    indexedAt: 1000,
    exportedAt: 2000
  });
  const parsed = parsePortableLibrary(JSON.stringify(archive));

  assert.equal(archive.format, "zhicang-portable-library");
  assert.equal(archive.version, 1);
  assert.equal(parsed.itemCount, 1);
  assert.equal(parsed.profile, "demo-user");
  assert.equal(parsed.items[0].htmlContent, "<p>正文</p>");
  assert.equal(parsed.items[0].collectedOrder, 4);
});

test("rejects arbitrary, empty and unsupported portable files", () => {
  assert.throws(() => parsePortableLibrary("{bad json"), /有效的 JSON/);
  assert.throws(() => parsePortableLibrary({ items: [{}] }), /不是由知藏导出/);
  assert.throws(() => parsePortableLibrary({
    format: "zhicang-portable-library",
    version: 2,
    items: [{ id: "1" }]
  }), /暂不支持版本 2/);
  assert.throws(() => parsePortableLibrary({
    format: "zhicang-portable-library",
    version: 1,
    items: []
  }), /没有可载入/);
});

test("strips non-HTTP source URLs from portable items", () => {
  const parsed = parsePortableLibrary({
    format: "zhicang-portable-library",
    version: 1,
    items: [{ id: "unsafe", title: "不安全地址", url: "javascript:alert(1)" }]
  });

  assert.equal(parsed.items[0].url, "");
});
