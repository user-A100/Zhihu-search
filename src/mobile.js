(() => {
  const {
    extractCollectionId,
    extractProfileToken,
    formatDate,
    matchesSearch,
    mergeIndexedItems,
    parseCollectionItem,
    sortByCollectionOrder
  } = globalThis.ZhicangLib;

  const storageApi = (
    globalThis.zhicangPreviewStorage ||
    globalThis.zhicangMobileStorage ||
    globalThis.chrome?.storage
  );
  if (!storageApi?.local) throw new Error("没有可用的本地存储。");
  const storage = storageApi.local;
  const nativeSession = globalThis.ZhicangNative || {
    isNative: false,
    isAvailable: () => false
  };
  const isDemo = new URLSearchParams(location.search).has("demo");
  const TYPE_LABELS = { answer: "回答", article: "文章", pin: "想法" };
  const DEMO_ITEMS = createDemoItems();
  const state = {
    items: [],
    reading: {},
    profile: "",
    indexedAt: 0,
    screen: "home",
    searchFilter: "all",
    query: "",
    activeCollection: "",
    recommendationIds: [],
    recommendationExposure: {},
    nativeLoggedIn: false,
    readerItem: null,
    fontSize: 18,
    saveTimer: 0
  };

  const ids = [
    "homeLogo", "openSyncButton", "homeEmpty", "homeContent", "emptySyncButton",
    "dailyCard", "dailyNumber", "dailyMeta", "dailyTitle", "dailyExcerpt", "dailyReadButton",
    "shuffleButton", "continueSection", "continueCard", "continueCollection", "continueTitle",
    "continueProgress", "continuePercent", "recommendationFeed", "refreshRecommendationsButton",
    "moreRecommendationsButton", "librarySummary", "activeCollectionLabel",
    "libraryCollectionFilters", "libraryItemList", "mobileSearchInput", "clearSearchButton",
    "searchChips", "searchSummary", "searchResults", "searchPlaceholder",
    "profileItemCount", "profileReadCount", "profileCollectionCount", "profileSyncButton",
    "profileSyncStatus", "clearReadingButton", "clearHistoryButton", "historyList", "historyEmpty",
    "reader", "readerProgressBar",
    "readerHeaderCollection", "readerSourceLink", "closeReaderButton", "readerScroller",
    "readerType", "readerDate", "readerTitle", "readerByline", "readerBody", "readerMarkButton",
    "readerPercent", "fontDecreaseButton", "fontIncreaseButton", "syncDialog", "syncForm",
    "mobileProfileInput", "mobileSyncProgress", "mobileSyncProgressBar",
    "mobileSyncProgressText", "mobileSyncError", "mobileSyncButton",
    "nativeSessionPanel", "nativeSessionDot", "nativeSessionTitle",
    "nativeSessionDescription", "nativeLoginButton", "nativeLogoutButton", "toast",
    "mobileItemTemplate", "recommendationTemplate", "historyItemTemplate"
  ];
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

  function createDemoItems() {
    const now = Date.now();
    const day = 86400000;
    const rows = [
      {
        id: "answer:demo-1",
        type: "answer",
        title: "有哪些道理，是你真正经历过以后才明白的？",
        author: "山川与笔记",
        excerpt: "人生里真正重要的改变，往往不是知道了一个新道理，而是某个旧道理终于穿过了身体。",
        collections: ["值得反复读", "人生经验"],
        age: 1,
        body: `
          <p>我们很容易把“知道”错认成“做到”。收藏一篇回答的时候，头脑得到了一次轻微的满足，仿佛其中的经验已经属于自己。</p>
          <p>但真正的理解通常来得慢一些。它藏在一次失败、一段关系，或者一个不得不独自做出的决定之后。</p>
          <h2>经验不是信息的堆积</h2>
          <p>信息可以被检索，经验却需要被唤醒。重新阅读旧收藏的价值，恰恰在于你已经不是收藏它时的那个人。</p>
          <blockquote><p>同一句话，在不同的人生阶段里，会显出不同的重量。</p></blockquote>
          <p>所以，不妨少追逐一些新答案，偶尔回来看看自己曾经郑重保存过什么。</p>`
      },
      {
        id: "article:demo-2",
        type: "article",
        title: "如何建立一套真正能长期运行的个人阅读系统",
        author: "纸页实验室",
        excerpt: "从待读、在读到重温，阅读系统的关键并不是复杂分类，而是让内容持续流动。",
        collections: ["知识管理", "阅读方法"],
        age: 3,
        body: `
          <p>一个阅读系统是否有效，不取决于它保存了多少内容，而取决于内容能不能再次回到你的视野。</p>
          <h2>先把入口变少</h2>
          <p>稍后读、浏览器书签、聊天软件收藏和截图相册常常同时存在。入口越多，遗忘越快。先选一个可信任的收件箱。</p>
          <h2>给阅读留下出口</h2>
          <p>读完之后，只回答一个问题：这篇内容改变了我接下来要做的哪件事？没有答案也没关系，标记已读，然后让它安静归档。</p>`
      },
      {
        id: "answer:demo-3",
        type: "answer",
        title: "长期坚持写作的人，后来都怎么样了？",
        author: "林间来信",
        excerpt: "写作最隐秘的回报，是你开始能分辨自己真正相信什么。",
        collections: ["写作方法"],
        age: 6,
        body: `
          <p>写作并不会自动让一个人变得深刻，但它会让含混暴露出来。</p>
          <p>当你试图把一个念头写完整，就会发现很多确信只是情绪，很多结论之间缺少桥梁。</p>
          <h2>把写作当成认识工具</h2>
          <p>不要急着寻找风格。先写清楚一件具体的小事，再写清楚你为什么在意它。风格是长期诚实表达留下的纹理。</p>`
      },
      {
        id: "article:demo-4",
        type: "article",
        title: "普通人如何理解人工智能这一轮变化",
        author: "远望科技",
        excerpt: "与其猜测所有职业的终局，不如观察智能成本下降后，哪些过去不值得做的事情开始变得可行。",
        collections: ["人工智能", "行业观察"],
        age: 8,
        body: `
          <p>理解技术浪潮最容易犯的错误，是只盯着新工具能不能完整替代某个职业。</p>
          <p>更值得观察的是：当完成一项认知任务的成本下降十倍，需求本身会发生什么变化。</p>
          <h2>需求会被低成本重新塑造</h2>
          <p>过去只有大公司负担得起的研究、设计和个性化服务，会开始进入小团队甚至个人项目。新的使用方式往往诞生在旧市场之外。</p>`
      },
      {
        id: "answer:demo-5",
        type: "answer",
        title: "一个人开始变得成熟，会有哪些具体表现？",
        author: "海盐",
        excerpt: "能区分问题、情绪和关系，不再急着用一个动作同时解决三件事。",
        collections: ["人生经验", "心理学"],
        age: 12,
        body: `
          <p>成熟不是永远冷静，而是情绪出现时，知道它正在影响自己的判断。</p>
          <p>你可以先照顾情绪，再处理问题，最后决定一段关系要走向哪里。这三件事并不总要在同一场谈话里完成。</p>`
      },
      {
        id: "article:demo-6",
        type: "article",
        title: "设计一款让人愿意每天打开的工具",
        author: "小产品手记",
        excerpt: "真正形成习惯的不是提醒，而是用户每次打开都能完成一个足够明确的小闭环。",
        collections: ["产品设计", "行业观察"],
        age: 16,
        body: `
          <p>工具产品常常高估功能数量，低估一次顺畅完成的价值。</p>
          <h2>先找到最小闭环</h2>
          <p>用户打开、看见下一步、完成、获得确定反馈。这个路径越短，产品越容易成为习惯。提醒只能召回一次，闭环才会留下期待。</p>`
      },
      {
        id: "answer:demo-7",
        type: "answer",
        title: "有哪些看似浪费时间，却让你受益很久的事？",
        author: "不赶时间的人",
        excerpt: "没有目的地散步、重读一本旧书、和长辈聊他年轻时的日常。",
        collections: ["值得反复读", "生活方式"],
        age: 23,
        body: `
          <p>效率擅长衡量已经知道目的地的旅程，却很难衡量发现目的地本身。</p>
          <p>那些看似无用的时间，给了注意力脱离既定轨道的机会。很多重要决定，正是在没有任务的时候慢慢浮上来。</p>`
      },
      {
        id: "article:demo-8",
        type: "article",
        title: "从城市漫步开始，重新学习观察",
        author: "街角档案馆",
        excerpt: "观察不是看见更多，而是允许一个普通细节在眼前停留得更久。",
        collections: ["生活方式"],
        age: 31,
        body: `
          <p>选择一条熟悉的街，不拍照，不打开地图，只记录五件以前没有注意过的东西。</p>
          <p>可能是一块褪色的招牌、一扇总在下午打开的窗，或者树根如何顶起人行道。城市从背景重新变成了现场。</p>`
      },
      {
        id: "answer:demo-9",
        type: "answer",
        title: "怎样判断一个知识管理方法是否适合自己？",
        author: "简明主义",
        excerpt: "连续使用两周后，它有没有减少寻找和犹豫，而不是增加维护工作。",
        collections: ["知识管理"],
        age: 38,
        body: `
          <p>任何知识管理系统都应该接受一个朴素的检验：它有没有让下一次行动更容易发生。</p>
          <p>标签是否完美、目录是否优雅，都不如你能不能在需要时找到那条信息重要。</p>`
      },
      {
        id: "article:demo-10",
        type: "article",
        title: "情绪背后的身体：压力是如何被感知的",
        author: "心理观察",
        excerpt: "很多我们称作焦虑的东西，最先出现的地方并不是语言，而是呼吸、肩颈和胃。",
        collections: ["心理学", "值得反复读"],
        age: 45,
        body: `
          <p>情绪不是只发生在头脑里的解释，它也是身体对环境的预测和准备。</p>
          <h2>先辨认，再改变</h2>
          <p>试着描述一个具体感觉：胸口紧、呼吸浅、手心热。准确命名身体感受，常常比立刻说服自己“不要焦虑”更有效。</p>`
      }
    ];

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      author: row.author,
      excerpt: row.excerpt,
      fullText: row.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      htmlContent: row.body,
      url: row.type === "article"
        ? `https://zhuanlan.zhihu.com/p/${row.id.split("-").at(-1)}`
        : `https://www.zhihu.com/question/123456/answer/${row.id.split("-").at(-1)}`,
      collectionIds: row.collections.map((_, index) => `${row.collections[0]}-${index}`),
      collectionTitles: row.collections,
      collectedAt: now - row.age * day,
      collectedOrder: row.age,
      updatedAt: now - row.age * day
    }));
  }

  function readingFor(item) {
    return state.reading[item.id] || { progress: 0, lastReadAt: 0 };
  }

  function readRatio(item) {
    return Math.max(0, Math.min(1, Number(readingFor(item).progress) || 0));
  }

  function estimateMinutes(item) {
    const length = String(item.fullText || item.excerpt || "").replace(/\s+/g, "").length;
    return Math.max(1, Math.ceil(length / 450));
  }

  function collections() {
    const map = new Map();
    for (const item of state.items) {
      (item.collectionTitles || ["未分类"]).forEach((title) => {
        const record = map.get(title) || { title, items: [], read: 0, latest: 0 };
        record.items.push(item);
        if (readRatio(item) >= .94) record.read += 1;
        record.latest = Math.max(record.latest, item.updatedAt || 0);
        map.set(title, record);
      });
    }
    return [...map.values()].sort((a, b) => b.latest - a.latest || a.title.localeCompare(b.title, "zh-CN"));
  }

  function sortedItems() {
    return sortByCollectionOrder(state.items);
  }

  function shuffled(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const next = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[next]] = [copy[next], copy[index]];
    }
    return copy;
  }

  function refreshRecommendations({ animate = false } = {}) {
    if (!state.items.length) {
      state.recommendationIds = [];
      return;
    }

    const ranked = shuffled(state.items).sort((a, b) => {
      return (state.recommendationExposure[a.id] || 0) - (state.recommendationExposure[b.id] || 0);
    });
    const selected = ranked.slice(0, Math.min(6, ranked.length));
    state.recommendationIds = selected.map((item) => item.id);
    for (const item of selected) {
      state.recommendationExposure[item.id] = (state.recommendationExposure[item.id] || 0) + 1;
    }
    storage.set({ recommendationExposure: state.recommendationExposure });

    if (animate) {
      els.dailyCard.classList.remove("switching");
      void els.dailyCard.offsetWidth;
      els.dailyCard.classList.add("switching");
      setTimeout(renderHome, 160);
    }
  }

  function recommendationItems() {
    const map = new Map(state.items.map((item) => [item.id, item]));
    return state.recommendationIds.map((id) => map.get(id)).filter(Boolean);
  }

  function dailyItem() {
    if (!state.recommendationIds.length) refreshRecommendations();
    return recommendationItems()[0] || sortedItems()[0] || null;
  }

  function continueItem() {
    const active = state.items
      .filter((item) => readRatio(item) > 0 && readRatio(item) < .94)
      .sort((a, b) => readingFor(b).lastReadAt - readingFor(a).lastReadAt);
    return active[0] || sortedItems().find((item) => readRatio(item) < .94) || sortedItems()[0] || null;
  }

  function shortCollection(item) {
    return (item.collectionTitles || ["未分类"])[0];
  }

  function createItemNode(item, { showCollectedAt = false } = {}) {
    const node = els.mobileItemTemplate.content.firstElementChild.cloneNode(true);
    const progress = readRatio(item);
    node.querySelector(".item-type").textContent = TYPE_LABELS[item.type] || "内容";
    node.querySelector(".item-collection").textContent = shortCollection(item);
    node.querySelector(".item-title").textContent = item.title;
    node.querySelector(".item-excerpt").textContent = item.excerpt || item.fullText || "暂无摘要";
    node.querySelector(".item-author").textContent = item.author || "未知作者";
    node.querySelector(".item-read-time").textContent = showCollectedAt
      ? `收藏于 ${formatDate(item.collectedAt || item.updatedAt)}`
      : (progress >= .94 ? "已读" : `${estimateMinutes(item)} 分钟`);
    node.querySelector(".item-progress i").style.width = `${Math.round(progress * 100)}%`;
    node.addEventListener("click", () => openReader(item));
    return node;
  }

  function createRecommendationNode(item) {
    const node = els.recommendationTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".recommendation-collection").textContent = shortCollection(item);
    node.querySelector(".recommendation-type").textContent = TYPE_LABELS[item.type] || "内容";
    node.querySelector(".recommendation-title").textContent = item.title;
    node.querySelector(".recommendation-excerpt").textContent = item.excerpt || item.fullText || "暂无摘要";
    node.querySelector(".recommendation-author").textContent = item.author || "未知作者";
    node.querySelector(".recommendation-read-time").textContent = readRatio(item) >= .94
      ? "已读 · 再看一遍"
      : `预计 ${estimateMinutes(item)} 分钟`;
    node.addEventListener("click", () => openReader(item));
    return node;
  }

  function renderHome() {
    const hasItems = state.items.length > 0;
    els.homeEmpty.hidden = hasItems;
    els.homeContent.hidden = !hasItems;
    if (!hasItems) return;

    const daily = dailyItem();
    const recommendations = recommendationItems();
    const dailyIndex = sortedItems().findIndex((item) => item.id === daily.id) + 1;
    els.dailyNumber.textContent = String(dailyIndex).padStart(2, "0");
    els.dailyMeta.textContent = `${shortCollection(daily)} · ${daily.author}`;
    els.dailyTitle.textContent = daily.title;
    els.dailyExcerpt.textContent = daily.excerpt || daily.fullText;
    els.dailyReadButton.textContent = readRatio(daily) > 0 ? "继续阅读" : "开始阅读";
    els.dailyReadButton.append(Object.assign(document.createElement("span"), { textContent: "→" }));
    els.dailyReadButton.onclick = () => openReader(daily);

    const current = continueItem();
    const progress = readRatio(current);
    els.continueCollection.textContent = shortCollection(current);
    els.continueTitle.textContent = current.title;
    els.continueProgress.style.width = `${Math.round(progress * 100)}%`;
    els.continuePercent.textContent = `${Math.round(progress * 100)}%`;
    els.continueCard.onclick = () => openReader(current);

    els.recommendationFeed.replaceChildren(...recommendations.slice(1).map(createRecommendationNode));
  }

  function renderLibrary() {
    const list = collections();
    if (state.activeCollection && !list.some((item) => item.title === state.activeCollection)) {
      state.activeCollection = "";
    }

    const visible = sortedItems().filter((item) => {
      return !state.activeCollection || (item.collectionTitles || []).includes(state.activeCollection);
    });
    els.librarySummary.textContent = `按收藏时间排列 · ${visible.length} 篇内容`;
    els.activeCollectionLabel.textContent = state.activeCollection || "全部收藏";

    const filterButtons = [
      { title: "", label: `全部 ${state.items.length}` },
      ...list.map((collection) => ({ title: collection.title, label: `${collection.title} ${collection.items.length}` }))
    ].map((filter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = filter.label;
      button.classList.toggle("active", filter.title === state.activeCollection);
      button.addEventListener("click", () => {
        state.activeCollection = filter.title;
        renderLibrary();
        scrollTo({ top: 0, behavior: "smooth" });
      });
      return button;
    });
    els.libraryCollectionFilters.replaceChildren(...filterButtons);

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "library-empty";
      empty.textContent = "这个收藏夹里暂时没有可显示的内容。";
      els.libraryItemList.replaceChildren(empty);
      return;
    }

    const nodes = [];
    let previousMonth = "";
    for (const item of visible) {
      const timestamp = item.collectedAt || item.updatedAt || 0;
      const month = timestamp
        ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(new Date(timestamp))
        : "时间未知";
      if (month !== previousMonth) {
        const heading = document.createElement("div");
        heading.className = "timeline-month";
        heading.textContent = month;
        nodes.push(heading);
        previousMonth = month;
      }
      const entry = document.createElement("div");
      entry.className = "timeline-entry";
      entry.append(createItemNode(item, { showCollectedAt: true }));
      nodes.push(entry);
    }
    els.libraryItemList.replaceChildren(...nodes);
  }

  function renderSearch() {
    const query = state.query.trim();
    els.clearSearchButton.hidden = !query;
    const filtered = sortedItems().filter((item) => {
      if (!matchesSearch(item, query)) return false;
      if (state.searchFilter === "unread") return readRatio(item) < .94;
      if (state.searchFilter !== "all") return item.type === state.searchFilter;
      return true;
    });
    const showResults = Boolean(query);
    els.searchPlaceholder.hidden = showResults;
    els.searchResults.hidden = !showResults;
    els.searchSummary.textContent = showResults
      ? `找到 ${filtered.length} 篇匹配收藏`
      : `已收录 ${state.items.length} 篇内容`;
    els.searchResults.replaceChildren(...filtered.map(createItemNode));
    if (showResults && !filtered.length) {
      const empty = document.createElement("div");
      empty.className = "search-placeholder";
      empty.innerHTML = "<span>空</span><p>没有找到匹配内容，试试更短的关键词或切换筛选。</p>";
      els.searchResults.append(empty);
    }
  }

  function renderProfile() {
    const list = collections();
    els.profileItemCount.textContent = String(state.items.length);
    els.profileReadCount.textContent = String(state.items.filter((item) => readRatio(item) >= .94).length);
    els.profileCollectionCount.textContent = String(list.length);
    els.profileSyncStatus.textContent = state.indexedAt
      ? `上次同步 ${formatDate(state.indexedAt)}`
      : "尚未同步";

    const historyItems = state.items
      .filter((item) => readingFor(item).lastReadAt)
      .sort((a, b) => readingFor(b).lastReadAt - readingFor(a).lastReadAt);
    els.historyEmpty.hidden = historyItems.length > 0;
    els.clearHistoryButton.hidden = historyItems.length === 0;
    els.historyList.replaceChildren(...historyItems.slice(0, 30).map((item) => {
      const node = els.historyItemTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".history-time").textContent = formatHistoryTime(readingFor(item).lastReadAt);
      node.querySelector(".history-collection").textContent = shortCollection(item);
      node.querySelector(".history-title").textContent = item.title;
      node.addEventListener("click", () => openReader(item));
      return node;
    }));
  }

  function formatHistoryTime(timestamp) {
    const elapsed = Date.now() - timestamp;
    if (elapsed < 60000) return "刚刚";
    if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
    if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前`;
    if (elapsed < 172800000) return "昨天";
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(timestamp));
  }

  function render() {
    renderHome();
    renderLibrary();
    renderSearch();
    renderProfile();
  }

  function showScreen(name) {
    state.screen = name;
    document.querySelectorAll(".screen").forEach((screen) => {
      const active = screen.dataset.screen === name;
      screen.hidden = !active;
      screen.classList.toggle("active", active);
    });
    document.querySelectorAll("[data-screen-target]").forEach((button) => {
      button.classList.toggle("active", button.dataset.screenTarget === name);
    });
    scrollTo({ top: 0, behavior: "instant" });
    if (name === "search") setTimeout(() => els.mobileSearchInput.focus(), 80);
  }

  function sanitizeHtml(value) {
    const doc = new DOMParser().parseFromString(String(value || ""), "text/html");
    doc.querySelectorAll("script, style, iframe, object, embed, form, input, button").forEach((node) => node.remove());
    doc.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (/^on/i.test(attribute.name) || attribute.name === "style") node.removeAttribute(attribute.name);
      });
    });
    doc.querySelectorAll("a").forEach((link) => {
      link.target = "_blank";
      link.rel = "noreferrer";
    });
    doc.querySelectorAll("img").forEach((image) => {
      image.loading = "lazy";
      image.removeAttribute("width");
      image.removeAttribute("height");
    });
    return doc.body.innerHTML;
  }

  function readerFallback(item) {
    return String(item.fullText || item.excerpt || "暂无正文")
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((paragraph) => {
        const node = document.createElement("p");
        node.textContent = paragraph;
        return node.outerHTML;
      })
      .join("");
  }

  function openReader(item) {
    const progress = readRatio(item);
    state.reading[item.id] = { progress, lastReadAt: Date.now() };
    storage.set({ readingState: state.reading });
    state.readerItem = item;
    els.readerHeaderCollection.textContent = shortCollection(item);
    els.readerSourceLink.href = item.url;
    els.readerType.textContent = TYPE_LABELS[item.type] || "内容";
    els.readerDate.textContent = formatDate(item.updatedAt);
    els.readerTitle.textContent = item.title;
    els.readerByline.textContent = `${item.author || "未知作者"} · 预计阅读 ${estimateMinutes(item)} 分钟`;
    els.readerBody.innerHTML = item.htmlContent?.trim() ? sanitizeHtml(item.htmlContent) : readerFallback(item);
    els.reader.hidden = false;
    document.body.style.overflow = "hidden";
    updateReaderUI(progress);
    history.pushState({ zhicangReader: true }, "");
    requestAnimationFrame(() => {
      const max = els.readerScroller.scrollHeight - els.readerScroller.clientHeight;
      els.readerScroller.scrollTop = max > 0 ? max * progress : 0;
    });
  }

  function closeReader({ fromHistory = false } = {}) {
    if (!state.readerItem) return;
    flushReadingProgress();
    state.readerItem = null;
    els.reader.hidden = true;
    document.body.style.overflow = "";
    render();
    if (!fromHistory && history.state?.zhicangReader) history.back();
  }

  function updateReaderUI(progress) {
    const value = Math.max(0, Math.min(1, progress || 0));
    const percent = Math.round(value * 100);
    els.readerProgressBar.style.width = `${percent}%`;
    els.readerPercent.textContent = `${percent}%`;
    const read = value >= .94;
    els.readerMarkButton.dataset.read = String(read);
    els.readerMarkButton.textContent = read ? "已标记为已读" : "标记为已读";
  }

  function recordReadingProgress(progress) {
    const item = state.readerItem;
    if (!item) return;
    const current = readingFor(item);
    state.reading[item.id] = {
      progress: Math.max(current.progress || 0, Math.min(1, progress)),
      lastReadAt: Date.now()
    };
    updateReaderUI(state.reading[item.id].progress);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => storage.set({ readingState: state.reading }), 350);
  }

  function flushReadingProgress() {
    clearTimeout(state.saveTimer);
    if (state.readerItem) storage.set({ readingState: state.reading });
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  async function refreshNativeSessionStatus() {
    const available = nativeSession.isNative && nativeSession.isAvailable();
    els.nativeSessionPanel.hidden = !available;
    if (!available) return false;

    try {
      const status = await nativeSession.getSessionStatus();
      state.nativeLoggedIn = Boolean(status.loggedIn);
      els.nativeSessionDot.dataset.active = String(state.nativeLoggedIn);
      els.nativeSessionTitle.textContent = state.nativeLoggedIn ? "已登录知乎" : "尚未登录知乎";
      els.nativeSessionDescription.textContent = state.nativeLoggedIn
        ? "登录信息只保存在这台手机，可直接开始同步。"
        : "登录后才能同步有权限查看的收藏夹。";
      els.nativeLoginButton.textContent = state.nativeLoggedIn ? "重新登录" : "在知藏中登录知乎";
      els.nativeLogoutButton.hidden = !state.nativeLoggedIn;
      return state.nativeLoggedIn;
    } catch (error) {
      state.nativeLoggedIn = false;
      els.nativeSessionDot.dataset.active = "false";
      els.nativeSessionTitle.textContent = "无法读取登录状态";
      els.nativeSessionDescription.textContent = error.message || "请重新打开登录页面。";
      els.nativeLogoutButton.hidden = true;
      return false;
    }
  }

  function openSync() {
    els.mobileProfileInput.value = state.profile;
    els.mobileSyncError.hidden = true;
    els.mobileSyncProgress.hidden = true;
    els.syncDialog.showModal();
    refreshNativeSessionStatus();
    setTimeout(() => els.mobileProfileInput.focus(), 80);
  }

  async function fetchJson(url) {
    if (nativeSession.isNative && nativeSession.isAvailable()) {
      const nativeResponse = await nativeSession.requestJson(url);
      if (!nativeResponse.ok) {
        const error = new Error(`知乎接口返回 ${nativeResponse.status}`);
        error.status = nativeResponse.status;
        throw error;
      }
      return JSON.parse(nativeResponse.body);
    }

    const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    if (!response.ok) {
      const error = new Error(`知乎接口返回 ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function setSyncProgress(current, total, text) {
    const percent = Math.round((current / Math.max(1, total)) * 100);
    els.mobileSyncProgress.hidden = false;
    els.mobileSyncProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    els.mobileSyncProgressText.textContent = `${text} · ${percent}%`;
  }

  async function fetchAllPages(urlFactory, onPage) {
    const rows = [];
    for (let offset = 0, page = 0; page < 500; page += 1, offset += 20) {
      const payload = await fetchJson(urlFactory(offset, 20));
      rows.push(...(payload.data || []));
      onPage?.(rows.length, payload.paging?.totals || rows.length);
      if (payload.paging?.is_end || !(payload.data || []).length) break;
    }
    return rows;
  }

  async function syncCollections(input) {
    const collectionId = extractCollectionId(input);
    const token = extractProfileToken(input);
    if (!collectionId && !token) throw new Error("请输入有效的知乎个人主页或收藏夹地址。");
    setSyncProgress(0, 1, "正在读取收藏夹");
    let sourceCollections;
    if (collectionId) {
      const payload = await fetchJson(`https://www.zhihu.com/api/v4/collections/${collectionId}`);
      const detail = payload.collection || payload;
      sourceCollections = [{ id: String(detail.id || collectionId), title: detail.title || `收藏夹 ${collectionId}` }];
    } else {
      sourceCollections = await fetchAllPages(
        (offset, limit) => `https://www.zhihu.com/api/v4/members/${encodeURIComponent(token)}/favlists?offset=${offset}&limit=${limit}`,
        (current, total) => setSyncProgress(current, total, `已发现 ${current} 个收藏夹`)
      );
    }
    if (!sourceCollections.length) throw new Error("没有找到可读取的收藏夹。");

    const parsed = [];
    for (let index = 0; index < sourceCollections.length; index += 1) {
      const collection = sourceCollections[index];
      const entries = await fetchAllPages(
        (offset, limit) => `https://www.zhihu.com/api/v4/collections/${collection.id}/items?offset=${offset}&limit=${limit}`,
        (current, total) => setSyncProgress(
          index + current / Math.max(total, 1),
          sourceCollections.length,
          `正在同步 ${collection.title} ${current}/${total}`
        )
      );
      for (const entry of entries) {
        try {
          const item = parseCollectionItem(entry, collection);
          if (item.url) {
            item.collectedOrder = parsed.length;
            parsed.push(item);
          }
        } catch (error) {
          console.warn("跳过无法解析的收藏内容", error);
        }
      }
    }
    return mergeIndexedItems(parsed);
  }

  els.homeLogo.addEventListener("click", () => showScreen("home"));
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.go));
  });
  document.querySelectorAll("[data-screen-target]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.screenTarget));
  });
  [els.openSyncButton, els.emptySyncButton, els.profileSyncButton].forEach((button) => {
    button.addEventListener("click", openSync);
  });
  els.nativeLoginButton.addEventListener("click", async () => {
    els.nativeLoginButton.disabled = true;
    els.nativeLoginButton.textContent = "正在打开知乎…";
    try {
      const result = await nativeSession.openLogin();
      await refreshNativeSessionStatus();
      if (result.loggedIn) showToast("知乎登录完成");
    } catch (error) {
      els.mobileSyncError.hidden = false;
      els.mobileSyncError.textContent = error.message || "无法打开知乎登录页面。";
    } finally {
      els.nativeLoginButton.disabled = false;
    }
  });
  els.nativeLogoutButton.addEventListener("click", async () => {
    if (!confirm("退出知乎并清除知藏中的登录信息？收藏索引和阅读历史会保留。")) return;
    await nativeSession.clearSession();
    await refreshNativeSessionStatus();
    showToast("知乎登录信息已清除");
  });
  [els.shuffleButton, els.refreshRecommendationsButton, els.moreRecommendationsButton].forEach((button) => {
    button.addEventListener("click", () => {
      refreshRecommendations({ animate: true });
      showToast("已换一批推荐");
    });
  });
  els.mobileSearchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderSearch();
  });
  els.clearSearchButton.addEventListener("click", () => {
    state.query = "";
    els.mobileSearchInput.value = "";
    renderSearch();
    els.mobileSearchInput.focus();
  });
  els.searchChips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-search-filter]");
    if (!button) return;
    state.searchFilter = button.dataset.searchFilter;
    els.searchChips.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    renderSearch();
  });
  els.closeReaderButton.addEventListener("click", () => closeReader());
  els.readerScroller.addEventListener("scroll", () => {
    const max = els.readerScroller.scrollHeight - els.readerScroller.clientHeight;
    if (max <= 0) return;
    recordReadingProgress(els.readerScroller.scrollTop / max);
  }, { passive: true });
  els.readerMarkButton.addEventListener("click", () => {
    if (!state.readerItem) return;
    const done = readRatio(state.readerItem) >= .94;
    state.reading[state.readerItem.id] = { progress: done ? 0 : 1, lastReadAt: Date.now() };
    storage.set({ readingState: state.reading });
    updateReaderUI(done ? 0 : 1);
    showToast(done ? "已重置为未读" : "已标记为已读");
  });
  els.fontDecreaseButton.addEventListener("click", () => {
    state.fontSize = Math.max(15, state.fontSize - 1);
    document.documentElement.style.setProperty("--reader-size", `${state.fontSize}px`);
  });
  els.fontIncreaseButton.addEventListener("click", () => {
    state.fontSize = Math.min(23, state.fontSize + 1);
    document.documentElement.style.setProperty("--reader-size", `${state.fontSize}px`);
  });
  els.clearReadingButton.addEventListener("click", async () => {
    if (!confirm("清除全部阅读进度？收藏内容会保留。")) return;
    state.reading = {};
    await storage.set({ readingState: {} });
    render();
    showToast("阅读进度已清除");
  });
  els.clearHistoryButton.addEventListener("click", async () => {
    if (!confirm("清空浏览历史？阅读进度会保留。")) return;
    state.reading = Object.fromEntries(
      Object.entries(state.reading).map(([id, record]) => [id, { ...record, lastReadAt: 0 }])
    );
    await storage.set({ readingState: state.reading });
    renderProfile();
    showToast("浏览历史已清空");
  });
  els.syncForm.addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    els.mobileSyncError.hidden = true;
    els.mobileSyncButton.disabled = true;
    els.mobileSyncButton.textContent = "同步中…";
    try {
      if (nativeSession.isNative && nativeSession.isAvailable() && !state.nativeLoggedIn) {
        throw new Error("请先在知藏中登录知乎。");
      }
      const items = await syncCollections(els.mobileProfileInput.value);
      const indexedAt = Date.now();
      state.items = items;
      state.profile = els.mobileProfileInput.value.trim();
      state.indexedAt = indexedAt;
      await storage.set({ items, profile: state.profile, indexedAt });
      state.recommendationIds = [];
      refreshRecommendations();
      render();
      els.syncDialog.close();
      showToast(`已同步 ${items.length} 篇收藏`);
    } catch (error) {
      els.mobileSyncError.hidden = false;
      els.mobileSyncError.textContent = error.status === 401
        ? "知乎拒绝了读取请求。请先登录知乎，再重新同步。"
        : `${error.message || "同步失败"} 如果出现验证码，请先在知乎完成验证。`;
    } finally {
      els.mobileSyncButton.disabled = false;
      els.mobileSyncButton.textContent = "开始同步";
    }
  });
  addEventListener("popstate", () => {
    if (state.readerItem) closeReader({ fromHistory: true });
  });
  addEventListener("beforeunload", flushReadingProgress);

  storageApi.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.items) state.items = changes.items.newValue || [];
    if (changes.readingState) state.reading = changes.readingState.newValue || {};
    if (changes.indexedAt) state.indexedAt = changes.indexedAt.newValue || 0;
    render();
  });

  async function init() {
    const saved = await storage.get([
      "items",
      "readingState",
      "profile",
      "indexedAt",
      "recommendationExposure"
    ]);
    state.items = isDemo ? DEMO_ITEMS : (saved.items || []);
    state.reading = isDemo
      ? {
          "answer:demo-1": { progress: .42, lastReadAt: Date.now() - 3600000 },
          "article:demo-2": { progress: 1, lastReadAt: Date.now() - 86400000 },
          "answer:demo-3": { progress: .18, lastReadAt: Date.now() - 172800000 }
        }
      : (saved.readingState || {});
    state.recommendationExposure = isDemo ? {} : (saved.recommendationExposure || {});
    state.profile = saved.profile || "";
    state.indexedAt = isDemo ? Date.now() - 7200000 : (saved.indexedAt || 0);
    refreshRecommendations();
    render();
    showScreen("home");
    document.documentElement.dataset.zhicangReady = "true";
  }

  init().catch((error) => {
    console.error(error);
    document.getElementById("bootError").hidden = false;
  });
})();
