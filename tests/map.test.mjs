import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("simplified event map links each marked venue to its details", async () => {
  const html = await readFile(new URL("../docs/map.html", import.meta.url), "utf8");
  const svg = html.match(/<svg class="campus-map"[\s\S]*?<\/svg>/)?.[0];
  assert.ok(svg, "event map is present");
  assert.match(svg, /aria-labelledby="area-map-title area-map-desc"/);
  const targets = [...svg.matchAll(/<a href="#(venue-[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(targets.sort(), ["venue-marriott", "venue-metreon", "venue-south", "venue-west"]);
  for (const target of targets) assert.ok(html.includes(`id="${target}"`), `missing target ${target}`);
  assert.match(html, /https:\/\/www\.openstreetmap\.org\/copyright/);
  assert.doesNotMatch(html, /<iframe\b/);
});
