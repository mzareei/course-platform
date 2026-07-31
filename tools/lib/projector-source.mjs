import assert from "node:assert/strict";
import ts from "typescript";

function parse(source, name) {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(file.parseDiagnostics.length, 0, `${name} must parse`);
  return file;
}

function exportedFunction(file, name) {
  const declaration = file.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name
  );
  assert.ok(declaration?.body, `${name} must be an executable function`);
  return declaration;
}

function callName(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    ? node.expression.text
    : null;
}

function descendants(node) {
  const found = [];
  const visit = (child) => {
    found.push(child);
    child.forEachChild(visit);
  };
  node.forEachChild(visit);
  return found;
}

function jsxNames(node) {
  return descendants(node).flatMap((child) => {
    if (!ts.isJsxOpeningElement(child) && !ts.isJsxSelfClosingElement(child)) return [];
    return ts.isIdentifier(child.tagName) ? [child.tagName.text] : [];
  });
}

function returnsComponent(statement, name) {
  const returned = [statement, ...descendants(statement)].find((node) => ts.isReturnStatement(node));
  return Boolean(returned && jsxNames(returned).includes(name));
}

export function verifyProjectorRouteSource(appSource) {
  const app = parse(appSource, "app.tsx");
  const appFunction = exportedFunction(app, "App");
  const first = appFunction.body.statements[0];
  assert.ok(ts.isIfStatement(first), "App must claim the projector route before all shell branches");
  assert.equal(callName(first.expression), "isProjectorRoute", "the first App branch must be the projector route");
  assert.match(first.expression.getText(app), /location\.pathname/, "the route claim must use the current pathname");
  assert.equal(returnsComponent(first.thenStatement, "ProjectorRoute"), true, "projector route claim must return its dedicated shell");

  const routeFunction = exportedFunction(app, "ProjectorRoute");
  const routeNodes = descendants(routeFunction.body);
  const authorized = routeNodes.find((node) =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "authorized"
  );
  assert.ok(authorized?.initializer, "ProjectorRoute must compute authorization before mounting Projector");
  const authorization = authorized.initializer.getText(app);
  for (const guard of ["booting.value", "session.value", "contextError.value", "roster_status", "surface.value"]) {
    assert.match(authorization, new RegExp(guard.replace(".", "\\.")), `ProjectorRoute authorization must include ${guard}`);
  }
  const denied = routeFunction.body.statements.find((statement) =>
    ts.isIfStatement(statement) && statement.expression.getText(app).replace(/\s/g, "") === "!authorized"
  );
  assert.ok(denied, "ProjectorRoute must explicitly reject unauthorized access");
  assert.equal(returnsComponent(denied.thenStatement, "ProjectorUnavailable"), true, "denied projector access must stay chrome-free");
  assert.equal(jsxNames(routeFunction.body).includes("Topbar"), false, "projector route shell must never render Topbar");
  assert.equal(jsxNames(routeFunction.body).includes("InstructorNav"), false, "projector route shell must never render InstructorNav");
  assert.equal(jsxNames(routeFunction.body).includes("StudentShell"), false, "projector route shell must never render StudentShell");
}

export function verifyProjectorSafetySource(projectorSource, pulseSource) {
  const projector = parse(projectorSource, "Projector.tsx");
  const pulse = parse(pulseSource, "ProjectorPulse.tsx");
  const projectorFunction = exportedFunction(projector, "Projector");
  const imports = projector.statements.filter(ts.isImportDeclaration);
  const presentationImport = imports.find((statement) =>
    ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === "../../api/presentation"
  );
  assert.ok(presentationImport, "projector must import its presentation API directly");
  const names = presentationImport.importClause?.namedBindings;
  assert.ok(ts.isNamedImports(names), "presentation imports must be named and auditable");
  const allowed = new Set([
    "projectorCurrent",
    "acknowledgeSlide",
    "checkpointReached",
    "presentationHeartbeat",
    "ProjectorPresentationState"
  ]);
  for (const specifier of names.elements) {
    assert.equal(specifier.propertyName, undefined, "projector must not alias presentation APIs");
    assert.equal(allowed.has(specifier.name.text), true, `projector import ${specifier.name.text} is not allowed`);
  }
  for (const statement of imports) {
    const path = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "";
    assert.equal(path === "../../api/pulse", false, "projector must not import pulse control APIs");
  }

  const calls = descendants(projectorFunction.body).map(callName).filter(Boolean);
  for (const required of ["projectorCurrent", "acknowledgeSlide", "checkpointReached", "presentationHeartbeat", "setInterval", "setTimeout", "setAckRetry", "setCheckpointRetry"]) {
    assert.equal(calls.includes(required), true, `projector must execute ${required}`);
  }
  const initialPoll = descendants(projectorFunction.body).find((node) =>
    ts.isExpressionStatement(node)
    && ts.isVoidExpression(node.expression)
    && callName(node.expression.expression) === "refresh"
  );
  assert.ok(initialPoll, "projector must execute the first poll immediately, not leave a dead decoy");
  assert.match(projectorSource, /const\s+POLL_MS\s*=\s*2000/, "projector polling must be two seconds");
  assert.match(projectorSource, /const\s+HEARTBEAT_MS\s*=\s*5000/, "projector heartbeat must be five seconds");
  assert.match(projectorSource, /const\s+MAX_TELEMETRY_RETRIES\s*=\s*[1-9]/, "telemetry retries must be bounded");
  assert.match(projectorSource, /clearTimeout\(ackRetryTimer\.current\)/, "ack retry timer must be cancelled");
  assert.match(projectorSource, /clearTimeout\(checkpointRetryTimer\.current\)/, "checkpoint retry timer must be cancelled");
  for (const forbidden of ["controllerCurrent", "requestSlide", "setPresentationPhase", "callFn", "CheckpointPanel", "pulseResults", "closePulse", "revealPulse", "pushBankQuestion"]) {
    assert.equal(calls.includes(forbidden), false, `projector must not execute ${forbidden}`);
  }
  assert.equal(jsxNames(projectorFunction.body).includes("button"), false, "projector must not render controls");

  const pulseFunction = exportedFunction(pulse, "ProjectorPulse");
  const revealed = descendants(pulseFunction.body).find((node) =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "revealed"
  );
  assert.ok(revealed?.initializer, "pulse must derive a revealed flag from server state");
  assert.match(revealed.initializer.getText(pulse), /^pulse\.state\s*===\s*["']revealed["']$/, "revealed flag must be coupled to pulse.state");
  const sourceText = pulseFunction.body.getText(pulse);
  assert.match(sourceText, /revealed\s*\?[^:]*pulse\.correct_option/s, "correct option must be read only under revealed guard");
  assert.match(sourceText, /revealed\s*\?[\s\S]*projector-pulse-reveal/s, "reveal UI must be conditionally mounted from the revealed guard");
  assert.match(sourceText, /key=\{option\.key\}/, "projector options need stable keys");
  assert.equal(jsxNames(pulseFunction.body).includes("button"), false, "projector pulse must not render controls");
}
