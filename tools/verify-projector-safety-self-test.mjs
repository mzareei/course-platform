import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyProjectorRouteSource,
  verifyProjectorSafetySource
} from "./lib/projector-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const app = read("src/app.tsx");
const projector = read("src/screens/instructor/Projector.tsx");
const pulse = read("src/features/presentation/ProjectorPulse.tsx");

assert.doesNotThrow(() => verifyProjectorRouteSource(app));
assert.doesNotThrow(() => verifyProjectorSafetySource(projector, pulse));
assert.throws(
  () => verifyProjectorRouteSource(app.replace("if (isProjectorRoute(location.pathname))", "if (booting.value)")),
  /first App branch|ProjectorRoute/,
  "a route claim after a shell branch must fail"
);
assert.throws(
  () => verifyProjectorRouteSource(app.replace("if (!authorized)", "if (false)")),
  /explicitly reject/,
  "an authorization dead branch must fail"
);
assert.throws(
  () => verifyProjectorRouteSource(`/* ${app} */`),
  /must parse|App must be an executable function/,
  "comment-only route decoys must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector.replace("void refresh();", "if (false) projectorCurrent(classSessionId);"),
    pulse
  ),
  /first poll|setInterval|projectorCurrent/,
  "a dead initial fetch decoy must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector.replace("acknowledgeSlide,", "controllerCurrent as acknowledgeSlide,"),
    pulse
  ),
  /alias|allowed/,
  "an indirect controller import must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(projector, pulse.replace('pulse.state === "revealed"', "true")),
  /coupled to pulse.state/,
  "reveal-only rendering must stay coupled to server state"
);
assert.throws(
  () => verifyProjectorSafetySource(projector.replace("MAX_TELEMETRY_RETRIES", "MAX_RETRIES"), pulse),
  /bounded/,
  "unbounded retry implementation must fail"
);

console.log("verify-projector-safety-self-test: OK");
