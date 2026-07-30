import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canReleaseToReview, studentDelivery } from "../src/api/contentVisibility.ts";

const contentLibrary = readFileSync(new URL("../src/components/ContentLibrary.tsx", import.meta.url), "utf8");
const contentApi = readFileSync(new URL("../src/api/content.ts", import.meta.url), "utf8");
const strings = readFileSync(new URL("../src/i18n/strings.ts", import.meta.url), "utf8");

assert.equal(studentDelivery({ content_type: "lecture", source_kind: "storage_object" }), "viewer");
assert.equal(studentDelivery({ content_type: "mission", source_kind: "storage_object" }), "viewer");
assert.equal(studentDelivery({ content_type: "resource", source_kind: "external_url" }), "external");
assert.equal(studentDelivery({ content_type: "activity", source_kind: "supabase_record" }), "live_only");
assert.equal(studentDelivery({ content_type: "quiz_bank", source_kind: "supabase_record" }), "live_only");
assert.equal(studentDelivery({ content_type: "internal", source_kind: "supabase_record" }), "internal");
assert.equal(canReleaseToReview({ content_type: "activity", source_kind: "supabase_record" }), false);
assert.equal(canReleaseToReview({ content_type: "lecture", source_kind: "storage_object" }), true);
assert.match(
  contentApi,
  /studentsCanOpen\(state: string, opensAt: string \| null, now = new Date\(\)\)[\s\S]+state === "scheduled"[\s\S]+new Date\(opensAt\) <= now/,
  "scheduled student visibility must wait until opens_at"
);

// Content assignment is the same safe pre-start edit as Classes, and does not
// make a lecture visible by itself. Review visibility is represented by each
// actual release scope so removing one group never closes another group.
assert.match(strings, /"content\.library\.makeAvailable": \["Make available now"/);
assert.match(strings, /"content\.library\.assignToClass": \[/);
assert.match(strings, /"content\.library\.plannedAssignment": \[/);
assert.match(strings, /"content\.library\.groupReview": \[/);
assert.match(strings, /"content\.library\.wholeCourseReview": \[/);
assert.match(strings, /"content\.library\.removeFromReview": \[/);
assert.match(strings, /"content\.library\.cancelScheduled": \[/);
assert.match(strings, /"content\.library\.cancelScheduledConfirm": \[/);
assert.match(strings, /"content\.library\.scheduledCancelled": \[/);
assert.match(contentLibrary, /listSessions/);
assert.match(contentLibrary, /updateClass/);
assert.match(contentLibrary, /const ASSIGNABLE_SESSION_STATES = \["planned", "open", "continued"\]/);
assert.match(contentLibrary, /session\.actual_start_at == null/);
assert.match(contentLibrary, /t\("content\.library\.assignToClass"\)/);
assert.match(contentLibrary, /section_id:\s*session\.section_id/);
assert.match(contentLibrary, /title:\s*session\.title/);
assert.match(contentLibrary, /planned_date:\s*session\.planned_date/);
assert.match(contentLibrary, /content_item_id:\s*item\.id/);
assert.match(contentLibrary, /manageableReleases\.map\(\(release\)/);
assert.match(contentLibrary, /release_id:\s*release\.release_id/);
assert.match(contentLibrary, /next_state:\s*release\.state === "scheduled" \? "draft" : "closed"/);
assert.match(contentLibrary, /release\.state === "scheduled"\s*\?\s*t\("content\.library\.cancelScheduled"\)/);

console.log("verify-content-semantics: OK");
