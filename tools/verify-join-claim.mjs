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
  /\}, \[joinCode, signedIn, claimed\]\)/,
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

console.log("verify-join-claim: OK");
