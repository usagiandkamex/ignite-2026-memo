const BOOK_URL = "https://news.microsoft.com/events/ignite/2026/book-of-news/";

function officialLinks(links, id) {
  return links.map((href, index) => {
    const url = new URL(href);
    if (url.protocol !== "https:") throw new Error(`Invalid source URL for ${id}`);
    return [`公式情報 ${index + 1}（${url.hostname}）`, href];
  });
}

export function combineAnnouncements(editorial, sources, additional) {
  const book = Object.entries(editorial).map(([number, {title, items}]) => {
    if (!Object.hasOwn(sources, number)) throw new Error(`Missing source for ${number}`);
    const {topic, anchor, links} = sources[number];
    return {
      id: `news-${number.replaceAll(".", "-")}`, number, title, topic, source: "book", items,
      links: [["Book of News", `${BOOK_URL}#${anchor}`], ...officialLinks(links, number)]
    };
  });
  const supplements = Object.entries(additional).map(([slug, {title, topic, links, items}]) => ({
    id: `additional-${slug}`, number: "", title, topic, source: "additional", items,
    links: officialLinks(links, slug)
  }));
  return [...book, ...supplements];
}

const normalize = text => text.normalize("NFKC").toLowerCase();

export function filterAnnouncements(announcements, {query = "", topic = "", status = "", source = ""} = {}) {
  const words = normalize(query).trim().split(/\s+/u).filter(Boolean);
  return announcements.flatMap(entry => {
    if ((topic && entry.topic !== topic) || (source && entry.source !== source)) return [];
    if (!status && !words.length) return [entry];
    const items = entry.items.filter(([itemStatus, change, benefit]) => {
      const haystack = normalize(`${entry.number} ${entry.title} ${entry.topic} ${itemStatus} ${change} ${benefit}`);
      return (!status || itemStatus === status) && words.every(word => haystack.includes(word));
    });
    return items.length ? [{...entry, items}] : [];
  });
}

function createLink(text, href) {
  const link = document.createElement("a");
  link.textContent = text;
  link.href = href;
  return link;
}

function renderAnnouncements(announcements, container) {
  const fragment = document.createDocumentFragment();
  for (const {id, number, title, topic, links, items} of announcements) {
    const details = document.createElement("details");
    details.className = "update-card";
    details.id = id;
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    label.className = "update-card-label";
    label.textContent = `${topic}${number ? ` / ${number}` : ""} · ${items.length}項目`;
    const heading = document.createElement("strong");
    heading.textContent = title;
    summary.append(label, heading);
    const list = document.createElement("ul");
    list.className = "update-items";
    list.setAttribute("role", "list");
    for (const [status, change, benefit] of items) {
      const item = document.createElement("li");
      const badge = document.createElement("span");
      badge.className = "update-badge";
      badge.dataset.status = status;
      badge.textContent = status;
      const explanation = document.createElement("dl");
      explanation.className = "update-explanation";
      for (const [label, text] of [["何が変わる", change], ["メリット", benefit]]) {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = text;
        explanation.append(term, description);
      }
      item.append(badge, explanation);
      list.append(item);
    }
    const references = document.createElement("p");
    references.className = "update-sources";
    references.append("出典：");
    for (const [text, url] of links) {
      references.append(createLink(text, url));
    }
    details.append(summary, list, references);
    fragment.append(details);
  }
  container.replaceChildren(fragment);
}

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function init() {
  const groups = document.querySelectorAll("[data-announcement-source]");
  const count = document.querySelector("#update-count");
  const error = document.querySelector("#update-error");
  const filters = document.querySelector("#update-filters");
  const search = document.querySelector("#update-search");
  const topic = document.querySelector("#update-topic");
  const status = document.querySelector("#update-status");
  const source = document.querySelector("#update-source");
  count.hidden = false;
  try {
    const [editorial, sources, additional] = await Promise.all([
      loadJSON("./updates-editorial.json"),
      loadJSON("./updates-sources.json"),
      loadJSON("./updates-additional.json")
    ]);
    const announcements = combineAnnouncements(editorial, sources, additional);
    const ids = new Set(announcements.map(entry => entry.id));
    for (const name of new Set(announcements.map(entry => entry.topic))) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      topic.append(option);
    }

    function update() {
      const matches = filterAnnouncements(announcements, {
        query: search.value, topic: topic.value, status: status.value, source: source.value
      });
      for (const group of groups) {
        const entries = matches.filter(entry => entry.source === group.dataset.announcementSource);
        group.hidden = entries.length === 0;
        group.querySelector(".update-group-count").textContent = `${entries.length}件`;
        renderAnnouncements(entries, group.querySelector(".update-group-results"));
      }
      const items = matches.reduce((total, entry) => total + entry.items.length, 0);
      count.textContent = matches.length
        ? `${matches.length}件の見出し / ${items}項目を表示（全${announcements.length}件）`
        : "条件に一致する項目がありません。キーワードや絞り込みを変更してください。";
    }

    function clearFilters() {
      filters.reset();
      update();
    }

    function openLinkedAnnouncement() {
      const id = location.hash.slice(1);
      if (id !== "additional-title" && !ids.has(id)) return;
      if (search.value || topic.value || status.value || source.value) clearFilters();
      const target = document.getElementById(id);
      if (target instanceof HTMLDetailsElement) {
        target.open = true;
        target.querySelector("summary").focus({preventScroll: true});
      } else {
        target.focus({preventScroll: true});
      }
      target.scrollIntoView();
    }

    update();
    filters.addEventListener("submit", event => event.preventDefault());
    filters.addEventListener("input", update);
    document.querySelector("#update-clear").addEventListener("click", clearFilters);
    filters.hidden = false;
    // Reopening the same announcement does not fire hashchange.
    for (const link of document.querySelectorAll('a[href^="#news-"], a[href="#additional-title"]')) {
      link.addEventListener("click", event => {
        if (link.hash !== location.hash || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openLinkedAnnouncement();
      });
    }
    window.addEventListener("hashchange", openLinkedAnnouncement);
    openLinkedAnnouncement();
  } catch (cause) {
    console.error("Could not load announcement data", cause);
    count.hidden = true;
    error.hidden = false;
    error.append(document.createTextNode("発表一覧を読み込めませんでした。"), createLink("公式Book of News", BOOK_URL), document.createTextNode("をご覧ください。"));
  }
}

if (typeof document !== "undefined") init();
