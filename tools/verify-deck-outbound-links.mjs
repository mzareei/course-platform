// What an uploaded deck is allowed to point at, and what merely gets mentioned.
//
// The rule these cases pin down: a deck is refused only when it is broken or
// when it lets a student slip back out to the ungated public copy of the
// lecture. Where else it links is reported, never refused.
//
// This exists because the opposite shipped. `undeclared_host` — any host not
// typed into the "sites this deck links to" box beforehand — used to block the
// upload outright, and a lecture that pointed students at a password-strength
// checker could not be imported at all. The professor was asked to declare a
// host they had no reason to know they had to declare, to permit a link that
// was the entire point of the slide.
//
// Blocking it also bought nothing. /content serves decks under
// `default-src 'none'; img-src data: blob:` (public/_headers), so an external
// subresource cannot load into the page whatever this validator decides, while
// a plain link is navigation and was never a subresource. The runtime already
// contains the risk; the validator was only refusing the professor.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { backendPath, skipWithoutBackend } from "./lib/backend-root.mjs";

const REL = "supabase/functions/_shared/deck-validation.ts";
if (skipWithoutBackend("verify-deck-outbound-links", REL)) process.exit(0);

const compiled = ts.transpileModule(readFileSync(backendPath(REL), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const validation = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const deck = (body) =>
  `<!DOCTYPE html><html><head><title>Password strength</title></head><body>${body}</body></html>`;

function check(html, allowedHosts = []) {
  const problems = validation.validateDeckHtml(html, {
    allowedHosts,
    forbiddenHosts: ["mzareei.github.io"]
  });
  const { blocking, notices } = validation.partitionDeckProblems(problems);
  return {
    blocked: blocking.length > 0,
    kinds: blocking.map((problem) => problem.kind),
    notices: notices.map((problem) => problem.host || problem.reference)
  };
}

// ------------------------------------------------------- must not be refused
// The reported case, verbatim in shape: a link to a password-strength checker
// the professor never declared, so students can scan it from the slide.
const passwordChecker = check(
  deck('<a href="https://www.security.org/how-secure-is-my-password/">Test yours</a>')
);
assert.equal(
  passwordChecker.blocked, false,
  "an ordinary outbound teaching link must not refuse the upload — this is the exact failure this file exists for"
);
assert.deepEqual(
  passwordChecker.notices, ["www.security.org"],
  "...but the professor must still be told where the deck points"
);

// A QR code students scan: the image is inline (the only kind that can render
// under the /content CSP) and the destination is a link.
assert.equal(
  check(deck(
    '<img src="data:image/png;base64,iVBORw0KGgo="><a href="https://security.org">go</a>'
  )).blocked,
  false,
  "an inline QR image beside an outbound link must upload"
);

// Declaring the host is now only a way to silence the mention.
assert.deepEqual(
  check(deck('<a href="https://www.security.org/x">t</a>'), ["www.security.org"]).notices,
  [],
  "a declared host must produce no notice — that is all the box is still for"
);

// An external subresource cannot render under the CSP, but that is the
// runtime's business; the upload still succeeds and says where it points.
const externalFont = check(
  deck('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">')
);
assert.equal(externalFont.blocked, false, "an external stylesheet must not refuse the upload");
assert.deepEqual(externalFont.notices, ["fonts.googleapis.com"], "...it must be mentioned");

// ----------------------------------------------------------- must be refused
// Pitfall #57, the incident the validator was written for: a deck linking to
// the public copy of its own lecture puts the student one click outside the
// gate. Nothing about relaxing undeclared hosts may weaken this.
const publicCopy = check(deck('<a href="https://mzareei.github.io/lectures/week1.html">copy</a>'));
assert.equal(publicCopy.blocked, true, "a link to the ungated public site must still refuse the upload");
assert.deepEqual(publicCopy.kinds, ["forbidden_host"]);

// A relative reference 404s behind the gate — the deck would simply be broken.
const relative = check(deck('<img src="images/diagram.png">'));
assert.equal(relative.blocked, true, "a surviving relative reference must still refuse the upload");
assert.deepEqual(relative.kinds, ["relative"]);

// Without a title there is nothing to name the item, and the deck-only import
// path now derives its content_items title from exactly this element.
const untitled = check("<html><body><p>nothing</p></body></html>");
assert.equal(untitled.blocked, true, "a deck with no title must still refuse the upload");
assert.deepEqual(untitled.kinds, ["no_title"]);

// ------------------------------------------------------------ not a reference
// Self-contained decks carry inline JS, and ordinary variable names must not
// be misread as outbound references.
assert.equal(
  check(deck('<script>let src = "https://evil.example"; console.log(src);</script>')).blocked,
  false,
  "an inline script body must not be scanned for references"
);
assert.deepEqual(
  check(deck('<script>let src = "https://evil.example";</script>')).notices,
  [],
  "...and must not produce a notice either"
);

// -------------------------------------------------------- the caller agrees
// The validator can only advise; the import function decides. If it ever goes
// back to refusing on the raw problem list, every case above becomes decorative.
const importFn = readFileSync(
  backendPath("supabase/functions/course-content-import/index.ts"), "utf8"
);
assert.match(
  importFn, /partitionDeckProblems\(problems\)/,
  "the import function must split blocking findings from notices"
);
assert.match(
  importFn, /if \(blocking\.length\)/,
  "the import function must refuse only on blocking findings, not on every problem"
);
assert.doesNotMatch(
  importFn, /if \(problems\.length\) \{\s*result\.deck = \{ ok: false, problems \};/,
  "the import function must not refuse on the unpartitioned problem list"
);

console.log("verify-deck-outbound-links: OK (9 cases)");
