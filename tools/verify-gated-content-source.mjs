import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectEditableDeckSource } from "./lib/editable-deck-source.mjs";

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "course-platform-gated-source-"));

try {
  const frontendRoot = path.join(fixtureRoot, "course-platform");
  mkdirSync(frontendRoot);

  const missingSourceFailures = inspectEditableDeckSource({ frontendRoot });
  assert.deepEqual(
    missingSourceFailures,
    [
      "Missing editable deck engine source. Check out mzareei/mzareei.github.io "
      + "as ../mzareei.github.io or set COURSE_PLATFORM_BACKEND_ROOT."
    ],
    "verification must fail closed when neither a configured nor sibling backend source exists"
  );

  const configuredBackendRoot = path.join(fixtureRoot, "configured-backend");
  const configuredTemplateRoot = path.join(
    configuredBackendRoot,
    "supabase/functions/_shared/templates"
  );
  mkdirSync(configuredTemplateRoot, { recursive: true });
  writeFileSync(
    path.join(configuredTemplateRoot, "deck-script.js"),
    "parent.postMessage(payload, location.origin);\n"
  );

  assert.deepEqual(
    inspectEditableDeckSource({ frontendRoot, configuredBackendRoot }),
    [],
    "a configured editable backend source satisfying the contract must pass"
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("verify-gated-content-source: OK");
