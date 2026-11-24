const BOOK_URL = "https://news.microsoft.com/events/ignite/2026/book-of-news/";

export function filterAnnouncements(editorial, sources, {query = "", topic = "", status = ""} = {}) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return Object.entries(editorial).flatMap(([number, entry]) => {
    const source = sources[number];
    if (!source) throw new Error(`Missing source for ${number}`);
    if (topic && source.topic !== topic) return [];
    const items = entry.items.filter(([itemStatus, text]) => {
      const haystack = `${number} ${entry.title} ${source.topic} ${itemStatus} ${text}`.toLocaleLowerCase();
      return (!status || itemStatus === status) && words.every(word => haystack.includes(word));
    });
    return items.length ? [{number, title: entry.title, source, items}] : [];
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
  for (const {number, title, source, items} of announcements) {
    const details = document.createElement("details");
    details.className = "update-card";
    details.id = `news-${number.replaceAll(".", "-")}`;
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    label.className = "update-card-label";
    label.textContent = `${source.topic} / ${number}`;
    const heading = document.createElement("strong");
    heading.textContent = title;
    summary.append(label, heading);
    const list = document.createElement("ul");
    for (const [status, text] of items) {
      const item = document.createElement("li");
      const badge = document.createElement("span");
      badge.className = "update-badge";
      badge.textContent = status;
      item.append(badge, document.createTextNode(` ${text}`));
      list.append(item);
    }
    const links = document.createElement("p");
    links.className = "update-sources";
    links.append(createLink("Book of News", `${BOOK_URL}#${source.anchor}`));
    for (const url of source.links) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error(`Invalid source URL for ${number}`);
      links.append(document.createTextNode(" · "), createLink("関連する公式情報", url));
    }
    details.append(summary, list, links);
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
  const results = document.querySelector("#update-results");
  const count = document.querySelector("#update-count");
  const error = document.querySelector("#update-error");
  const search = document.querySelector("#update-search");
  const topic = document.querySelector("#update-topic");
  const status = document.querySelector("#update-status");
  try {
    const [editorial, sources] = await Promise.all([
      loadJSON("./updates-editorial.json"),
      loadJSON("./updates-sources.json")
    ]);
    const topics = [...new Set(Object.values(sources).map(source => source.topic))];
    for (const name of topics) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      topic.append(option);
    }
    function update() {
      const matches = filterAnnouncements(editorial, sources, {
        query: search.value, topic: topic.value, status: status.value
      });
      renderAnnouncements(matches, results);
      const items = matches.reduce((total, entry) => total + entry.items.length, 0);
      count.textContent = matches.length
        ? `${matches.length}発表 / ${items}項目を表示（発表内の項目は照合中）`
        : "条件に一致する発表はありません。";
    }
    search.addEventListener("input", update);
    topic.addEventListener("change", update);
    status.addEventListener("change", update);
    update();
    function openLinkedAnnouncement() {
      if (!location.hash.startsWith("#news-")) return;
      let target = document.getElementById(location.hash.slice(1));
      if (!target && (search.value || topic.value || status.value)) {
        search.value = topic.value = status.value = "";
        update();
        target = document.getElementById(location.hash.slice(1));
      }
      if (target instanceof HTMLDetailsElement) {
        target.open = true;
        target.scrollIntoView();
      }
    }
    window.addEventListener("hashchange", openLinkedAnnouncement);
    openLinkedAnnouncement();
  } catch (cause) {
    console.error("Could not load announcement data", cause);
    count.textContent = "";
    error.hidden = false;
    error.append(document.createTextNode("発表一覧を読み込めませんでした。"), createLink("公式Book of News", BOOK_URL), document.createTextNode("をご覧ください。"));
  }
}

if (typeof document !== "undefined") init();
