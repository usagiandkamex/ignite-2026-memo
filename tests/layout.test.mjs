import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {minutes, overlaps, conflictPairs, layoutDay, transferWarnings} from "../docs/layout.js";

const session = (id, start, end, extra = {}) => ({id, day: 17, start, end, place: "Moscone West | Room 1", ...extra});

test("overlaps exclude touching boundaries and different days", () => {
  const a = session("a", "10:00", "10:45");
  assert.equal(overlaps(a, session("b", "10:45", "11:30")), false);
  assert.equal(overlaps(a, session("b", "10:40", "11:30")), true);
  assert.equal(overlaps(a, session("b", "10:00", "10:45", {day: 18})), false);
});

test("nested and chained intervals use reusable lanes without colliding", () => {
  const items = [session("a", "10:00", "11:00"), session("b", "10:10", "10:30"),
    session("c", "10:20", "10:45"), session("d", "10:45", "11:15"), session("e", "11:15", "12:00")];
  const placed = layoutDay(items);
  assert.equal(placed.find(item => item.id === "a").lanes, 3);
  assert.equal(placed.find(item => item.id === "e").lanes, 1);
  for (const [a, b] of conflictPairs(placed)) assert.notEqual(a.lane, b.lane);
  assert.equal(layoutDay([]).length, 0);
});

test("published participant draft matches the checked schedule and shows its conflicts", async () => {
  const items = JSON.parse(await readFile(new URL("../docs/sessions.json", import.meta.url), "utf8"));
  assert.equal(items.length, 55);
  for (const item of items) {
    assert.ok(item.title && item.format && item.checked && item.note);
    assert.match(item.url, /^https:\/\/ignite\.microsoft\.com\/en-US\/sessions\/[\w-]+$/);
    assert.ok(minutes(item.start) < minutes(item.end));
  }
  const selected = items.filter(item => item.priority);
  assert.deepEqual(selected.map(item => item.code).sort(), [
    "BRK314", "BRK409", "BRK412", "BRK415", "BRK417", "BRK421", "BRK427",
    "BRK429", "BRK433", "BRK435", "BRK437", "BRK445", "BRK540",
    "INV640", "INV641", "INV642", "INV643", "KEY01", "KEY02", "LTG1283",
    "LTG1465", "THR895", "THR896", "THRSP1109"
  ].sort());
  const pairs = conflictPairs(selected).map(pair => pair.map(item => item.code).sort().join("/")).sort();
  assert.deepEqual(pairs, ["BRK412/KEY02", "BRK415/INV641",
    "BRK421/KEY02", "BRK433/INV640", "BRK435/INV643", "BRK437/INV642",
    "INV642/LTG1283"].sort());
  const candidates = items.filter(item => !item.priority && item.code !== "LAB725");
  assert.equal(candidates.filter(item => item.availability === "add").length, 18);
  assert.equal(candidates.filter(item => item.availability === "standby").length, 12);
  assert.deepEqual(items.filter(item => item.mustAttend).map(item => item.code).sort(), ["BRK433", "THR895"]);
  assert.ok(items.filter(item => item.mustAttend).every(item => item.priority && item.note.includes("必ず参加")));
  for (const day of [17, 18, 19, 20]) {
    const placed = layoutDay(items.filter(item => item.day === day));
    for (const [a, b] of conflictPairs(placed)) assert.notEqual(a.lane, b.lane);
    assert.ok(placed.every(item => item.lane < item.lanes));
  }
});

test("short cross-building transfers warn, while overlaps and 20 minute gaps do not", () => {
  const a = session("a", "10:00", "10:45");
  assert.equal(transferWarnings([a, session("b", "10:55", "11:30", {place: "Marriott Marquis | B2"})])[0].gap, 10);
  assert.equal(transferWarnings([a, session("b", "11:05", "11:30", {place: "Marriott Marquis | B2"})]).length, 0);
  assert.equal(transferWarnings([a, session("b", "10:40", "11:30", {place: "Marriott Marquis | B2"})]).length, 0);
});
