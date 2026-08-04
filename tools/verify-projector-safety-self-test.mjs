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

function mutate(source, from, to, label) {
  const next = source.replace(from, to);
  assert.notEqual(next, source, `${label} mutation must change the fixture`);
  return next;
}

function removeNth(source, needle, occurrence, label) {
  let from = 0;
  let index = -1;
  for (let count = 0; count <= occurrence; count += 1) {
    index = source.indexOf(needle, from);
    assert.notEqual(index, -1, `${label} mutation must find occurrence ${occurrence}`);
    from = index + needle.length;
  }
  const next = source.slice(0, index) + source.slice(index + needle.length);
  assert.notEqual(next, source, `${label} mutation must change the fixture`);
  return next;
}

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
    mutate(projector, "void refresh();", "if (false) { void refresh(); }", "dead poll"),
    pulse
  ),
  /first poll|setInterval|projectorCurrent/,
  "a dead initial fetch decoy must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(projector, "    void refresh();", "    if (true) throw new Error();\n    void refresh();", "conditional throw poll"),
    pulse
  ),
  /first poll/,
  "a conditionally unreachable initial poll after throw must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(projector, "    void refresh();", "    if (true) return undefined;\n    void refresh();", "conditional unreachable poll"),
    pulse
  ),
  /first poll/,
  "a conditionally unreachable initial poll must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(
      projector,
      '  const classSessionId = sessionId || "";',
      '  const hiddenController = { requestSlide() {} };\n  const go = hiddenController.requestSlide;\n  go();\n  const classSessionId = sessionId || "";',
      "property controller alias"
    ),
    pulse
  ),
  /aliased forbidden|requestSlide|controller/,
  "property-assigned controller aliases must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(
      projector,
      '  const classSessionId = sessionId || "";',
      '  const hiddenController = { requestSlide() {} };\n  const key = "requestSlide";\n  hiddenController[key]();\n  const classSessionId = sessionId || "";',
      "constant-key controller call"
    ),
    pulse
  ),
  /requestSlide|controller/,
  "constant-key controller calls must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(projector, "void refresh();", "function unused() { void refresh(); }", "nested poll"),
    pulse
  ),
  /first poll/,
  "an unused nested polling function must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector,
    pulse.replace(
      "function ProjectorPulse({ pulse }: { pulse: ProjectorPulseState }) {",
      "function ProjectorPulse({ pulse }: { pulse: ProjectorPulseState }, revealed: boolean) {"
    )
  ),
  /shadowed by a parameter/,
  "parameter shadowing the server reveal flag must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(
      projector,
      '  const classSessionId = sessionId || "";',
      '  const hiddenController = { requestSlide() {} };\n  hiddenController[`requestSlide`]();\n  const classSessionId = sessionId || "";',
      "template controller call"
    ),
    pulse
  ),
  /requestSlide|controller/,
  "controller member calls must fail through template element access"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(
      projector,
      '  const classSessionId = sessionId || "";',
      '  const hiddenController = { requestSlide() {} };\n  const { requestSlide: go } = hiddenController;\n  go();\n  const classSessionId = sessionId || "";',
      "destructured controller alias"
    ),
    pulse
  ),
  /aliased forbidden|requestSlide|controller/,
  "destructured controller aliases must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(projector, "    void refresh();", "    return undefined;\n    void refresh();", "unreachable poll"),
    pulse
  ),
  /first poll|unreachable/,
  "an initial poll after an unconditional return must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector,
    pulse.replace(
      'const revealed = pulse.state === "revealed";',
      'const revealed = pulse.state === "revealed";\n  if (pulse.state === "revealed") { const revealed = true; void revealed; }'
    )
  ),
  /one server-derived binding/,
  "shadowed reveal bindings must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector,
    mutate(
      pulse,
      'const revealed = pulse.state === "revealed";',
      'const revealed = pulse.state === "revealed";\n  const leakedTemplateExplanation = pulse[`explanation`];',
      "template explanation leak"
    )
  ),
  /explanation must only be read/,
  "template-literal sensitive reads must stay guarded"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(projector, "acknowledgeSlide,", "controllerCurrent as acknowledgeSlide,", "indirect import"),
    pulse
  ),
  /alias|allowed/,
  "an indirect controller import must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector.replace(
      'import { useCallback, useEffect, useRef, useState } from "preact/hooks";',
      'import * as presentation from "../../api/presentation";\nimport { useCallback, useEffect, useRef, useState } from "preact/hooks";'
    ).replace("void refresh();", "void presentation.requestSlide(classSessionId, 0, 1);"),
    pulse
  ),
  /exactly one presentation API import|presentation APIs through/,
  "namespace presentation controller calls must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(
      projector,
      '  const classSessionId = sessionId || "";',
      '  const hiddenController = { requestSlide() {} };\n  hiddenController.requestSlide();\n  const classSessionId = sessionId || "";',
      "property controller call"
    ),
    pulse
  ),
  /requestSlide|controller/,
  "controller member calls must fail through property access"
);
assert.throws(
  () => verifyProjectorSafetySource(
    mutate(
      projector,
      '  const classSessionId = sessionId || "";',
      '  const hiddenController = { requestSlide() {} };\n  hiddenController["requestSlide"]();\n  const classSessionId = sessionId || "";',
      "element controller call"
    ),
    pulse
  ),
  /requestSlide|controller/,
  "controller member calls must fail through element access"
);
assert.throws(
  () => verifyProjectorSafetySource(projector, pulse.replace('pulse.state === "revealed"', "true")),
  /coupled to pulse.state/,
  "reveal-only rendering must stay coupled to server state"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector,
    pulse.replace(
      "const correctKey = revealed ? pulse.correct_option?.key : null;",
      "const correctKey = pulse.correct_option?.key;"
    )
  ),
  /correct_option must only be read/,
  "an unguarded correctness read must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector,
    pulse.replace(
      'const revealed = pulse.state === "revealed";',
      'const revealed = pulse.state === "revealed";\n  const leakedExplanation = pulse.explanation;'
    )
  ),
  /explanation must only be read/,
  "an unguarded explanation read must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector,
    mutate(
      pulse,
      'const revealed = pulse.state === "revealed";',
      'const revealed = pulse.state === "revealed";\n  const leakedElementExplanation = pulse["explanation"];',
      "element explanation leak"
    )
  ),
  /explanation must only be read/,
  "an unguarded element explanation read must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector,
    mutate(
      pulse,
      'const revealed = pulse.state === "revealed";',
      'const revealed = pulse.state === "revealed";\n  const pulseAlias = pulse;\n  const leakedAliasExplanation = pulseAlias.explanation;',
      "aliased explanation leak"
    )
  ),
  /explanation must only be read/,
  "an unguarded aliased explanation read must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(
    projector,
    mutate(
      pulse,
      'const revealed = pulse.state === "revealed";',
      'const revealed = pulse.state === "revealed";\n  const { correct_option: leakedCorrectOption } = pulse;',
      "destructured correctness leak"
    )
  ),
  /correct_option must only be read/,
  "an unguarded destructured correctness read must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(projector.replace("MAX_TELEMETRY_RETRIES", "MAX_RETRIES"), pulse),
  /bounded/,
  "unbounded retry implementation must fail"
);
assert.throws(
  () => verifyProjectorSafetySource(projector.replace("setAckRetry((current) => current + 1);", ""), pulse),
  /setAckRetry/,
  "an acknowledgement failure must schedule a bounded retry"
);
for (const [occurrence, label] of [
  [2, "ack initial bridge guard"],
  [3, "ack completion bridge guard"],
  [4, "ack failure bridge guard"],
  [5, "ack retry bridge guard"],
  [6, "checkpoint initial bridge guard"],
  [7, "checkpoint completion bridge guard"],
  [8, "checkpoint failure bridge guard"],
  [9, "checkpoint retry bridge guard"]
]) {
  assert.throws(
    () => verifyProjectorSafetySource(
      removeNth(projector, "|| !bridgeBelongsToSession", occurrence, label),
      pulse
    ),
    /bridge session identity|bridge.*active session/,
    `${label} must remain guarded`
  );
}

console.log("verify-projector-safety-self-test: OK");
