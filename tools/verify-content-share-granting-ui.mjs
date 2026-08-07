// verify-content-sharing-ui.mjs covers *consuming* a share: the badge, the
// read-only gating, the Copy button. It says nothing about how a share gets
// created — because until now, nothing in the frontend could create one.
// course-content-library grew share_content_item / unshare_content_item
// (backend PR: add the missing content_shares write path); this pins the
// screen that calls them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../src/api/content.ts", import.meta.url), "utf8");
const library = readFileSync(new URL("../src/components/ContentLibrary.tsx", import.meta.url), "utf8");
const strings = readFileSync(new URL("../src/i18n/strings.ts", import.meta.url), "utf8");

// --- API wrappers exist and call the real actions ---------------------------
assert.match(api, /export function shareContentItem/, "a share wrapper must exist");
assert.match(api, /action: "share_content_item"/, "the share action must be requested by name");
assert.match(api, /export function unshareContentItem/, "an unshare wrapper must exist");
assert.match(api, /action: "unshare_content_item"/, "the unshare action must be requested by name");
assert.match(
  api,
  /shareable_sections/,
  "ContentLibrary must carry the course-wide section list the share picker needs"
);
assert.match(
  api,
  /shares\??:\s*ContentShare\[\]/,
  "ContentItem must carry the owner's current shares"
);

// --- the screen only offers sharing where it is legal -----------------------
// Sharing is an owner action on your own item, never on something merely
// shared with you (pitfall shape: a recipient re-sharing would grant access
// they were never given).
assert.match(library, /shareContentItem\(/, "the screen must call the share wrapper");
assert.match(library, /unshareContentItem\(/, "the screen must call the unshare wrapper");
assert.match(
  library,
  /canEdit && !item\.is_shared_with_me/,
  "the Share control must require canEdit and must not appear on an item shared with you"
);

// --- the picker uses the course-wide list, not the roster-filtered one ------
assert.match(
  library,
  /library\.shareable_sections/,
  "the share picker must be built from shareable_sections, not the roster-filtered sections list"
);

// --- an owner can see and revoke what they've already shared ----------------
assert.match(library, /item\.shares/, "an owned item must render its current shares");

// --- bilingual, in pairs -----------------------------------------------------
for (const key of [
  "content.library.share",
  "content.library.shareTo",
  "content.library.shareSubmit",
  "content.library.sharing",
  "content.library.shared",
  "content.library.shareFailed",
  "content.library.revoke",
  "content.library.revoking",
  "content.library.currentShares"
]) {
  assert.match(
    strings,
    new RegExp(`"${key.replace(/\./g, "\\.")}": \\[`),
    `${key} must exist in strings.ts`
  );
}

console.log("verify-content-share-granting-ui: OK");
