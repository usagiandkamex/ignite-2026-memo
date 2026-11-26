import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {combineAnnouncements, filterAnnouncements} from "../docs/updates.js";

const readJSON = async name => JSON.parse(await readFile(new URL(`../docs/${name}`, import.meta.url), "utf8"));
const editorial = await readJSON("updates-editorial.json");
const sources = await readJSON("updates-sources.json");
const additional = await readJSON("updates-additional.json");
const announcements = combineAnnouncements(editorial, sources, additional);

test("overview and brief examples point to announcements with the stated availability", async () => {
  const page = await readFile(new URL("../docs/updates.html", import.meta.url), "utf8");
  const examples = [...page.matchAll(/<div class="(updates-example|brief-update-heading)">([\s\S]+?)<\/div>/g)];
  assert.ok(examples.some(([, group]) => group === "updates-example"), "missing visual overview examples");
  assert.ok(examples.some(([, group]) => group === "brief-update-heading"), "missing brief examples");
  for (const [, , example] of examples) {
    const status = example.match(/data-status="([^"]+)"/)?.[1];
    const id = example.match(/href="#([^"]+)"/)?.[1];
    const entry = announcements.find(item => item.id === id);
    assert.ok(entry?.items.some(([itemStatus]) => itemStatus === status), `${id}: ${status}`);
  }
});

test("the 59 Book of News announcements retain distinct direct links and matched editorial records", () => {
  assert.equal(Object.keys(editorial).length, 59);
  assert.deepEqual(Object.keys(editorial).sort(), Object.keys(sources).sort());
  const anchors = new Set();
  for (const {id, number, links} of filterAnnouncements(announcements, {source: "book"})) {
    assert.equal(id, `news-${number.replaceAll(".", "-")}`);
    const url = new URL(links[0][1]);
    assert.equal(url.host, "news.microsoft.com");
    assert.match(url.hash, /^#[a-z0-9-]+$/);
    assert.ok(!anchors.has(url.hash), `${number}: duplicate Book of News anchor`);
    anchors.add(url.hash);
  }
});

test("both source groups have official references and a change and benefit for each feature", () => {
  const statuses = new Set(["GA", "提供中", "プレビュー", "限定プレビュー", "パイロット", "Frontier", "今後", "未確認", "要確認"]);
  const topics = new Set(Object.values(sources).map(source => source.topic));
  assert.ok(Object.hasOwn(additional, "mai-licensed-weights"));
  for (const {id, title, source, topic, links, items} of announcements) {
    assert.match(id, /^(news|additional)-[a-z0-9-]+$/);
    assert.ok(title.trim() && items.length && topics.has(topic), id);
    assert.ok(links.length >= (source === "book" ? 2 : 1), id);
    for (const [, link] of links) {
      const url = new URL(link);
      assert.equal(url.protocol, "https:");
      assert.ok(!url.hostname.endsWith(".sharepoint.com"));
    }
    for (const item of items) {
      assert.equal(item.length, 3, id);
      const [status, change, benefit] = item;
      assert.ok(statuses.has(status), `${id}: ${status}`);
      assert.ok(change.trim() && benefit.trim(), id);
      assert.notEqual(change, benefit, id);
    }
  }
});

test("filters combine category, availability and all search terms at feature level", () => {
  const found = filterAnnouncements(announcements, {
    source: "book", topic: "Azure", status: "プレビュー", query: "ＡＫＳ Sandbox"
  });
  assert.deepEqual(found.map(item => item.number), ["1.2.2"]);
  assert.equal(found[0].items.length, 1);
  assert.match(found[0].items[0][1], /Agent Sandbox/);
  assert.deepEqual(filterAnnouncements(announcements, {query: "not-an-announcement"}), []);
});

test("search includes benefits and returns supplements independently of Book of News", () => {
  const selection = {topic: "Microsoft Foundry", status: "今後", query: "MAI バージョン更新"};
  const found = filterAnnouncements(announcements, {...selection, source: "additional"});
  assert.deepEqual(found.map(item => item.id), ["additional-mai-licensed-weights"]);
  const [[, change, benefit]] = found[0].items;
  assert.doesNotMatch(change, /バージョン更新/);
  assert.match(benefit, /バージョン更新/);
  assert.deepEqual(filterAnnouncements(announcements, {...selection, source: "book"}), []);

  const aks = {topic: "Azure", query: "AKS", status: "プレビュー"};
  assert.ok(filterAnnouncements(announcements, {...aks, source: "book"}).some(item => item.id === "news-1-2-2"));
  assert.ok(filterAnnouncements(announcements, {...aks, source: "additional"}).some(item => item.id === "additional-aks-compute"));
});

test("conflicting availability is documented without conflating Workspaces and the AKS extension", () => {
  const workspace = filterAnnouncements(announcements, {query: "Workspaces", status: "GA"});
  const extension = filterAnnouncements(announcements, {query: "AKS拡張", status: "プレビュー"});
  assert.deepEqual(workspace.map(item => item.number), ["1.1.1"]);
  assert.deepEqual(extension.map(item => item.number), ["1.1.1"]);
  assert.match(extension[0].items[0][1], /Book of NewsはGA/);
  assert.ok(sources["1.1.1"].links.some(link => link.endsWith("chaos-studio-aks-extension-overview")));
});

test("reviewed availability keeps separately sourced preview and unresolved states", () => {
  const cli = filterAnnouncements(announcements, {query: "CLI", topic: "Microsoft Copilot", status: "プレビュー"});
  assert.ok(cli.some(item => item.number === "4.1.3"));
  const perception = filterAnnouncements(announcements, {query: "Perception", status: "要確認"});
  assert.deepEqual(perception.map(item => item.number), ["7.6.1"]);
  assert.ok(perception[0].items.some(([, text]) => text.includes("限定プレビュー")));
  const detection = filterAnnouncements(announcements, {query: "Detection Authoring", status: "要確認"});
  assert.deepEqual(detection.map(item => item.number), ["7.6.1"]);
  const responses = filterAnnouncements(announcements, {query: "Responses API", status: "プレビュー"});
  assert.deepEqual(responses.map(item => item.number), ["2.2.2"]);
});

test("a missing announcement source fails explicitly", () => {
  assert.throws(() => combineAnnouncements({"1.0": {title: "Example", items: [["GA", "change", "benefit"]]}}, {}, {}), /Missing source for 1.0/);
});
