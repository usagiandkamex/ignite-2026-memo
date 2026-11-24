import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("recording links use canonical YouTube URLs for matching Ignite sessions", async () => {
  const sessions = JSON.parse(await readFile(new URL("../docs/sessions.json", import.meta.url), "utf8"));
  const linked = sessions.filter(item => item.youtubeUrl);
  assert.ok(linked.length > 0);
  for (const item of linked) {
    assert.match(item.youtubeUrl, /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
  }
  assert.equal(sessions.find(item => item.code === "BRK433")?.youtubeUrl, "https://www.youtube.com/watch?v=DsJUyF4Ep48");
  assert.equal(sessions.find(item => item.code === "BRK283")?.youtubeUrl, "https://www.youtube.com/watch?v=Z5NssUvBICY");
});
