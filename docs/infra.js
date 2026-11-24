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

function sessionCard(session) {
  const card = element("li", "", "infra-card");
  const title = element("h4");
  const details = element("a", session.title);
  details.href = `https://ignite.microsoft.com/en-US/sessions/${session.id}`;
  details.lang = "en";
  title.append(details);
  card.append(
    element("p", `${session.code} · ${session.format}`, "eyebrow"),
    title,
    element("p", session.summary),
    element("p", session.tags.join(" / "), "muted infra-tags")
  );
  if (session.youtubeUrl) {
    const recording = element("a", "YouTube で録画を見る");
    recording.href = session.youtubeUrl;
    recording.setAttribute("aria-label", `${session.code} の録画を YouTube で見る`);
    card.append(recording);
  }
  return card;
}

async function loadCatalog() {
  const filters = document.getElementById("infra-filters");
  const category = document.getElementById("infra-category");
  const query = document.getElementById("infra-query");
  const status = document.getElementById("infra-status");
  const results = document.getElementById("infra-results");
  status.textContent = "セッションを読み込み中…";

  try {
    const response = await fetch("./infra-sessions.json");
    if (!response.ok) throw new Error(`セッション取得失敗：HTTP ${response.status}`);
    const {source, categories, sessions} = await response.json();
    for (const {id, label} of categories) {
      const option = element("option", label);
      option.value = id;
      category.append(option);
    }
    const {checked, timeSlots, uniqueSessions} = source;
    const count = value => value.toLocaleString("ja-JP");
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
    const link = element("a", "公式カタログ");
    link.href = "https://ignite.microsoft.com/en-US/sessions";
    status.replaceChildren("一覧を読み込めませんでした。", link, "をご利用ください。");
  }
}

if (typeof document !== "undefined") loadCatalog();
