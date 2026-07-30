// Verifies the Phase 2 content-gating contract.
//
// The hard-won invariant this protects: gated decks must be delivered as a
// same-origin document via /content, NOT a blob: or cross-origin iframe. A
// blob: iframe inherits this page's CSP, which has script-src 'self', and that
// silently disables every deck's inline presenter engine — decks render but
// freeze on slide 1. Easy to reintroduce, hard to notice.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectEditableDeckSource } from "./lib/editable-deck-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const requireFile = (rel) => {
  if (!existsSync(path.join(root, rel))) failures.push(`Missing file: ${rel}`);
};
const requireMarker = (rel, marker, why) => {
  if (!existsSync(path.join(root, rel))) return failures.push(`Missing file: ${rel}`);
  if (!read(rel).includes(marker)) failures.push(`${rel} is missing "${marker}" (${why})`);
};

for (const rel of ["src/screens/Viewer.tsx", "functions/content.ts", "public/_headers"]) {
  requireFile(rel);
}

failures.push(...inspectEditableDeckSource({
  frontendRoot: root,
  configuredBackendRoot: process.env.COURSE_PLATFORM_BACKEND_ROOT
}));

// The viewer goes through the gate, then the same-origin proxy.
requireMarker("src/screens/Viewer.tsx", "course-content-access", "the release gate is the only way in");
requireMarker("src/screens/Viewer.tsx", "request_url", "delivery URLs are minted per request");
requireMarker("src/screens/Viewer.tsx", "/content?t=", "content must load same-origin via the proxy");
if (existsSync(path.join(root, "src/screens/Viewer.tsx"))) {
  const viewer = read("src/screens/Viewer.tsx");
  if (viewer.includes("createObjectURL")) {
    failures.push("src/screens/Viewer.tsx uses a blob: URL — it inherits this page's CSP and disables deck scripts");
  }
  if (!/setTimeout\(mint/.test(viewer)) {
    failures.push("src/screens/Viewer.tsx must re-mint before expiry so long reads don't die mid-slide");
  }
}

// The proxy forwards to the token-checked serve function and restores the type.
requireMarker("functions/content.ts", "course-content-serve", "the proxy must forward to the gated serve function");
requireMarker("functions/content.ts", "X-Mime", "the real content type comes from X-Mime");

// Scoped CSP: the app stays strict; only /content allows inline scripts.
// Parse real header blocks — comments mention paths too, so string splitting on
// "/content" would match prose.
function parseHeaderBlocks(source) {
  const blocks = new Map();
  let current = null;
  for (const raw of source.split("\n")) {
    if (raw.trim().startsWith("#") || !raw.trim()) continue;
    if (!raw.startsWith(" ") && !raw.startsWith("\t")) {
      current = raw.trim();
      blocks.set(current, "");
    } else if (current) {
      blocks.set(current, `${blocks.get(current)}\n${raw.trim()}`);
    }
  }
  return blocks;
}

if (existsSync(path.join(root, "public/_headers"))) {
  const blocks = parseHeaderBlocks(read("public/_headers"));
  const appBlock = blocks.get("/*") || "";
  const contentBlock = blocks.get("/content");
  if (!appBlock) failures.push("public/_headers has no /* section");
  if (!contentBlock) {
    failures.push("public/_headers has no /content section for gated documents");
  } else {
    if (!contentBlock.includes("script-src 'unsafe-inline'")) {
      failures.push("public/_headers /content must allow inline scripts (the deck engine is inline)");
    }
    if (!contentBlock.includes("frame-ancestors 'self'")) {
      failures.push("public/_headers /content must restrict frame-ancestors to 'self'");
    }
    if (/connect-src/.test(contentBlock)) {
      failures.push("public/_headers /content must not grant connect-src — deck documents never call the API");
    }
  }
  if (appBlock.includes("script-src 'unsafe-inline'")) {
    failures.push("public/_headers: the app itself must not allow inline scripts");
  }
  if (!appBlock.includes("frame-src 'self'")) {
    failures.push("public/_headers: the app must frame content from its own origin");
  }
}

if (failures.length) {
  console.error("Gated content verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-gated-content: OK");
