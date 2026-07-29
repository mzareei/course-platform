import assert from "node:assert/strict";
import { canReleaseToReview, studentDelivery } from "../src/api/contentVisibility.ts";

assert.equal(studentDelivery({ content_type: "lecture", source_kind: "storage_object" }), "viewer");
assert.equal(studentDelivery({ content_type: "mission", source_kind: "storage_object" }), "viewer");
assert.equal(studentDelivery({ content_type: "resource", source_kind: "external_url" }), "external");
assert.equal(studentDelivery({ content_type: "activity", source_kind: "supabase_record" }), "live_only");
assert.equal(studentDelivery({ content_type: "quiz_bank", source_kind: "supabase_record" }), "live_only");
assert.equal(studentDelivery({ content_type: "internal", source_kind: "supabase_record" }), "internal");
assert.equal(canReleaseToReview({ content_type: "activity", source_kind: "supabase_record" }), false);
assert.equal(canReleaseToReview({ content_type: "lecture", source_kind: "storage_object" }), true);

console.log("verify-content-semantics: OK");
