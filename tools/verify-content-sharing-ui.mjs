// The Content screen has to tell the truth about whose lecture it is.
//
// The backend now returns can_edit and is_shared_with_me on every item, and
// refuses a write to anything the caller does not own. A screen that shows the
// same controls regardless would offer buttons that always 403 — the failure
// shape where a hard refusal is indistinguishable from a no-op.
//
// A shared item gets one action instead: take a copy. That is the whole
// privilege a share grants.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../src/api/content.ts", import.meta.url), "utf8");
const library = readFileSync(new URL("../src/components/ContentLibrary.tsx", import.meta.url), "utf8");
const strings = readFileSync(new URL("../src/i18n/strings.ts", import.meta.url), "utf8");

// --- the fields the backend actually returns ------------------------------
// Pitfall #3: read the edge function's real return shape. These two are
// computed per row by course-content-library and are the whole basis for the
// screen's decision.
assert.match(api, /can_edit\??: boolean/, "ContentItem must carry can_edit");
assert.match(api, /is_shared_with_me\??: boolean/, "ContentItem must carry is_shared_with_me");
assert.match(
  api,
  /copyContentItem/,
  "a wrapper for the copy action must exist"
);
assert.match(api, /action: "copy_content_item"/, "the copy action must be requested by name");

// --- shared items are marked, and read-only -------------------------------
assert.match(
  library,
  /is_shared_with_me/,
  "the library must distinguish a shared item from an owned one"
);
assert.match(
  library,
  /t\("content\.library\.sharedBadge"\)/,
  "a shared item must be labelled as somebody else's"
);
// The availability controls are writes. Offering them on an item the caller
// cannot write is pitfall #17's shape: a control that always throws.
assert.match(
  library,
  /const canEdit = item\.can_edit !== false/,
  "the screen must derive editability from the row, treating an absent field "
  + "as editable so an older deployed function keeps working"
);
assert.match(
  library,
  /canEdit && !wholeCourseRelease/,
  "Make available must be gated on canEdit"
);
assert.match(
  library,
  /canEdit \? \(|\{canEdit &&/,
  "the remaining write controls must be gated on canEdit too"
);

// --- copy is offered exactly where it applies -----------------------------
assert.match(
  library,
  /t\("content\.library\.copy"\)/,
  "a shared item must offer a Copy action"
);
assert.match(
  library,
  /copyContentItem\(/,
  "the Copy action must call the copy wrapper"
);

// --- bilingual, in pairs --------------------------------------------------
for (const key of [
  "content.library.sharedBadge",
  "content.library.sharedHint",
  "content.library.copy",
  "content.library.copying",
  "content.library.copied",
  "content.library.copyFailed"
]) {
  assert.match(
    strings,
    new RegExp(`"${key.replace(/\./g, "\\.")}": \\[`),
    `${key} must exist in strings.ts`
  );
}

console.log("verify-content-sharing-ui: OK");
