import test from "node:test";
import assert from "node:assert/strict";
import "../src/lib.js";

const {
  extractCollectionId,
  extractProfileToken,
  matchesAdvancedSearch,
  matchesSearch,
  mergeIndexedItems,
  normalizeZhihuUrl,
  paginateItems
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
