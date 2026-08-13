// Signing in with the university's own Microsoft account.
//
// This exists because emailed codes cannot work here: the project mailer is
// capped at 2/hour, tec.mx publishes DMARC p=reject so no third party may send
// as a tec.mx address, and Tec blocks both app passwords and app registration
// in their tenant. Letting Microsoft do the verifying needs nothing from their
// IT and sends no mail — so the whole room can sign in at once.
//
// It is also the only method here a classmate cannot defeat by knowing an
// address. These assertions protect the parts that make that true.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const auth = readFileSync("src/auth/auth.ts", "utf8");
const signIn = readFileSync("src/screens/SignIn.tsx", "utf8");
const config = readFileSync("src/config.ts", "utf8");
const strings = readFileSync("src/i18n/strings.ts", "utf8");

// ------------------------------------------------------------ the call itself
assert.match(
  auth,
  /provider: "azure"/,
  "the provider must be Azure — Tec runs on Microsoft 365, so that is the account students already have"
);
assert.match(
  auth,
  /scopes: "openid profile email offline_access"/,
  "the email scope is load-bearing: with no email claim there is nothing to match "
  + "against the roster, and the student lands on 'not on the roster' holding a valid session"
);
assert.match(
  auth,
  /redirectTo: redirectUrl\(\)/,
  "the student must return to the page they left, so a QR deep link completes its join"
);

// ---------------------------------------------------- the flag, and what it means
assert.match(
  config,
  /microsoftSignIn: (true|false)/,
  "the button must be behind an explicit flag"
);
assert.match(
  signIn,
  /config\.microsoftSignIn \?/,
  "the button must not render unless the provider is actually configured — a "
  + "button that opens a provider-not-enabled error is worse than no button"
);

// ------------------------------------------------- the fallback must survive
// Not every account is a university one. The QA student and any invited
// instructor sign in from outside tec.mx and have no Microsoft account to use,
// so the emailed code has to stay reachable.
assert.match(
  signIn,
  /t\("signIn\.send"\)/,
  "the emailed-code path must remain for accounts outside the university"
);
assert.match(
  signIn,
  /t\("signIn\.codeLabel"\)/,
  "the code box must remain reachable"
);

// ------------------------------------------------------------------- strings
for (const key of ["signIn.microsoft", "signIn.microsoftBody", "signIn.microsoftFailed", "signIn.otherWays"]) {
  assert.match(
    strings,
    new RegExp(`"${key.replace(".", "\\.")}"`),
    `${key} must exist in the bilingual dictionary`
  );
}

// The button says what the student recognises. "Azure", "OAuth" and "SSO" are
// our words, not theirs — they know it as their Tec account.
const label = strings.match(/"signIn\.microsoft": \[([^\]]+)\]/)?.[1] || "";
assert.doesNotMatch(
  label,
  /azure|oauth|sso|provider/i,
  "the button must be named in the student's language, not the implementation's"
);

console.log("verify-microsoft-sign-in: OK");
