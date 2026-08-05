// Requirement 8: only the platform owner may create, rename, archive or
// otherwise modify a group. A regular instructor must not even see the
// controls — pitfall #17's lesson is that a control which always throws is
// worse than no control, and pitfall #15's is that the screen should ask the
// user's question, not the schema's.
//
// The server is the boundary (see the backend's verify-section-owner-only),
// but a visible button that always 403s is a broken screen either way.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sections = readFileSync(new URL("../src/components/Sections.tsx", import.meta.url), "utf8");
const strings = readFileSync(new URL("../src/i18n/strings.ts", import.meta.url), "utf8");

// The owner signal already exists and is computed from active memberships.
// Reuse it rather than re-deriving the role in this component.
assert.match(
  sections,
  /import \{[^}]*\bisOwner\b[^}]*\} from "\.\.\/state\/session"/,
  "Sections must read the existing isOwner signal from state/session"
);

// Add a group: owner only.
assert.match(
  sections,
  /isOwner\.value \? \([\s\S]{0,4000}?t\("sections\.add"\)/,
  "the Add a group card must render only when isOwner is true"
);

// Rename (SectionEditor) and retire/reactivate: owner only. Both live in the
// row's action cell, so both must sit behind the same guard.
assert.match(
  sections,
  /isOwner\.value \? \([\s\S]{0,1200}?t\("sections\.edit"\)/,
  "the Edit control must render only when isOwner is true"
);
assert.match(
  sections,
  /isOwner\.value \? \([\s\S]{0,1600}?t\("sections\.retire"\)/,
  "the Retire/Reactivate control must render only when isOwner is true"
);

// Manage members is NOT owner-only: a regular instructor manages the roster of
// the groups they teach. Guarding it would regress the section-scoped access
// that pitfall #56 established.
assert.match(
  sections,
  /t\("sections\.members"\)/,
  "Manage members must stay available to an assigned instructor"
);
const membersIndex = sections.indexOf('t("sections.members")');
const editIndex = sections.indexOf('t("sections.edit")');
assert.ok(membersIndex > -1 && editIndex > -1, "both row controls must exist");

// A non-owner needs to know why the controls are absent, in both languages.
assert.match(
  strings,
  /"sections\.ownerOnly": \[/,
  "a bilingual explanation string for non-owners must exist"
);
assert.match(
  sections,
  /t\("sections\.ownerOnly"\)/,
  "Sections must render the non-owner explanation"
);

console.log("verify-group-ownership: OK");
