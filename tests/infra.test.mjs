import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {filterSessions} from "../docs/infra.js";

const read = file => readFile(new URL(`../docs/${file}`, import.meta.url), "utf8");
const {source, categories, sessions} = JSON.parse(await read("infra-sessions.json"));
const planner = JSON.parse(await read("sessions.json"));

test("catalog entries use unique official session identities without planner state", () => {
  const categoryIds = new Set(categories.map(item => item.id));
  assert.ok(sessions.length > 0 && sessions.length <= source.uniqueSessions);
  assert.ok(source.uniqueSessions < source.timeSlots);
  assert.equal(new Set(sessions.map(item => item.id.split("-")[0])).size, sessions.length);
  assert.equal(new Set(sessions.map(item => item.code)).size, sessions.length);
  for (const {id, code, title, format, category, tags, summary, youtubeUrl, ...other} of sessions) {
    assert.match(id, /^[A-Za-z0-9]+-[A-Za-z0-9]+$/);
    assert.match(code, /^[A-Z]+\d+D?$/);
    assert.ok(categoryIds.has(category) && title && format && tags.length && summary);
    assert.deepEqual(other, {});
    if (youtubeUrl) {
      assert.ok(planner.some(item => item.code === code && item.id.split("-")[0] === id.split("-")[0] && item.youtubeUrl === youtubeUrl));
    }
  }
});

test("the catalog includes application hosting, labs and sessions outside the planner", () => {
  const codes = new Set(sessions.map(item => item.code));
  for (const code of ["BRK423", "BRK449", "LAB722", "LAB722D", "LAB723", "LTG1294"]) {
    assert.ok(codes.has(code), `Missing ${code}`);
  }
  const plannedCodes = new Set(planner.map(item => item.code));
  assert.ok(!plannedCodes.has("LAB722"), "Attendance-independent lab should not require a planner entry");
  assert.ok(!codes.has("KEY01"), "A general keynote is not an infra session just because it is in the planner");
});

test("filters by normalized product, code and Japanese text, optionally within a category", () => {
  const findCodes = (category, query) => filterSessions(sessions, category, query).map(item => item.code);
  assert.deepEqual(findCodes("app", " Ａｚｕｒｅ App SERVICE "), ["BRK423", "BRK449"]);
  assert.ok(findCodes("", "azure kubernetes service").includes("LAB723"));
  assert.deepEqual(findCodes("", "ＢＲＫ４２３、実行"), ["BRK423"]);
  assert.deepEqual(findCodes("network", "BRK423"), []);
  assert.deepEqual(findCodes("", "not-a-real-session"), []);
});

test("planner and map link to the independent catalog", async () => {
  const [index, map, infra] = await Promise.all(["index.html", "map.html", "infra.html"].map(read));
  assert.match(index, /href="\.\/infra\.html"/);
  assert.match(map, /href="\.\/infra\.html"/);
  assert.match(infra, /href="\.\/infra\.html" aria-current="page"/);
});
