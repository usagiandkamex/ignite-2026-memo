import {minutes, overlaps, relevantConflictPairs, layoutDay, dayColumnMinWidth, sessionGaps, transferWarnings} from "./layout.js";

const calendar = document.getElementById("calendar");
const alternatives = document.getElementById("alternatives");
const track = document.getElementById("track");
const week = document.getElementById("week");
const dialog = document.getElementById("detail");
const calendarScroll = document.querySelector(".calendar-scroll");
const dayNames = {17: "火", 18: "水", 19: "木", 20: "金"};
let day = 17;
let sessions = [];
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const label = item => `${item.code} ${item.start}–${item.end}`;
const isSponsored = item => /^(?:BRK|LTG|THR)SP/.test(item.code);
const isGeneral = item => item.priority && (item.format === "Keynote" || item.format === "Innovation Session");
const category = item => !item.priority ? "未追加候補（11/16時点）" : isGeneral(item) ? "全体セッション・予定表に表示（11/16時点）" : "予定表に表示（11/16時点）";
const availability = item => item.availability === "standby" ? "満席・待機のみ" :
  item.availability === "add" ? "予定に追加の表示あり（座席確保ではありません）" :
  item.availability === "unknown" ? "空き状況未確認" : "";
const selectedDays = () => week.getAttribute("aria-pressed") === "true" ? [17, 18, 19, 20] : [day];
const comparisonPool = () => sessions.filter(item => alternatives.checked || item.priority);
function openDetail(item) {
  document.getElementById("detail-code").textContent = `${item.code} / ${category(item)}${item.mustAttend ? " / 必ず参加" : ""}`;
  document.getElementById("detail-title").textContent = item.title;
  document.getElementById("detail-time").textContent = `11/${item.day}（${dayNames[item.day]}）${item.start}–${item.end} PST`;
  const jst = value => new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(new Date(`2026-11-${item.day}T${value}:00-08:00`));
  document.getElementById("detail-jst").textContent = `日本時間：${jst(item.start)} 〜 ${jst(item.end)}`;
  document.getElementById("detail-place").textContent = item.place;
  document.getElementById("detail-track").textContent = `${item.track} / ${item.format}${isSponsored(item) ? " / スポンサー枠" : ""}`;
  const conflicts = comparisonPool().filter(other => overlaps(item, other));
  document.getElementById("detail-conflicts").textContent = conflicts.length
    ? `時間重複：${conflicts.map(label).join("、")}（分野フィルターで非表示の枠を含む）`
    : "現在の比較範囲に時間重複はありません。会場間の移動は別途確認してください。";
  const checkedAt = item.availabilityChecked ? new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(new Date(item.availabilityChecked)) + "（日本時間）確認。" : "確認時刻は記録されていません。";
  document.getElementById("detail-availability").textContent = item.availability === "unknown"
    ? "空き状況：未確認。公式ページで確認してください。"
    : availability(item) ? `公式表示：${availability(item)}。${checkedAt}最新状況は公式ページへ。` : "";
  document.getElementById("detail-reason").textContent = item.note;
  document.getElementById("detail-link").href = item.url;
  dialog.showModal();
}
function render() {
  const days = selectedDays();
  const pool = comparisonPool();
  const visible = pool.filter(item => days.includes(item.day) && (!track.value || item.track === track.value));
  const layouts = new Map(days.map(value => [value, layoutDay(visible.filter(item => item.day === value))]));
  const minimumWidths = days.map(value => dayColumnMinWidth(layouts.get(value), days.length === 4));
  const firstMinute = visible.length ? Math.floor(Math.min(...visible.map(item => minutes(item.start))) / 60) * 60 : 9 * 60;
  const lastMinute = visible.length ? Math.ceil(Math.max(...visible.map(item => minutes(item.end))) / 60) * 60 : 18 * 60;
  calendar.replaceChildren();
  calendar.classList.toggle("week", days.length === 4);
  calendar.style.gridTemplateColumns = `49px ${minimumWidths.map(width => `minmax(${width}px, 1fr)`).join(" ")}`;
  calendar.style.minWidth = `${49 + minimumWidths.reduce((sum, width) => sum + width, 0)}px`;
  calendar.append(element("div", "corner", "PST"));
  for (const value of days) calendar.append(element("div", "day-heading", `11/${value}（${dayNames[value]}）`));
  const axis = element("div", "time-axis");
  axis.style.height = `calc(${lastMinute - firstMinute} * var(--scale))`;
  for (let time = firstMinute; time < lastMinute; time += 30) {
    const tick = element("div", "time-tick", `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`);
    tick.style.top = `calc(${time - firstMinute} * var(--scale))`;
    axis.append(tick);
  }
  calendar.append(axis);
  for (const value of days) {
    const column = element("div", "day-column");
    column.setAttribute("aria-label", `11月${value}日`);
    column.style.height = axis.style.height;
    const items = layouts.get(value);
    if (!items.length) column.append(element("p", "empty", "この条件のセッションはありません。"));
    for (const item of items) {
      const duration = minutes(item.end) - minutes(item.start);
      const conflicts = pool.filter(other => overlaps(item, other));
      const card = element("button", `event${!item.priority ? " alternative" : isGeneral(item) ? " general" : ""}${item.mustAttend ? " must" : ""}${item.availability === "standby" ? " standby" : ""}${conflicts.length ? " conflict" : ""}${duration <= 15 ? " short" : duration <= 25 ? " medium" : ""}`);
      card.type = "button";
      card.dataset.id = item.id;
      card.style.top = `calc(${minutes(item.start) - firstMinute} * var(--scale))`;
      card.style.height = `calc(${duration} * var(--scale) - 3px)`;
      card.style.left = `calc(${item.lane * 100 / item.lanes}% + 2px)`;
      card.style.width = `calc(${100 / item.lanes}% - 4px)`;
      card.setAttribute("aria-label", `${label(item)} ${item.title} ${category(item)}${item.mustAttend ? "、必ず参加" : ""}${isSponsored(item) ? "、スポンサー枠" : ""}${availability(item) ? `、${availability(item)}` : ""}${conflicts.length ? "、時間重複あり" : ""}。詳細を開く`);
      card.append(element("span", "event-time", `${item.start}–${item.end}`));
      const tags = [];
      if (isSponsored(item)) tags.push("協賛");
      if (item.mustAttend) tags.push("必ず参加");
      else if (isGeneral(item)) tags.push("全体");
      else if (item.availability === "standby") tags.push("待機");
      else if (item.availability === "unknown") tags.push("空き未確認");
      else if (!item.priority && !isSponsored(item)) tags.push("比較");
      const suffix = tags.map(tag => ` · ${tag}`).join("");
      card.append(element("span", "event-code", `${conflicts.length ? "⚠ " : ""}${item.code}${suffix}`));
      card.append(element("span", "event-title", item.title));
      card.append(element("span", "event-venue", item.place));
      card.addEventListener("click", () => openDetail(item));
      column.append(card);
    }
    calendar.append(column);
  }
  const selected = sessions.filter(item => item.priority && days.includes(item.day));
  const pairs = relevantConflictPairs(pool.filter(item => days.includes(item.day)), visible);
  document.getElementById("summary").textContent = `表示 ${visible.length}件`;
  const warnings = document.getElementById("warnings");
  warnings.replaceChildren();
  for (const [a, b] of pairs) {
    const description = item => `${item.start}–${item.end} ${item.code}（${item.priority ? "予定" : "候補"}）`;
    warnings.append(element("div", "warning", `11/${a.day} · ${description(a)} と ${description(b)} が重複。両方を通して聴講することはできません。`));
  }
  for (const {from, to, gap, sameBuilding} of transferWarnings(selected)) {
    const location = sameBuilding ? "同じ建物内で場所が異なり" : "会場が異なり";
    warnings.append(element("div", "warning travel", `11/${from.day} · ${from.code} → ${to.code}：${location}、間隔は${gap}分です。移動可能か要確認（所要時間の保証ではありません）。`));
  }
  if (alternatives.checked) warnings.append(element("p", "notes-help", "重複は分野フィルターで非表示の枠も含めて判定しています。候補の表示は予定の追加ではありません。"));
  if (!warnings.childElementCount) warnings.append(element("p", "notes-help", "表示中の範囲に時間重複や短い会場間移動はありません。"));
  const gapList = document.getElementById("session-gaps");
  gapList.replaceChildren();
  const gaps = sessionGaps(selected);
  for (const gap of gaps) gapList.append(element("li", "", `11/${gap.day}（${dayNames[gap.day]}） ${gap.start}–${gap.end} · ${gap.minutes}分`));
  if (!gaps.length) gapList.append(element("li", "", "予定セッション間に15分以上の間隔はありません。"));
}
document.querySelectorAll("[data-day]").forEach(button => button.addEventListener("click", () => {
  day = Number(button.dataset.day);
  week.setAttribute("aria-pressed", "false");
  document.querySelectorAll("[data-day]").forEach(node => node.setAttribute("aria-pressed", String(node === button)));
  render();
  calendarScroll.scrollLeft = 0;
}));
alternatives.addEventListener("change", render);
track.addEventListener("change", render);
week.addEventListener("click", () => {
  const showWeek = week.getAttribute("aria-pressed") !== "true";
  week.setAttribute("aria-pressed", String(showWeek));
  document.querySelectorAll("[data-day]").forEach(node => node.setAttribute("aria-pressed", String(!showWeek && Number(node.dataset.day) === day)));
  render();
  calendarScroll.scrollLeft = 0;
});
document.getElementById("close-detail").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) {
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
} });
try {
  const response = await fetch("./sessions.json");
  if (!response.ok) throw new Error(`セッション取得失敗：HTTP ${response.status}`);
  sessions = await response.json();
  document.getElementById("session-count").textContent = `${sessions.length} PUBLIC SESSIONS`;
  for (const value of [...new Set(sessions.map(item => item.track))].sort()) {
    const option = element("option", "", value);
    option.value = value;
    track.append(option);
  }
  render();
} catch (error) {
  console.error(error);
  const notice = document.getElementById("load-error");
  notice.hidden = false;
  notice.textContent = "カレンダーを読み込めませんでした。通信状況を確認して再読み込みするか、公式カタログをご利用ください。";
}
