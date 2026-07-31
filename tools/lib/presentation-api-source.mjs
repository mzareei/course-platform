import assert from "node:assert/strict";

const wrappers = [
  {
    name: "controllerCurrent",
    payload: /^\s*action:\s*"controller_current",\s*class_session_id:\s*classSessionId\s*$/s
  },
  {
    name: "projectorCurrent",
    payload: /^\s*action:\s*"projector_current",\s*class_session_id:\s*classSessionId\s*$/s
  },
  {
    name: "requestSlide",
    payload: /^\s*action:\s*"request_slide",\s*class_session_id:\s*classSessionId,\s*revision,\s*requested_slide:\s*requestedSlide\s*$/s
  },
  {
    name: "acknowledgeSlide",
    payload: /^\s*action:\s*"acknowledge_slide",\s*class_session_id:\s*classSessionId,\s*revision,\s*acknowledged_slide:\s*acknowledgedSlide\s*$/s
  },
  {
    name: "checkpointReached",
    payload: /^\s*action:\s*"checkpoint_reached",\s*class_session_id:\s*classSessionId,\s*revision,\s*checkpoint_key:\s*checkpointKey,\s*checkpoint_after_slide:\s*checkpointAfterSlide\s*$/s
  },
  {
    name: "setPresentationPhase",
    payload: /^\s*action:\s*"set_phase",\s*class_session_id:\s*classSessionId,\s*revision,\s*phase\s*$/s
  },
  {
    name: "presentationHeartbeat",
    payload: /^\s*action:\s*"heartbeat",\s*class_session_id:\s*classSessionId,\s*revision,\s*surface\s*$/s
  }
];

export function verifyPresentationApiSource(apiSource, clientSource) {
  const api = stripSourceComments(apiSource);
  const client = stripSourceComments(clientSource);

  assert.doesNotMatch(
    api,
    /\blocalStorage\b|\bsessionStorage\b|\.from\s*\(/,
    "presentation API must not query tables or persist browser state"
  );
  assert.match(
    api,
    /import\s*\{\s*callFn\s*\}\s*from\s*["']\.\/client["']\s*;/,
    "presentation API must import the authenticated edge-function client"
  );

  for (const wrapper of wrappers) {
    const body = exportedFunctionBody(api, wrapper.name);
    const call = body.match(
      /^\s*return\s+callFn(?:<[\s\S]+?>)?\(\s*"course-presentation"\s*,\s*\{([\s\S]*?)\}\s*\)\s*;?\s*$/s
    );
    assert.ok(
      call,
      `${wrapper.name} must return its own executable callFn("course-presentation", payload)`
    );
    assert.match(
      call[1],
      wrapper.payload,
      `${wrapper.name} must send its exact action and snake_case payload`
    );
  }

  const callFnBody = exportedFunctionBody(client, "callFn");
  assert.match(
    callFnBody,
    /body:\s*JSON\.stringify\(\s*\{\s*course_id:\s*config\.defaultCourseId,\s*\.\.\.body\s*\}\s*\)/s,
    "callFn must inject the default course into the executable request body"
  );
}

export function stripSourceComments(source) {
  let output = "";
  let state = "code";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        output += "\n";
        state = "code";
      } else {
        output += " ";
      }
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (state === "single-quote" || state === "double-quote" || state === "template") {
      output += char;
      if (char === "\\") {
        if (index + 1 < source.length) {
          output += source[index + 1];
          index += 1;
        }
        continue;
      }
      if (
        (state === "single-quote" && char === "'")
        || (state === "double-quote" && char === '"')
        || (state === "template" && char === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line-comment";
    } else if (char === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block-comment";
    } else {
      output += char;
      if (char === "'") state = "single-quote";
      else if (char === '"') state = "double-quote";
      else if (char === "`") state = "template";
    }
  }

  return output;
}

function exportedFunctionBody(source, name) {
  const declaration = new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${name}\\s*(?:<[^{};()]*>)?\\s*\\(`,
    "g"
  );
  const matches = [...source.matchAll(declaration)];
  assert.ok(matches.length, `${name} must be an exported function`);

  // Overloaded functions place the executable implementation last.
  const match = matches.at(-1);
  const start = match.index;
  const parametersStart = start + match[0].lastIndexOf("(");
  const parametersEnd = matchingDelimiter(source, parametersStart, "(", ")");
  const bodyStart = source.indexOf("{", parametersEnd + 1);
  assert.notEqual(bodyStart, -1, `${name} must have an executable body`);
  const bodyEnd = matchingDelimiter(source, bodyStart, "{", "}");
  return source.slice(bodyStart + 1, bodyEnd);
}

function matchingDelimiter(source, start, open, close) {
  let depth = 0;
  let quote = null;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error(`${open}${close} delimiters are unbalanced`);
}
