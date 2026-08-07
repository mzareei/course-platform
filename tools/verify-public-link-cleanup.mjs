// The Content screen's "public links" control.
//
// This is the professor-facing half of D4. The backend does the work one item
// per call; this screen previews, confirms, and then walks the list, showing
// which item it is on.
//
// Three properties matter more than the layout:
//   1. Preview first. A write the professor cannot see coming is not a feature.
//   2. In-app confirmation, never window.confirm — pitfall #36.
//   3. Nothing to clean means nothing on screen. A permanent maintenance card
//      for a one-time job is clutter the day after it is used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../src/api/contentCleanup.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/components/PublicLinkCleanup.tsx", import.meta.url), "utf8");
const library = readFileSync(new URL("../src/components/ContentLibrary.tsx", import.meta.url), "utf8");
const strings = readFileSync(new URL("../src/i18n/strings.ts", import.meta.url), "utf8");

// --- the API wrapper matches the function's actual contract ----------------
// Pitfall #3: read the edge function's real return shape, not a hopeful
// interface. course-content-cleanup returns { items: [...] } from preview and
// { item, version, references_removed, already_clean } from clean.
assert.match(api, /"course-content-cleanup"/, "the wrapper must call the deployed function name");
assert.match(api, /action: "preview"/, "preview must be requested by name");
assert.match(api, /action: "clean"/, "clean must be requested by name");
assert.match(api, /public_references/, "the preview row's count field must be carried through");
assert.match(api, /would_change/, "the preview row's would_change flag must be carried through");
assert.match(api, /references_removed/, "the clean result's count field must be carried through");
assert.match(api, /already_clean/, "the clean result's already_clean flag must be carried through");

// --- one item per call, walked from the client ----------------------------
// A single request that sweeps 23 decks is one timeout away from a partial
// run with no record of where it stopped.
assert.match(
  api,
  /content_item_id/,
  "clean must target one named content item"
);
assert.match(
  ui,
  /for \(const [\s\S]{0,400}?await clean/,
  "the screen must walk the items one at a time rather than firing one bulk call"
);

// --- preview before writing -----------------------------------------------
assert.match(ui, /previewPublicLinks/, "the screen must preview before offering to clean");
const previewFirst = ui.indexOf("previewPublicLinks") < ui.indexOf("cleanPublicLinks");
assert.ok(previewFirst, "preview must be wired before the clean action");

// --- in-app confirmation, not a native dialog -----------------------------
assert.doesNotMatch(ui, /\bconfirm\(/, "must not use window.confirm — pitfall #36");
assert.match(
  ui,
  /confirming|setConfirming/,
  "a two-step in-app confirmation must gate the write"
);

// --- silence when there is nothing to do ----------------------------------
assert.match(
  ui,
  /would_change[\s\S]{0,300}?return null|return null[\s\S]{0,300}?would_change/,
  "the card must render nothing when no item would change"
);

// --- it has to be reachable from a real screen ----------------------------
// Pitfall #1: a control nobody can navigate to is not a feature.
assert.match(
  library,
  /PublicLinkCleanup/,
  "the control must be mounted in the content library, not merely defined"
);

// --- bilingual, in pairs --------------------------------------------------
for (const key of [
  "cleanup.title",
  "cleanup.body",
  "cleanup.found",
  "cleanup.allClean",
  "cleanup.action",
  "cleanup.confirm",
  "cleanup.working",
  "cleanup.done",
  "cleanup.failed"
]) {
  assert.match(
    strings,
    new RegExp(`"${key.replace(".", "\\.")}": \\[`),
    `${key} must exist in strings.ts`
  );
}

console.log("verify-public-link-cleanup: OK");
