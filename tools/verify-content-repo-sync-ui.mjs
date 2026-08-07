// Static contract verifier for the instructor-facing repository sync control.
// The deployed function remains the authority for authentication and writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = fs.readFileSync(path.join(root, "src/api/content.ts"), "utf8");
const view = fs.readFileSync(path.join(root, "src/components/ContentLibrary.tsx"), "utf8");
const strings = fs.readFileSync(path.join(root, "src/i18n/strings.ts"), "utf8");

assert.match(api, /course-content-sync/, "the API must call the sync Edge Function");
assert.match(api, /syncContentFromRepository/, "the API must expose repository sync");
assert.match(api, /RepositorySyncResult/, "the sync response must be typed");
assert.match(view, /syncContentFromRepository/, "the Content screen must call repository sync");
assert.match(view, /source_kind\s*===\s*["']storage_object["']/, "sync must be limited to storage-backed items");
assert.match(view, /canEdit/, "sync must respect content ownership controls");
assert.match(view, /content\.library\.syncFromRepository/, "the screen must offer the sync action");
assert.match(view, /content\.library\.syncConfirm/, "sync must require instructor confirmation");
assert.match(view, /content\.library\.syncUnchanged/, "the screen must report a no-op sync");
assert.match(view, /content\.library\.syncing/, "the screen must show sync progress");
for (const key of [
  "content.library.syncFromRepository",
  "content.library.syncing",
  "content.library.syncConfirm",
  "content.library.synced",
  "content.library.syncUnchanged",
  "content.library.syncFailed"
]) {
  assert.match(strings, new RegExp(`"${key.replaceAll(".", "\\.")}"`), `${key} must be localized`);
}

console.log("verify-content-repo-sync-ui: OK");
