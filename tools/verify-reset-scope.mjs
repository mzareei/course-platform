// The reset never reaches past the group you are looking at.
//
// Written after this was found live: the Classes screen is scoped to the group
// in the top-bar switcher, but its Reset card was not. Standing in Group 501,
// "See what would be cleared" counted every student in every group, and the
// confirm button would have erased 402 and 502 along with 501. Three professors
// now share the course; one mis-read screen is a semester.
//
// So this pins the three things that make the control safe, across both repos:
//   1. It is the owner's control, and it is hidden — not disabled — for anyone
//      else. A button that always 403s is a broken screen (pitfall #17).
//   2. It follows the switcher. The group on screen is the group that is reset.
//   3. Scope is never implied. The server refuses a call that names neither one
//      group nor, explicitly, all of them — so a dropped field cannot turn
//      "clear 501" into "clear everything".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backendPath, skipWithoutBackend } from "./lib/backend-root.mjs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

// ------------------------------------------------------------------- the card
const card = read("src/components/CourseReset.tsx");

assert.match(
  card,
  /import \{[^}]*\bisOwner\b[^}]*\} from "\.\.\/state\/session"/,
  "CourseReset must read the existing isOwner signal from state/session"
);
assert.match(
  card,
  /if \(!owner\) return null;/,
  "CourseReset must render nothing at all for a non-owner, not a disabled control"
);
assert.match(
  card,
  /import \{[^}]*\bactiveSectionId\b[^}]*\} from "\.\.\/state\/scope"/,
  "CourseReset must take its scope from the top-bar switcher, not from the course"
);

// Both calls carry the scope. A preview of one group followed by an execute of
// the course is the exact accident this file exists to prevent.
assert.match(
  card,
  /previewCourseReset\(sectionId\)/,
  "the preview must be asked for the group on screen"
);
assert.match(
  card,
  /executeCourseReset\(\{\s*sectionId,/,
  "the execute must carry the group on screen"
);

// Changing groups invalidates the counts and the ticked names on screen.
assert.match(
  card,
  /useEffect\([\s\S]{0,400}?\}, \[sectionId\]\)/,
  "changing the group must clear the loaded preview and any ticked students"
);

// The whole-course phrase is deliberately not the group phrase.
assert.match(card, /const CONFIRM_TOKEN = "RESET";/, "the group confirmation is RESET");
assert.match(
  card,
  /const CONFIRM_TOKEN_ALL = "RESET ALL";/,
  "clearing every group must need a different phrase from clearing one"
);

// ----------------------------------------------------------------- the client
const api = read("src/api/courseReset.ts");
assert.match(
  api,
  /sectionId \? \{ section_id: sectionId \} : \{ all_groups: true \}/,
  "an all-groups reset must travel as its own flag, never as a missing section_id"
);

// -------------------------------------------------------------------- strings
const strings = read("src/i18n/strings.ts");
for (const key of [
  "reset.title.group",
  "reset.title.all",
  "reset.scope.group",
  "reset.scope.all",
  "reset.warning.group",
  "reset.warning.all",
  "reset.placeholder.all",
  "reset.confirm.group",
  "reset.confirm.all"
]) {
  assert.match(
    strings,
    new RegExp(`"${key.replace(/\./g, "\\.")}": \\[`),
    `${key} must exist so the card can name what it is about to clear`
  );
}

// -------------------------------------------------------------------- backend
if (skipWithoutBackend("verify-reset-scope", "supabase/functions/course-reset/index.ts")) {
  console.log("verify-reset-scope: OK (frontend only)");
  process.exit(0);
}

const fn = readFileSync(backendPath("supabase/functions/course-reset/index.ts"), "utf8");

assert.match(
  fn,
  /const resetRoles = \["platform_owner"\];/,
  "course-reset stays owner-only: an invited instructor must not be able to erase a semester"
);
assert.match(
  fn,
  /if \(!sectionId && !allGroups\) \{[\s\S]{0,120}?throw new Error/,
  "a call that names neither a group nor all groups must be refused, not widened"
);
assert.match(
  fn,
  /\.eq\("course_id", courseId\)/,
  "the named group must be checked to belong to this course"
);
assert.match(
  fn,
  /reset_section_activity/,
  "a group reset must call the group-sized database function"
);
assert.match(
  fn,
  /remove_section_student/,
  "removing a student from a group must not unenrol them from every group"
);
assert.match(
  fn,
  /CONFIRM_TOKEN_ALL = "RESET ALL"/,
  "the server must require the longer phrase before clearing every group"
);

// ------------------------------------------------------------------ migration
const sql = readFileSync(backendPath("supabase/migrations/0054_group_scoped_reset.sql"), "utf8");

const body = sql.slice(
  sql.indexOf("create or replace function public.reset_section_activity"),
  sql.indexOf("create or replace function public.remove_section_student")
);
assert.ok(body.length > 500, "the group reset function must be in 0054");
assert.match(
  body,
  /raise exception 'section_not_in_course'/,
  "the group reset must refuse a section that belongs to another course"
);

// Every write in the group reset is narrowed to that group. A `where course_id`
// with no section beside it is the whole-course wipe wearing the wrong name.
for (const statement of body.split(";")) {
  const text = statement.trim();
  if (!/^(delete from|update) public\./i.test(text)) continue;
  assert.ok(
    /p_section_id|session_ids/.test(text),
    `every write in reset_section_activity must be narrowed to the group:\n${text.slice(0, 160)}`
  );
}

// Items are course-wide; deleting them to clear one group blanks the others.
assert.ok(
  !/delete from public\.gradebook_items/.test(body),
  "a group reset must keep gradebook_items — another group's grades hang off them"
);

console.log("verify-reset-scope: OK (owner-only, group-scoped, both repos)");
