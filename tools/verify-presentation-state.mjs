import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  projectorIsStale,
  shouldApplyRevision
} from "../src/features/presentation/state.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(shouldApplyRevision(0, 1), true, "the first positive revision must apply");
assert.equal(shouldApplyRevision(4, 5), true, "a strictly newer revision must apply");
assert.equal(shouldApplyRevision(4, 4), false, "an equal retry must not apply twice");
assert.equal(shouldApplyRevision(4, 3), false, "an older revision must not move the deck");
for (const [current, incoming] of [
  [-1, 1],
  [1.5, 2],
  [1, 0],
  [1, -1],
  [1, 2.5],
  [Number.NaN, 2],
  [1, Number.POSITIVE_INFINITY]
]) {
  assert.equal(
    shouldApplyRevision(current, incoming),
    false,
    `invalid revisions ${String(current)} -> ${String(incoming)} must fail closed`
  );
}

const now = Date.parse("2026-07-30T18:00:10.000Z");
assert.equal(
  projectorIsStale("2026-07-30T18:00:00.001Z", now),
  false,
  "a projector seen less than 10 seconds ago must be fresh"
);
assert.equal(
  projectorIsStale("2026-07-30T18:00:00.000Z", now),
  true,
  "the exact 10-second boundary must be stale"
);
assert.equal(
  projectorIsStale("2026-07-30T17:59:59.999Z", now),
  true,
  "a projector older than the threshold must be stale"
);
assert.equal(projectorIsStale(null, now), true, "missing telemetry must be stale");
assert.equal(projectorIsStale(undefined, now), true, "undefined telemetry must be stale");
assert.equal(projectorIsStale("", now), true, "empty telemetry must be stale");
assert.equal(projectorIsStale("not-a-date", now), true, "invalid telemetry must be stale");
assert.equal(
  projectorIsStale("2026-07-30T18:00:10.001Z", now),
  false,
  "a future server timestamp must be treated as just seen, not disconnected"
);
assert.equal(
  projectorIsStale("2026-07-30T18:00:09.000Z", now, 1_000),
  true,
  "custom thresholds must use the same inclusive boundary"
);

const api = readFileSync(path.join(root, "src/api/presentation.ts"), "utf8");
assert.match(api, /callFn<[^>]+>\("course-presentation",\s*\{/s);
assert.doesNotMatch(api, /localStorage|sessionStorage|\.from\s*\(/);
for (const action of [
  "controller_current",
  "projector_current",
  "request_slide",
  "acknowledge_slide",
  "checkpoint_reached",
  "set_phase",
  "heartbeat"
]) {
  assert.match(api, new RegExp(`action:\\s*"${action}"`), `missing ${action} action payload`);
}
assert.match(api, /action:\s*"request_slide",\s*class_session_id:\s*classSessionId,\s*revision,\s*requested_slide:\s*requestedSlide/s);
assert.match(api, /action:\s*"acknowledge_slide",\s*class_session_id:\s*classSessionId,\s*revision,\s*acknowledged_slide:\s*acknowledgedSlide/s);
assert.match(api, /action:\s*"checkpoint_reached",\s*class_session_id:\s*classSessionId,\s*revision,\s*checkpoint_key:\s*checkpointKey,\s*checkpoint_after_slide:\s*checkpointAfterSlide/s);
assert.match(api, /action:\s*"set_phase",\s*class_session_id:\s*classSessionId,\s*revision,\s*phase/s);
assert.match(api, /action:\s*"heartbeat",\s*class_session_id:\s*classSessionId,\s*revision,\s*surface/s);

console.log("verify-presentation-state: OK");
