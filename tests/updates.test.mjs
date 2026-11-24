import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {filterAnnouncements} from "../docs/updates.js";

const readJSON = async name => JSON.parse(await readFile(new URL(`../docs/${name}`, import.meta.url), "utf8"));
const editorial = await readJSON("updates-editorial.json");
const sources = await readJSON("updates-sources.json");

test("each Book of News announcement has a source and individually labeled items", () => {
  assert.equal(Object.keys(editorial).length, 59);
  assert.deepEqual(Object.keys(editorial).sort(), Object.keys(sources).sort());
  const statuses = new Set(["GA", "提供中", "プレビュー", "限定プレビュー", "パイロット", "Frontier", "今後", "未確認", "要確認"]);
  const anchors = new Set();
  for (const [number, entry] of Object.entries(editorial)) {
    const source = sources[number];
    assert.ok(entry.title && entry.items.length);
    assert.ok(source.topic && /^[a-z0-9-]+$/.test(source.anchor));
    assert.ok(!anchors.has(source.anchor));
    anchors.add(source.anchor);
    assert.ok(source.links.length);
    for (const link of source.links) {
      const url = new URL(link);
      assert.equal(url.protocol, "https:");
      assert.ok(!url.hostname.endsWith(".sharepoint.com"));
    }
    for (const [status, description] of entry.items) {
      assert.ok(statuses.has(status), `${number}: ${status}`);
      assert.ok(description.trim());
    }
  }
});

test("filters combine category, availability and all search terms at feature level", () => {
  const found = filterAnnouncements(editorial, sources, {
    topic: "Azure", status: "プレビュー", query: "AKS Sandbox"
  });
  assert.deepEqual(found.map(item => item.number), ["1.2.2"]);
  assert.equal(found[0].items.length, 1);
  assert.match(found[0].items[0][1], /Agent Sandbox/);
  assert.deepEqual(filterAnnouncements(editorial, sources, {query: "not-an-announcement"}), []);
});

test("conflicting availability is documented without conflating Workspaces and the AKS extension", () => {
  const workspace = filterAnnouncements(editorial, sources, {query: "Workspaces", status: "GA"});
  const extension = filterAnnouncements(editorial, sources, {query: "AKS拡張", status: "プレビュー"});
  assert.deepEqual(workspace.map(item => item.number), ["1.1.1"]);
  assert.deepEqual(extension.map(item => item.number), ["1.1.1"]);
  assert.match(extension[0].items[0][1], /Book of NewsはGA/);
  assert.ok(sources["1.1.1"].links.some(link => link.endsWith("chaos-studio-aks-extension-overview")));
});

test("reviewed availability keeps separately sourced preview and unresolved states", () => {
  const cli = filterAnnouncements(editorial, sources, {query: "CLI", topic: "Microsoft Copilot", status: "プレビュー"});
  assert.ok(cli.some(item => item.number === "4.1.3"));
  const perception = filterAnnouncements(editorial, sources, {query: "Perception", status: "要確認"});
  assert.deepEqual(perception.map(item => item.number), ["7.6.1"]);
  assert.ok(perception[0].items.some(([, text]) => text.includes("限定プレビュー")));
  const detection = filterAnnouncements(editorial, sources, {query: "Detection Authoring", status: "未確認"});
  assert.deepEqual(detection.map(item => item.number), ["7.6.1"]);
});

test("a missing announcement source fails explicitly", () => {
  assert.throws(() => filterAnnouncements({"1.0": {title: "Example", items: [["GA", "text"]]}}, {}), /Missing source/);
});
