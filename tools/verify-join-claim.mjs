// A QR join runs the moment a session appears. The server now claims a
// first-ever profile itself, but a browser holding yesterday's bundle does not
// know that — so the screen must also wait for context and retry once, and the
// two halves must both stay in the file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const join = readFileSync("src/screens/student/JoinClass.tsx", "utf8");

assert.match(
  join,
  /const claimed = Boolean\(context\.value\)/,
  "the join must know whether the course context has loaded before it calls"
);
assert.match(
  join,
  /if \(!claimed\) return;/,
  "the join must wait for the context that claims a first-ever profile"
);
assert.match(
  join,
  /\}, \[joinCode, signedIn, claimed(?:, \w+)*\]\)/,
  "the effect must re-run once the context arrives, or waiting would hang forever"
);
assert.match(
  join,
  /await refreshContext\(\);\s*\n\s*return resolveJoinCode\(code\);/,
  "a 403 must be retried exactly once, after refreshing the context"
);
assert.match(
  join,
  /retried/,
  "the retry must be latched so a genuine wrong-group 403 cannot loop"
);

// The PIN gate. course-session-join refuses a scan by a student who has never
// chosen a PIN, which is how a student carried past the sign-in screen by an old
// session is made to set one. Both halves below are load-bearing.
assert.ok(
  join.indexOf('error.code === "pin_required"') > -1
    && join.indexOf('error.code === "pin_required"') < join.indexOf("error.status === 409"),
  'pin_required shares its 409 with "this class is closed" and must be matched '
    + "first, or the student is shown a dead end instead of the PIN form"
);
assert.match(
  join,
  /setAttempt\(\(n\) => n \+ 1\)/,
  "claiming a PIN must bump the attempt counter: signing in again leaves "
    + "signedIn and claimed both true, so nothing else re-runs the join"
);

console.log("verify-join-claim: OK");
