import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPresentationApiSource } from "./lib/presentation-api-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = readFileSync(path.join(root, "src/api/presentation.ts"), "utf8");
const client = readFileSync(path.join(root, "src/api/client.ts"), "utf8");

assert.doesNotThrow(() => verifyPresentationApiSource(api, client));
assert.throws(
  () => verifyPresentationApiSource(api.split("\n").map((line) => `// ${line}`).join("\n"), client),
  /presentation API|controllerCurrent/,
  "a fully line-commented API must fail"
);
assert.throws(
  () => verifyPresentationApiSource(`/*\n${api}\n*/`, client),
  /presentation API|controllerCurrent/,
  "a fully block-commented API must fail"
);
assert.throws(
  () => verifyPresentationApiSource(
    `export const decoy = String.raw\`${api.replaceAll("`", "\\`").replaceAll("${", "\\${")}\`;`,
    client
  ),
  /controllerCurrent/,
  "a complete API preserved only inside a raw template string must fail"
);
assert.throws(
  () => verifyPresentationApiSource(`export const decoy = ${JSON.stringify(api)};`, client),
  /controllerCurrent/,
  "a complete API preserved only inside an ordinary string must fail"
);

const actions = {
  controllerCurrent: "controller_current",
  projectorCurrent: "projector_current",
  requestSlide: "request_slide",
  acknowledgeSlide: "acknowledge_slide",
  checkpointReached: "checkpoint_reached",
  setPresentationPhase: "set_phase",
  presentationHeartbeat: "heartbeat"
};

for (const [wrapper, action] of Object.entries(actions)) {
  assert.throws(
    () => verifyPresentationApiSource(
      mutateFunction(api, wrapper, (body) => body.replace("callFn", "notCallFn")),
      client
    ),
    new RegExp(wrapper),
    `${wrapper} must own an executable callFn boundary`
  );
  assert.throws(
    () => verifyPresentationApiSource(
      mutateFunction(api, wrapper, (body) => body.replace(`"${action}"`, '"mutated_action"')),
      client
    ),
    new RegExp(wrapper),
    `${wrapper} must carry its own exact action literal`
  );
}

assert.throws(
  () => verifyPresentationApiSource(
    api,
    client.replace("course_id: config.defaultCourseId", "course_id: body.course_id")
  ),
  /default course/,
  "callFn must inject the configured course id into every request"
);

console.log("verify-presentation-state-self-test: OK");

function mutateFunction(source, functionName, mutateBody) {
  const marker = `export function ${functionName}`;
  const start = source.lastIndexOf(marker);
  assert.notEqual(start, -1, `missing ${functionName} fixture`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `missing ${functionName} body fixture`);
  const bodyEnd = matchingBrace(source, bodyStart);
  return source.slice(0, bodyStart + 1)
    + mutateBody(source.slice(bodyStart + 1, bodyEnd))
    + source.slice(bodyEnd);
}

function matchingBrace(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("unbalanced fixture");
}
