// The content repository's validator, exercised against fixtures.
//
// The design named this the test to write first, and the reason holds: it is
// the check that makes the public-link problem impossible to reintroduce, and
// having it fail loudly on a deck that links to the public site is the clearest
// proof the audit was right.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateItem } from "./content-repo/lib/validate.mjs";

const config = {
  allowed_external_hosts: ["fonts.googleapis.com", "fonts.gstatic.com"],
  forbidden_hosts: ["mzareei.github.io"]
};

const root = mkdtempSync(path.join(os.tmpdir(), "content-repo-"));

function fixture(slug, meta, html) {
  const dir = path.join(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "content.json"), JSON.stringify({
    slug,
    content_type: "lecture",
    storage_filename: "deck.html",
    entry: "index.html",
    title: { en: "Week 1", es: "Semana 1" },
    ...meta
  }, null, 2));
  writeFileSync(path.join(dir, "index.html"), html ?? "<html><head><title>Week 1</title></head><body><section class=\"slide\"><h1>Hi</h1></section></body></html>");
  return dir;
}

const clean = fixture("week-01-lecture", {});
assert.deepEqual(validateItem(clean, config), [], "a self-contained bilingual deck must pass");

// The rule this file exists for.
const leaky = fixture("week-05-mission-05", {}, `<html><head><title>Mission</title></head>
  <body><a class="btn" href="https://mzareei.github.io/assets/course-materials/information-security/week-05/lecture/">Return to lecture</a></body></html>`);
const leakyFailures = validateItem(leaky, config);
assert.equal(leakyFailures.length, 1, "one failure for one bad link");
assert.match(leakyFailures[0], /mzareei\.github\.io/);
assert.match(leakyFailures[0], /ungated copy/, "the message must say why it matters, not just that it matched");

// A relative reference means an asset that was never inlined. Behind the gate
// there is no sibling file to find, so it would 404 for every student.
const relative = fixture("week-02-lecture", {}, `<html><head><title>Deck</title>
  <link rel="stylesheet" href="style.css"></head><body></body></html>`);
assert.match(validateItem(relative, config).join(" "), /self-contained/);

// Fonts are declared globally and must pass; anything else must be declared
// per item, so a new external dependency is a reviewed change.
const fonts = fixture("week-03-lecture", {}, `<html><head><title>Deck</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head><body></body></html>`);
assert.deepEqual(validateItem(fonts, config), [], "an allow-listed font host must pass");

const undeclared = fixture("week-04-mission-bridge", {}, `<html><head><title>Deck</title></head>
  <body><a href="https://amiunique.org/">Try it</a></body></html>`);
assert.match(validateItem(undeclared, config).join(" "), /undeclared host amiunique\.org/);

const declared = fixture("week-06-lecture", { external_links: ["https://amiunique.org/"] },
  `<html><head><title>Deck</title></head><body><a href="https://amiunique.org/">Try it</a></body></html>`);
assert.deepEqual(validateItem(declared, config), [], "a declared teaching link must pass");

// Bilingual is not optional.
const monolingual = fixture("week-07-lecture", { title: { en: "Week 7", es: "" } });
assert.match(validateItem(monolingual, config).join(" "), /title\.es is required/);

// Identity must be one fact, not three that happen to agree.
const mismatched = fixture("week-09-lecture", { slug: "something-else" });
assert.match(validateItem(mismatched, config).join(" "), /does not match the directory name/);

// The filename is read from production, never derived — two writers put two
// conventions in this bucket historically.
const noFilename = fixture("week-10-lecture", { storage_filename: undefined });
assert.match(validateItem(noFilename, config).join(" "), /storage_filename is required/);

rmSync(root, { recursive: true, force: true });
console.log("verify-content-repo-validator: OK (9 fixtures)");
