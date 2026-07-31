import assert from "node:assert/strict";
import ts from "typescript";

const wrappers = [
  {
    name: "controllerCurrent",
    payload: [
      ["action", "string", "controller_current"],
      ["class_session_id", "identifier", "classSessionId"]
    ]
  },
  {
    name: "projectorCurrent",
    payload: [
      ["action", "string", "projector_current"],
      ["class_session_id", "identifier", "classSessionId"]
    ]
  },
  {
    name: "requestSlide",
    payload: [
      ["action", "string", "request_slide"],
      ["class_session_id", "identifier", "classSessionId"],
      ["revision", "identifier", "revision"],
      ["requested_slide", "identifier", "requestedSlide"]
    ]
  },
  {
    name: "acknowledgeSlide",
    payload: [
      ["action", "string", "acknowledge_slide"],
      ["class_session_id", "identifier", "classSessionId"],
      ["revision", "identifier", "revision"],
      ["acknowledged_slide", "identifier", "acknowledgedSlide"]
    ]
  },
  {
    name: "checkpointReached",
    payload: [
      ["action", "string", "checkpoint_reached"],
      ["class_session_id", "identifier", "classSessionId"],
      ["revision", "identifier", "revision"],
      ["checkpoint_key", "identifier", "checkpointKey"],
      ["checkpoint_after_slide", "identifier", "checkpointAfterSlide"]
    ]
  },
  {
    name: "setPresentationPhase",
    payload: [
      ["action", "string", "set_phase"],
      ["class_session_id", "identifier", "classSessionId"],
      ["revision", "identifier", "revision"],
      ["phase", "identifier", "phase"]
    ]
  },
  {
    name: "presentationHeartbeat",
    payload: [
      ["action", "string", "heartbeat"],
      ["class_session_id", "identifier", "classSessionId"],
      ["revision", "identifier", "revision"],
      ["surface", "identifier", "surface"]
    ]
  }
];

export function verifyPresentationApiSource(apiSource, clientSource) {
  const api = parseTypeScript(apiSource, "presentation.ts");
  const client = parseTypeScript(clientSource, "client.ts");

  rejectBrowserPersistenceAndTables(api);

  for (const wrapper of wrappers) {
    const implementation = exportedImplementation(api, wrapper.name);
    assert.equal(
      implementation.body.statements.length,
      1,
      `${wrapper.name} must contain only its executable return boundary`
    );
    const statement = implementation.body.statements[0];
    assert.ok(
      ts.isReturnStatement(statement) && statement.expression,
      `${wrapper.name} must return its course-presentation request`
    );
    assertPresentationCall(statement.expression, wrapper);
  }

  assertCallFnImport(api);
  assertDefaultCourseInjection(client);
}

function parseTypeScript(source, fileName) {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  assert.equal(
    file.parseDiagnostics.length,
    0,
    `${fileName} must be valid TypeScript source`
  );
  return file;
}

function exportedImplementation(file, name) {
  const declarations = file.statements.filter((statement) =>
    ts.isFunctionDeclaration(statement)
    && statement.name?.text === name
    && hasModifier(statement, ts.SyntaxKind.ExportKeyword)
  );
  const implementations = declarations.filter((declaration) => declaration.body);
  assert.equal(
    implementations.length,
    1,
    `${name} must have exactly one exported executable implementation`
  );
  return implementations[0];
}

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function assertPresentationCall(expression, wrapper) {
  assert.ok(
    ts.isCallExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "callFn",
    `${wrapper.name} must return an actual callFn CallExpression`
  );
  assert.equal(expression.arguments.length, 2, `${wrapper.name} must pass endpoint and payload`);
  assert.ok(
    ts.isStringLiteral(expression.arguments[0])
    && expression.arguments[0].text === "course-presentation",
    `${wrapper.name} must call the literal course-presentation endpoint`
  );
  const payload = expression.arguments[1];
  assert.ok(ts.isObjectLiteralExpression(payload), `${wrapper.name} payload must be an object`);
  assert.equal(
    payload.properties.length,
    wrapper.payload.length,
    `${wrapper.name} must send only its exact payload fields`
  );
  wrapper.payload.forEach((expected, index) =>
    assertPayloadProperty(payload.properties[index], expected, wrapper.name)
  );
}

