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
const decoyFetchClient = replaceLast(
  client.replace(
    "const response = await fetch(",
    `if (false) {
    await fetch("https://decoy.invalid", {
      body: JSON.stringify({ course_id: config.defaultCourseId, ...body })
    });
  }
  const unsafeFetch = fetch;
  const response = await unsafeFetch(`
  ),
  "course_id: config.defaultCourseId",
  "course_id: body.course_id"
);
assert.throws(
  () => verifyPresentationApiSource(api, decoyFetchClient),
  /top-level response|direct fetch|alias fetch|six top-level statements/,
  "a dead safe fetch must not validate an unsafe aliased real request"
);
assert.throws(
  () => verifyPresentationApiSource(
    api,
    client.replace(
      "const response = await fetch(",
      "const request = fetch;\n  const response = await request("
    )
  ),
  /direct fetch|alias fetch|six top-level statements/,
  "the real request must call fetch directly rather than through an alias"
);
assert.throws(
  () => verifyPresentationApiSource(
    api,
    client.replace(
      "const response = await fetch(",
      'await fetch("https://second.invalid");\n  const response = await fetch('
    )
  ),
  /exactly one direct fetch|six top-level statements/,
  "callFn must reject a second direct fetch anywhere in its executable body"
);
assert.throws(
  () => verifyPresentationApiSource(
    api,
    client.replace(
      "const response = await fetch(",
      'await globalThis.fetch("https://escaped.invalid");\n  const response = await fetch('
    )
  ),
  /fetch reference|top-level statements|globalThis\.fetch/,
  "callFn must reject an additional globalThis.fetch request before the validated response"
);
assert.throws(
  () => verifyPresentationApiSource(
    api,
    client.replace(
      "const response = await fetch(",
      `const request = globalThis.fetch;
  await request("https://escaped.invalid");
  const response = await fetch(`
    )
  ),
  /fetch reference|top-level statements|globalThis\.fetch/,
  "callFn must reject a request aliased from globalThis.fetch before the validated response"
);
const validatedFetch = 'fetch(`${config.supabaseUrl}/functions/v1/${name}`, {';
for (const [label, mutatedFetch] of [
  [
    "element access",
    'fetch((globalThis["fetch"]("https://escaped.invalid"), `${config.supabaseUrl}/functions/v1/${name}`), {'
  ],
  [
    "bind reference",
    'fetch((fetch.bind(globalThis), `${config.supabaseUrl}/functions/v1/${name}`), {'
  ],
  [
    "call reference",
    'fetch((globalThis.fetch.call(globalThis, "https://escaped.invalid"), `${config.supabaseUrl}/functions/v1/${name}`), {'
  ],
  [
    "apply reference",
    'fetch((globalThis.fetch.apply(globalThis, ["https://escaped.invalid"]), `${config.supabaseUrl}/functions/v1/${name}`), {'
  ],
  [
    "destructured alias",
    'fetch((() => { const { fetch: destructuredRequest } = globalThis; return `${config.supabaseUrl}/functions/v1/${name}`; })(), {'
  ]
]) {
  assert.throws(
    () => verifyPresentationApiSource(
      api,
      client.replace(validatedFetch, mutatedFetch)
    ),
    /fetch reference|globalThis\.fetch|element.*fetch/,
    `callFn must reject an escaped fetch through ${label}`
  );
}
assert.doesNotThrow(
  () => verifyPresentationApiSource(
    api,
    `${client}
export async function unrelatedHelper() {
  return globalThis.fetch("https://outside-call-fn.invalid");
}`
  ),
  "fetch references outside the exported callFn implementation must remain out of scope"
);
assert.throws(
  () => verifyPresentationApiSource(api, client.replace("const response =", "const result =")),
  /top-level response/,
  "callFn must bind the real request to the response variable"
);
assert.throws(
  () => verifyPresentationApiSource(api, client.replace("response.json()", "otherResponse.json()")),
  /parse the same top-level response/,
  "callFn must parse the direct request's response"
);
assert.throws(
  () => verifyPresentationApiSource(api, client.replace("response.ok", "otherResponse.ok")),
  /top-level if \(!response\.ok\)|check the same top-level response status/,
  "callFn must check the direct request's response status"
);
assert.throws(
  () => verifyPresentationApiSource(api, client.replace("response.status", "otherResponse.status")),
  /ApiError status.*response\.status/,
  "callFn must source the thrown ApiError status from the direct response"
);
assert.throws(
  () => verifyPresentationApiSource(api, client.replace("return payload as T;", "return otherPayload as T;")),
  /final return.*payload/,
  "callFn must return the payload parsed from the direct response"
);
const decoyResponseClient = client
  .replace(
    "const payload = await response.json().catch(() => ({}));",
    `const unsafeFetch = fetch;
  const otherResponse = await unsafeFetch("https://real.invalid");
  if (false) {
    response.json();
    response.ok;
  }
  const payload = await otherResponse.json().catch(() => ({}));`
  )
  .replace("if (!response.ok)", "if (!otherResponse.ok)")
  .replace("response.status", "otherResponse.status");
assert.throws(
  () => verifyPresentationApiSource(api, decoyResponseClient),
  /exactly one fetch|alias fetch|top-level payload|same top-level response|response status|return the same payload|six top-level statements/,
  "a validated response fetch and dead consumers must not mask a second real network response"
);
assert.throws(
  () => verifyPresentationApiSource(
    api,
    client.replace(
      "{ course_id: config.defaultCourseId, ...body }",
      "{ ...body, course_id: config.defaultCourseId }"
    )
  ),
  /inject course then spread input|default course/,
  "request-body order must preserve the existing default-then-input contract"
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

function replaceLast(source, search, replacement) {
  const index = source.lastIndexOf(search);
  assert.notEqual(index, -1, `missing ${search} fixture`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}
