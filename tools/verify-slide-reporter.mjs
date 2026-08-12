// The gated-content proxy injects a slide reporter so decks authored before the
// bridge existed can still say which slide the professor is on. It must observe
// and nothing else: a shim that navigates, binds keys, or competes with the real
// engine would break the decks that already work.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "functions/content.ts"), "utf8");

assert.match(
  source,
  /new HTMLRewriter\(\)/,
  "injection must stream — a 5 MB deck must never be buffered to add one script"
);
assert.match(
  source,
  /if \(!mime\.startsWith\("text\/html"\)\) return response;/,
  "only HTML may be rewritten; PDFs and images must pass through untouched"
);
assert.match(
  source,
  /if \(document\.querySelector\('script\[data-course-deck-engine\]'\)\) return;/,
  "a deck carrying the real engine must be left alone, or both will report"
);
assert.match(
  source,
  /if \(parent === window\) return;/,
  "a deck opened outside the cockpit must not talk to itself"
);
assert.match(
  source,
  /if \(window\.__deckSlideReporter\) return;/,
  "the shim must refuse to install twice"
);

// The shim is an observer. Anything that drives the deck belongs to the engine.
for (const forbidden of [
  ["keydown", /addEventListener\('keydown'/],
  ["click navigation", /\.click\(\)/],
  ["slide mutation", /classList\.(add|remove|toggle)\(/],
  ["checkpoint messages", /checkpoint\./]
]) {
  assert.doesNotMatch(
    source,
    forbidden[1],
    `the slide reporter must not ${forbidden[0]} — it observes only`
  );
}

// Messages must satisfy the parent's exact-key validation in
// src/features/deck/protocol.ts, or the bridge drops them silently.
const readyKeys = source.match(/type: 'deck\.ready', slide: i \+ 1 \}/);
assert.ok(readyKeys, "deck.ready must carry exactly version, type and slide");
assert.match(
  source,
  /type: 'deck\.slide_changed',\s*slide: i \+ 1,\s*teaching_slide:/,
  "deck.slide_changed must carry exactly version, type, slide and teaching_slide"
);
assert.match(
  source,
  /Number\.isInteger\(teaching\) && teaching > 0 \? teaching : null/,
  "a deck with no authored teaching-slide number must report null, not NaN or 0"
);
assert.match(
  source,
  /parent\.postMessage\(\{[\s\S]{0,400}?\}, location\.origin\)/,
  "deck messages must target this origin only"
);

// The protocol's own validator must accept what the shim sends. Rebuild the two
// payload shapes here and run them through the real checker.
Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: { origin: "https://course.example.test" }
});
const { isDeckMessage } = await import("../src/features/deck/protocol.ts");
assert.equal(
  isDeckMessage(
    { version: 1, type: "deck.ready", slide: 22 },
    "https://course.example.test"
  ),
  true,
  "the shim's deck.ready must pass the parent bridge's validation"
);
for (const teaching of [null, 19]) {
  assert.equal(
    isDeckMessage(
      { version: 1, type: "deck.slide_changed", slide: 22, teaching_slide: teaching },
      "https://course.example.test"
    ),
    true,
    `the shim's deck.slide_changed must validate with teaching_slide ${teaching}`
  );
}

console.log("verify-slide-reporter: OK");