function assertPayloadProperty(property, expected, wrapperName) {
  const [expectedName, valueKind, expectedValue] = expected;
  if (ts.isShorthandPropertyAssignment(property)) {
    assert.equal(valueKind, "identifier", `${wrapperName}.${expectedName} has the wrong value kind`);
    assert.equal(property.name.text, expectedName, `${wrapperName} has the wrong payload field`);
    assert.equal(property.name.text, expectedValue, `${wrapperName}.${expectedName} has the wrong identifier`);
    return;
  }

  assert.ok(
    ts.isPropertyAssignment(property),
    `${wrapperName}.${expectedName} must be a property assignment or shorthand`
  );
  assert.equal(propertyName(property.name), expectedName, `${wrapperName} has the wrong payload field`);
  if (valueKind === "string") {
    assert.ok(
      ts.isStringLiteral(property.initializer) && property.initializer.text === expectedValue,
      `${wrapperName}.${expectedName} must use the exact string literal ${expectedValue}`
    );
  } else {
    assert.ok(
      ts.isIdentifier(property.initializer) && property.initializer.text === expectedValue,
      `${wrapperName}.${expectedName} must use identifier ${expectedValue}`
    );
  }
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return "";
}

function assertCallFnImport(file) {
  const imports = file.statements.filter((statement) =>
    ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === "./client"
  );
  const hasCallFn = imports.some((statement) => {
    const bindings = statement.importClause?.namedBindings;
    return ts.isNamedImports(bindings)
      && bindings.elements.some((element) =>
        element.name.text === "callFn"
        && (!element.propertyName || element.propertyName.text === "callFn")
      );
  });
  assert.equal(hasCallFn, true, "presentation API must import callFn from ./client");
}

function assertDefaultCourseInjection(file) {
  const implementation = exportedImplementation(file, "callFn");
  const implementationNodes = descendants(implementation.body);
  const fetchCalls = implementationNodes.filter((node) =>
    ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "fetch"
  );
  assert.equal(
    fetchCalls.length,
    1,
    "callFn must contain exactly one direct fetch CallExpression"
  );
  const fetchAliases = implementationNodes.filter((node) =>
    ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.initializer
    && ts.isIdentifier(unwrapExpression(node.initializer))
    && unwrapExpression(node.initializer).text === "fetch"
  );
  assert.equal(fetchAliases.length, 0, "callFn must not alias fetch to another network response source");
  const indirectFetchCalls = implementationNodes.filter((node) =>
    ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text !== "fetch"
    && /fetch$/i.test(node.expression.text)
  );
  assert.equal(
    indirectFetchCalls.length,
    0,
    "callFn must not call an aliased fetch network response source"
  );

  const responseDeclarations = implementation.body.statements.flatMap((statement, index) => {
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations
      .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "response")
      .map((declaration) => ({ declaration, index, statement }));
  });
  assert.equal(
    responseDeclarations.length,
    1,
    "callFn must have exactly one top-level response request statement"
  );
  const [{ declaration, index, statement }] = responseDeclarations;
  assert.ok(
    statement.declarationList.flags & ts.NodeFlags.Const,
    "callFn top-level response request must be const"
  );
  assert.ok(
    declaration.initializer
    && ts.isAwaitExpression(declaration.initializer)
    && ts.isCallExpression(declaration.initializer.expression)
    && ts.isIdentifier(declaration.initializer.expression.expression)
    && declaration.initializer.expression.expression.text === "fetch",
    "callFn top-level response must await a direct fetch call"
  );
  const fetchCall = declaration.initializer.expression;
  assert.equal(fetchCall.arguments.length, 2, "callFn direct fetch must receive URL and options");
  const options = fetchCall.arguments[1];
  assert.ok(ts.isObjectLiteralExpression(options), "callFn fetch options must be an object");
  const bodyProperty = options.properties.find((property) =>
    ts.isPropertyAssignment(property) && propertyName(property.name) === "body"
  );
  assert.ok(bodyProperty, "callFn fetch options must contain an executable body property");
  const stringify = bodyProperty.initializer;
  assert.ok(
    ts.isCallExpression(stringify)
    && ts.isPropertyAccessExpression(stringify.expression)
    && ts.isIdentifier(stringify.expression.expression)
    && stringify.expression.expression.text === "JSON"
    && stringify.expression.name.text === "stringify",
    "callFn body must execute JSON.stringify"
  );
  assert.equal(stringify.arguments.length, 1, "callFn JSON.stringify must receive one request object");
  const requestBody = stringify.arguments[0];
  assert.ok(ts.isObjectLiteralExpression(requestBody), "callFn request body must be an object");
  assert.equal(requestBody.properties.length, 2, "callFn request body must inject course then spread input");

  const [course, input] = requestBody.properties;
  assert.ok(
    ts.isPropertyAssignment(course)
    && propertyName(course.name) === "course_id"
    && ts.isPropertyAccessExpression(course.initializer)
    && ts.isIdentifier(course.initializer.expression)
    && course.initializer.expression.text === "config"
    && course.initializer.name.text === "defaultCourseId",
    "callFn must inject the default course into the executable request body"
  );
  assert.ok(
    ts.isSpreadAssignment(input)
    && ts.isIdentifier(input.expression)
    && input.expression.text === "body",
    "callFn must spread the caller body after the default course"
  );

  const responseFlow = implementation.body.statements.slice(index);
  assert.equal(
    responseFlow.length,
    4,
    "callFn direct response flow must contain only response, payload, status branch, and return"
  );

  const payloadStatement = responseFlow[1];
  assert.ok(
    ts.isVariableStatement(payloadStatement)
    && payloadStatement.declarationList.flags & ts.NodeFlags.Const
    && payloadStatement.declarationList.declarations.length === 1,
    "callFn must bind one top-level const payload immediately after the response"
  );
  const payloadDeclaration = payloadStatement.declarationList.declarations[0];
  assert.ok(
    ts.isIdentifier(payloadDeclaration.name)
    && payloadDeclaration.name.text === "payload",
    "callFn top-level payload must use the payload binding"
  );
  assertPayloadFromResponse(payloadDeclaration.initializer);

  const statusBranch = responseFlow[2];
  assert.ok(
    ts.isIfStatement(statusBranch)
    && isNegatedResponseOk(statusBranch.expression),
    "callFn must use a top-level if (!response.ok) status branch"
  );
  assert.ok(ts.isBlock(statusBranch.thenStatement), "callFn response error branch must be a block");
  const throws = statusBranch.thenStatement.statements.filter((statement) =>
    ts.isThrowStatement(statement)
  );
  assert.equal(throws.length, 1, "callFn response error branch must throw exactly one ApiError");
  const thrown = throws[0].expression;
  assert.ok(
    thrown
    && ts.isNewExpression(thrown)
    && ts.isIdentifier(thrown.expression)
    && thrown.expression.text === "ApiError",
    "callFn response error branch must throw ApiError"
  );
  assert.ok(
    thrown.arguments
    && thrown.arguments.length >= 2
    && isResponseProperty(thrown.arguments[1], "status"),
    "callFn ApiError status must come from response.status"
  );

  const finalReturn = responseFlow[3];
  assert.ok(
    ts.isReturnStatement(finalReturn)
    && finalReturn.expression
    && ts.isIdentifier(unwrapExpression(finalReturn.expression))
    && unwrapExpression(finalReturn.expression).text === "payload",
    "callFn final return must use the same top-level payload binding"
  );
}

