const normalize = text => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function filterSessions(sessions, category, query) {
  const terms = normalize(query).split(/[,、]/).map(term => term.trim()).filter(Boolean);
  return sessions.filter(session => {
    if (category && session.category !== category) return false;
    const searchable = [session.code, session.title, session.summary, ...session.tags].map(normalize);
    return terms.every(term => searchable.some(field => field.includes(term)));
  });
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const count = value => value.toLocaleString("ja-JP");
const sessionUrl = ({id}) => `https://ignite.microsoft.com/en-US/sessions/${id}`;

function link(text, href) {
  const anchor = element("a", text);
  anchor.href = href;
  return anchor;
}

function sessionCard(session) {
  const card = element("li", "", "infra-card");
  const title = element("h4");
  const details = link(session.title, sessionUrl(session));
  details.lang = "en";
  title.append(details);
  card.append(
    element("p", `${session.code} · ${session.format}`, "eyebrow"),
    title,
    element("p", session.summary),
    element("p", session.tags.join(" / "), "muted infra-tags")
  );
  if (session.youtubeUrl) {
    const recording = link("YouTube で録画を見る", session.youtubeUrl);
    recording.setAttribute("aria-label", `${session.code} の録画を YouTube で見る`);
    card.append(recording);
  }
  return card;
}

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function updateLinks(label, links) {
  const row = element("p", "", "infra-update-links");
  row.append(element("span", label), ...links);
  return row;
}

function updateCard(update, sessionsByCode) {
  const card = element("li", "", "infra-card infra-update-card");
  const badge = element("span", update.status, "infra-update-status");
  badge.dataset.status = update.status;
  const details = element("dl");
  for (const [label, text] of [
    ["何が変わる", update.change], ["活用場面", update.use], ["導入前の確認", update.check]
  ]) {
    details.append(element("dt", label), element("dd", text));
  }
  card.append(
    badge, element("h4", update.title), details,
    updateLinks("公式出典：", update.sources.map(({label, url}) => link(label, url))),
    updateLinks("関連セッション：", update.sessions.map(code => {
      const session = sessionsByCode.get(code);
      const related = link(code, sessionUrl(session));
      related.setAttribute("aria-label", `${code}: ${session.title}`);
      return related;
    }))
  );
  return card;
}

async function renderUpdates(catalog) {
  const status = document.getElementById("infra-updates-status");
  const results = document.getElementById("infra-updates-results");
  status.textContent = "アップデートを読み込み中…";
  try {
    const [{groups, checked}, {categories, sessions}] = await Promise.all([
      loadJSON("./infra-updates.json"), catalog
    ]);
    const sessionsByCode = new Map(sessions.map(session => [session.code, session]));
    let total = 0;
    results.append(...categories.map(({id, label}) => {
      const updates = groups[id];
      total += updates.length;
      const group = element("details", "", "infra-update-group");
      const summary = element("summary");
      summary.append(element("strong", label), element("span", `${count(updates.length)} 件`, "muted"));
      const list = element("ul", "", "infra-grid");
      list.setAttribute("role", "list");
      list.append(...updates.map(update => updateCard(update, sessionsByCode)));
      group.append(summary, list);
      return group;
    }));
    status.textContent = `${count(categories.length)} 分野・${count(total)} 件の発表を掲載（公式資料の確認日：${checked}）。`;
  } catch (error) {
    console.error(error);
    status.classList.add("error");
    status.replaceChildren("アップデートを読み込めませんでした。", link("公式 Book of News", "https://news.microsoft.com/events/ignite/2026/book-of-news/"), "をご覧ください。");
  }
}

async function renderCatalog(catalog) {
  const filters = document.getElementById("infra-filters");
  const category = document.getElementById("infra-category");
  const query = document.getElementById("infra-query");
  const status = document.getElementById("infra-status");
  const results = document.getElementById("infra-results");
  status.textContent = "セッションを読み込み中…";

  try {
    const {source, categories, sessions} = await catalog;
    for (const {id, label} of categories) {
      const option = element("option", label);
      option.value = id;
      category.append(option);
    }
    const {checked, timeSlots, uniqueSessions} = source;
    document.getElementById("infra-source").append(
      ` 確認日：${checked}。公開カタログ ${count(timeSlots)} 枠（重複開催を除くと ${count(uniqueSessions)} セッション）から ${count(sessions.length)} 件を掲載。`
    );

    function render() {
      const visible = filterSessions(sessions, category.value, query.value);
      status.textContent = visible.length
        ? `${count(visible.length)} 件表示（全 ${count(sessions.length)} 件）`
        : "条件に一致するセッションはありません。";
      results.replaceChildren();
      for (const {id, label} of categories) {
        const matching = visible.filter(session => session.category === id);
        if (!matching.length) continue;
        const section = element("section", "", "infra-group");
        const list = element("ul", "", "infra-grid");
        list.setAttribute("role", "list");
        list.append(...matching.map(sessionCard));
        section.append(element("h3", `${label}（${matching.length} 件）`), list);
        results.append(section);
      }
    }

    render();
    category.addEventListener("change", render);
    query.addEventListener("input", render);
    filters.hidden = false;
  } catch (error) {
    console.error(error);
    status.classList.add("error");
    status.replaceChildren("一覧を読み込めませんでした。", link("公式カタログ", "https://ignite.microsoft.com/en-US/sessions"), "をご利用ください。");
  }
}

if (typeof document !== "undefined") {
  const catalog = loadJSON("./infra-sessions.json");
  renderUpdates(catalog);
  renderCatalog(catalog);
}
