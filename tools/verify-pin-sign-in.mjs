// Student sign-in by student ID + PIN.
//
// This is the front door to the whole system now, and the thing it replaces
// (course-test-signin) hands a session to anyone who knows a rostered email. The
// assertions here hold the parts that make the replacement actually safer rather
// than merely different.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidPin, pinFailureKey } from "../src/features/auth/pinRules.ts";

// ------------------------------------------------------------- the PIN itself
for (const good of ["000000", "482913", "999999"]) {
  assert.equal(isValidPin(good), true, `${good} is a valid 6-digit PIN`);
}
for (const bad of ["12345", "1234567", "12345a", "", "  ", "abcdef", "12 345"]) {
  assert.equal(isValidPin(bad), false, `"${bad}" must be refused before it reaches the server`);
}
assert.equal(isValidPin(" 482913 "), true, "surrounding spaces must not fail a correct PIN");

// -------------------------------------------------- every server code has copy
// A code with no matching string renders a raw key like "pin.error.foo" on a
// student's phone mid-class. Unknown codes must fall back, never pass through.
const strings = readFileSync("src/i18n/strings.ts", "utf8");
const codes = [
  "pin_invalid", "pin_locked", "pin_not_set", "pin_already_set", "pin_format",
  "join_invalid", "join_not_live", "student_unknown", "not_in_this_class"
];
for (const code of codes) {
  const key = pinFailureKey(code);
  assert.equal(key, `pin.error.${code}`, `${code} must map to its own message`);
  assert.match(
    strings,
    new RegExp(`"${key.replace(/\./g, "\\.")}"`),
    `${key} must exist in the bilingual dictionary`
  );
}
assert.equal(
  pinFailureKey("something_new_from_the_server"),
  "pin.error.pin_unavailable",
  "an unrecognised code must fall back, not render a raw key"
);
assert.equal(
  pinFailureKey(undefined),
  "pin.error.pin_unavailable",
  "a missing code must fall back too"
);

// ------------------------------------------------------ claiming needs a class
// The single guard that stops a student taking a classmate's account: a PIN can
// only be set while holding the code of a class that is live right now, which is
// what puts them physically in the room.
const api = readFileSync("src/api/pinAuth.ts", "utf8");
const form = readFileSync("src/features/auth/PinForm.tsx", "utf8");

assert.match(
  api,
  /action: "claim"[\s\S]{0,200}join_code:/,
  "claiming must send the join code"
);
assert.doesNotMatch(
  api,
  /action: "signin"[\s\S]{0,200}join_code:/,
  "an ordinary sign-in must not send a join code — that path must never claim"
);
assert.match(
  form,
  /const canClaim = Boolean\(joinCode\)/,
  "the form must know whether a live class vouched for this student"
);
assert.match(
  form,
  /if \(claiming && joinCode\)/,
  "claiming must be impossible without a join code, whatever the UI state says"
);
assert.match(
  form,
  /canClaim \? \(/,
  "the first-time option must not be offered off the QR path"
);

// The PIN must never be typed in the clear on a phone someone is sitting next to.
assert.match(
  form,
  /type="password"/,
  "the PIN field must be masked"
);
assert.match(
  form,
  /inputmode="numeric"/,
  "a 6-digit PIN must bring up the numeric keypad"
);

// ---------------------------------------------------- the way back in for a
// forgotten PIN, and its blast radius
const roster = readFileSync("src/api/roster.ts", "utf8");
assert.match(
  roster,
  /action: "reset_student_pin"/,
  "the professor must be able to clear a forgotten PIN"
);
assert.doesNotMatch(
  roster,
  /reset_student_pin[\s\S]{0,200}(delete|remove|attendance|grade)/i,
  "resetting a PIN must not touch anything but the PIN"
);

console.log("verify-pin-sign-in: OK");