function assertPayloadFromResponse(initializer) {
  assert.ok(
    initializer && ts.isAwaitExpression(initializer),
    "callFn top-level payload must await response.json().catch(...)"
  );
  const catchCall = initializer.expression;
  assert.ok(
    ts.isCallExpression(catchCall)
    && ts.isPropertyAccessExpression(catchCall.expression)
    && catchCall.expression.name.text === "catch"
    && catchCall.arguments.length === 1,
    "callFn top-level payload must await response.json().catch(...)"
  );
  const jsonCall = catchCall.expression.expression;
  assert.ok(
    ts.isCallExpression(jsonCall)
    && jsonCall.arguments.length === 0
    && ts.isPropertyAccessExpression(jsonCall.expression)
    && jsonCall.expression.name.text === "json"
    && ts.isIdentifier(jsonCall.expression.expression)
    && jsonCall.expression.expression.text === "response",
    "callFn top-level payload must parse the same top-level response"
  );
}

function isNegatedResponseOk(expression) {
  return ts.isPrefixUnaryExpression(expression)
    && expression.operator === ts.SyntaxKind.ExclamationToken
    && isResponseProperty(expression.operand, "ok");
}

function isResponseProperty(expression, name) {
  const unwrapped = unwrapExpression(expression);
  return ts.isPropertyAccessExpression(unwrapped)
    && ts.isIdentifier(unwrapped.expression)
    && unwrapped.expression.text === "response"
    && unwrapped.name.text === name;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function rejectBrowserPersistenceAndTables(file) {
  for (const node of descendants(file)) {
    assert.equal(
      ts.isIdentifier(node) && (node.text === "localStorage" || node.text === "sessionStorage"),
      false,
      "presentation API must not persist browser state"
    );
    assert.equal(
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "from",
      false,
      "presentation API must not query tables directly"
    );
  }
}

function descendants(root) {
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  return nodes;
}
