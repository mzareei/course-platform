import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const missingSourceMessage =
  "Missing editable deck engine source. Check out mzareei/mzareei.github.io "
  + "as ../mzareei.github.io or set COURSE_PLATFORM_BACKEND_ROOT.";

export function inspectEditableDeckSource({
  frontendRoot,
  configuredBackendRoot
}) {
  const backendRoot = configuredBackendRoot
    ? path.resolve(configuredBackendRoot)
    : path.resolve(frontendRoot, "../mzareei.github.io");
  const deckScriptPath = path.join(
    backendRoot,
    "supabase/functions/_shared/templates/deck-script.js"
  );
  if (!existsSync(deckScriptPath)) return [missingSourceMessage];

  const failures = [];
  const deckScript = readFileSync(deckScriptPath, "utf8");
  if (!deckScript.includes("parent.postMessage")) {
    failures.push("deck-script.js must notify its same-origin parent with postMessage");
  }
  if (
    /https?:\/\//i.test(deckScript)
    || /\b(?:window\.)?location\.href\s*=/i.test(deckScript)
    || /\bwindow\.open\s*\(/i.test(deckScript)
    || /<a\b/i.test(deckScript)
  ) {
    failures.push("deck-script.js must not contain legacy course URLs or navigation anchors");
  }
  return failures;
}
