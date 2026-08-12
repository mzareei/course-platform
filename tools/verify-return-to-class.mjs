// Scanning the QR is the attendance record, so Today has no join button by
// design. The exception, and the only one: a student the server already
// recorded as present may return to the class they are already in. These
// assertions exist so that exception cannot quietly widen into a button anyone
// can press from anywhere.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const today = readFileSync("src/screens/student/Today.tsx", "utf8");
const types = readFileSync("src/api/types.ts", "utf8");

assert.match(
  types,
  /checked_in: boolean;/,
  "StudentSession must carry the server's own check-in fact"
);
assert.match(
  today,
  /const canReturnToClass = sessionIsLive && Boolean\(liveSession\?\.checked_in\)/,
  "the way back must require BOTH a live class and a recorded check-in"
);
assert.match(
  today,
  /canReturnToClass \? \(/,
  "the button must be gated on that combined condition, not on liveness alone"
);
assert.match(
  today,
  /href="\/live"/,
  "the way back must go to the live screen"
);
assert.match(
  today,
  /t\("today\.returnToClass"\)/,
  "the button must be translated"
);
assert.doesNotMatch(
  today,
  /checked_in \|\|/,
  "check-in must never be OR'd with anything — that is how an attendance gate becomes a suggestion"
);

// The scan card must survive for everyone else. If this assertion ever fails,
// a student who has NOT scanned is being shown a way in, and the attendance
// table starts describing a room that was never full.
assert.match(
  today,
  /t\("today\.scanToJoin"\)/,
  "a student who has not scanned must still be told to scan"
);

console.log("verify-return-to-class: OK");
