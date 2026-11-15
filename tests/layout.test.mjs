import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {minutes, overlaps, conflictPairs, relevantConflictPairs, layoutDay, dayColumnMinWidth, transferWarnings} from "../docs/layout.js";

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

test("conflict notes retain planned conflicts and include visible candidates", () => {
  const a = session("a", "10:00", "11:00", {priority: true});
  const b = session("b", "10:00", "11:00", {priority: true});
  const c = session("c", "10:15", "10:30", {priority: false});
  const d = session("d", "10:30", "10:45", {priority: false});
  const pairs = relevantConflictPairs([a, b, c, d], [c]).map(pair => pair.map(item => item.id).join(""));
  assert.deepEqual(pairs, ["ab", "ac", "bc"]);
  assert.deepEqual(relevantConflictPairs([a, b], []).map(pair => pair.map(item => item.id).join("")), ["ab"]);
});

test("dense days reserve readable width for each overlapping lane", () => {
  const dense = Array.from({length: 6}, (_, i) => session(String(i), "15:45", "16:10"));
  assert.equal(dayColumnMinWidth(layoutDay(dense), false), 600);
  assert.equal(dayColumnMinWidth(layoutDay(dense), true), 600);
  assert.equal(dayColumnMinWidth(layoutDay(dense.slice(0, 1)), true), 260);
});

test("published participant draft matches the checked schedule and shows its conflicts", async () => {
  const items = JSON.parse(await readFile(new URL("../docs/sessions.json", import.meta.url), "utf8"));
  assert.equal(items.length, 74);
  for (const item of items) {
    assert.ok(item.title && item.format && item.checked && item.note);
    assert.match(item.url, /^https:\/\/ignite\.microsoft\.com\/en-US\/sessions\/[\w-]+$/);
    assert.ok(minutes(item.start) < minutes(item.end));
  }
  const selected = items.filter(item => item.priority);
  assert.deepEqual(selected.map(item => item.code).sort(), [
    "BRK314", "BRK409", "BRK412", "BRK415", "BRK417", "BRK421", "BRK427",
    "BRK429", "BRK433", "BRK437", "BRK445", "BRK540",
    "INV640", "INV642", "INV643", "KEY01", "LTG1283",
    "LTG1465", "THR895", "THR896", "THR967", "THRSP1109", "THRSP1142"
  ].sort());
  const pairs = conflictPairs(selected).map(pair => pair.map(item => item.code).sort().join("/")).sort();
  assert.deepEqual(pairs, ["BRK433/INV640", "BRK437/INV642", "INV642/LTG1283"].sort());
  const candidates = items.filter(item => !item.priority);
  assert.equal(candidates.filter(item => item.availability === "add").length, 39);
  assert.equal(candidates.filter(item => item.availability === "standby").length, 12);
  const researched = new Set([
    "THR979", "THR901", "THRSP1088", "THR1025", "THRSP1055", "THR967",
    "THRSP1101", "THRSP1105", "THR1027", "THR1029", "THRSP1115", "THR897",
    "THRSP1122", "THRSP1128", "THRSP1133", "THRSP1142", "THR894", "THR898",
    "THR966", "THR902"
  ]);
  const added = items.filter(item => researched.has(item.code));
  assert.equal(added.length, 20);
  assert.deepEqual(added.filter(item => item.priority).map(item => item.code).sort(), ["THR967", "THRSP1142"]);
  assert.ok(added.filter(item => !item.priority).every(item => item.availability === "add"));
  assert.deepEqual(items.filter(item => item.mustAttend).map(item => item.code).sort(), ["BRK433", "THR895"]);
  assert.ok(items.filter(item => item.mustAttend).every(item => item.priority && item.note.includes("必ず参加")));
  for (const day of [17, 18, 19, 20]) {
    const placed = layoutDay(items.filter(item => item.day === day));
    for (const [a, b] of conflictPairs(placed)) assert.notEqual(a.lane, b.lane);
    assert.ok(placed.every(item => item.lane < item.lanes));
  }
});

test("short cross-building and immediate intra-building transfers warn", () => {
  const a = session("a", "10:00", "10:45");
  assert.equal(transferWarnings([a, session("b", "10:55", "11:30", {place: "Marriott Marquis | B2"})])[0].gap, 10);
  assert.equal(transferWarnings([a, session("b", "11:05", "11:30", {place: "Marriott Marquis | B2"})]).length, 0);
  assert.equal(transferWarnings([a, session("b", "10:40", "11:30", {place: "Marriott Marquis | B2"})]).length, 0);
  const nextFloor = session("b", "10:45", "11:30", {place: "Moscone West | Level 1"});
  assert.equal(transferWarnings([a, nextFloor])[0].sameBuilding, true);
  assert.equal(transferWarnings([a, session("b", "10:45", "11:30")]).length, 0);
});
