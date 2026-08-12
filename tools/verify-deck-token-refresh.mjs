// The deck's token is refreshed on a timer so a genuine reload still works.
// Feeding that fresh token to the iframe reloads the document, and the browser
// exits fullscreen the instant the fullscreen element is destroyed — which is
// why the professor was thrown out of fullscreen every nine minutes of a
// two-hour lecture. Minting must continue; applying must not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  instructorDeckUrl,
  shouldApplyDeckSource
} from "../src/features/deck/instructorDeckState.ts";

// --------------------------------------------------------- when to swap src
assert.equal(
  shouldApplyDeckSource({ hasSource: false, inFullscreen: false }),
  true,
  "the very first load has nothing on screen and must always apply"
);
assert.equal(
  shouldApplyDeckSource({ hasSource: false, inFullscreen: true }),
  true,
  "an empty frame must load even in fullscreen — there is nothing to interrupt"
);
assert.equal(
  shouldApplyDeckSource({ hasSource: true, inFullscreen: true }),
  false,
  "a working deck must never be reloaded under the professor mid-lecture"
);
assert.equal(
  shouldApplyDeckSource({ hasSource: true, inFullscreen: false }),
  true,
  "outside fullscreen a held token may be applied without costing anything"
);

// ------------------------------------ the slide hash must survive a real swap
assert.equal(
  instructorDeckUrl("abc", 37),
  "/content?t=abc#37",
  "a replacement URL must carry the current slide, or a reload returns to slide 1"
);

// ------------------------------------------------------------------- wiring
const deck = readFileSync("src/features/deck/InstructorDeck.tsx", "utf8");

assert.match(
  deck,
  /pendingSource = useRef<string \| null>\(null\)/,
  "a freshly minted URL must be held, not assigned"
);
assert.match(
  deck,
  /shouldApplyDeckSource\(\{/,
  "applying a held URL must go through the shared rule"
);
assert.match(
  deck,
  /document\.fullscreenElement/,
  "the rule must be fed the real fullscreen state"
);
assert.match(
  deck,
  /addEventListener\("fullscreenchange"/,
  "leaving fullscreen must be the moment a held URL is applied"
);
assert.match(
  deck,
  /removeEventListener\("fullscreenchange"/,
  "the listener must be cleaned up, or every remount leaks another one"
);
assert.match(
  deck,
  /schedule\(expectedGeneration, access\.expires_in - 60\)/,
  "minting must still happen on the timer — a stale token breaks a genuine reload"
);

console.log("verify-deck-token-refresh: OK");
