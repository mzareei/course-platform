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

function isImmediateMountRefresh(node) {
  const statement = node;
  const block = statement?.parent;
  const callback = block?.parent;
  const effect = callback?.parent;
  const prior = ts.isBlock(block)
    ? block.statements.slice(0, block.statements.indexOf(statement))
    : [];
  return Boolean(
    ts.isExpressionStatement(statement)
    && ts.isBlock(block)
    && ts.isArrowFunction(callback)
    && ts.isCallExpression(effect)
    && callName(effect) === "useEffect"
    // The first refresh must be a top-level, reachable statement in the
    // effect callback.  Allowing an `if (...) return` before it creates a
    // convincing-looking but dead poll fixture.
    && prior.every((candidate) => {
      if (ts.isReturnStatement(candidate) || ts.isThrowStatement(candidate)) return false;
      if (!ts.isIfStatement(candidate)) return true;
      if (!ts.isReturnStatement(candidate.thenStatement) && !ts.isThrowStatement(candidate.thenStatement)) return true;
      const condition = candidate.expression.getText().replace(/\s/g, "");
      return condition === "!classSessionId" || condition === "!isActiveSession(classSessionId,sessionGeneration)";
    })
    && block.statements.includes(statement)
  );
}

function isDominatedByReveal(node, source) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isConditionalExpression(current)
      && current.condition.getText(source).trim() === "revealed"
      && node.pos >= current.whenTrue.pos
      && node.end <= current.whenTrue.end
    ) return true;
  }
  return false;
}

function sensitiveName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) return argument.text;
  }
  if (ts.isBindingElement(node)) {
    const property = node.propertyName;
    if (ts.isIdentifier(property) || ts.isStringLiteral(property)) return property.text;
  }
  return "sensitive field";
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
  const presentationImports = imports.filter((statement) =>
    ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === "../../api/presentation"
  );
  assert.equal(presentationImports.length, 1, "projector must have exactly one presentation API import");
  const [presentationImport] = presentationImports;
  assert.ok(presentationImport, "projector must import its presentation API directly");
  assert.equal(Boolean(presentationImport.importClause?.name), false, "projector must not default-import presentation APIs");
  const names = presentationImport.importClause?.namedBindings;
  assert.ok(ts.isNamedImports(names), "presentation imports must be named and auditable");
  const allowed = new Set([
    "projectorCurrent",
    "acknowledgeSlide",
    "checkpointReached",
    "presentationHeartbeat",
    "requestSlide",
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

  const presentationNamespaces = new Set(
    presentationImports.flatMap((statement) => {
      const bindings = statement.importClause?.namedBindings;
      return ts.isNamespaceImport(bindings) ? [bindings.name.text] : [];
    })
  );
  for (const node of descendants(projectorFunction.body)) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) continue;
    const target = node.expression.expression;
    const member = node.expression.name.text;
    assert.equal(
      ts.isIdentifier(target) && presentationNamespaces.has(target.text),
      false,
      `projector must not call presentation APIs through ${target.getText(projector)}.${member}`
    );
  }

  const calls = descendants(projectorFunction.body).map(callName).filter(Boolean);
  for (const required of ["projectorCurrent", "acknowledgeSlide", "checkpointReached", "presentationHeartbeat", "requestSlide", "setInterval", "setTimeout", "setAckRetry", "setCheckpointRetry"]) {
    assert.equal(calls.includes(required), true, `projector must execute ${required}`);
  }
  const initialPoll = descendants(projectorFunction.body).find((node) =>
    ts.isExpressionStatement(node)
    && ts.isVoidExpression(node.expression)
    && callName(node.expression.expression) === "refresh"
    && isImmediateMountRefresh(node)
  );
  assert.ok(initialPoll, "projector must execute the first poll immediately, not leave a dead decoy");
  const activeSession = descendants(projectorFunction.body).find((node) =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "sessionGeneration"
  );
  assert.ok(activeSession?.initializer, "projector must bind telemetry to the active session generation");
  assert.match(activeSession.initializer.getText(projector), /activeSession\.current\.generation/, "session generation must come from the active identity");
  const sessionPresentation = descendants(projectorFunction.body).find((node) =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "presentationForSession"
  );
  assert.ok(sessionPresentation?.initializer, "projector must reject presentation state from another session");
  assert.match(sessionPresentation.initializer.getText(projector), /presentation\?\.session_id\s*===\s*classSessionId/, "presentation must match the active session id");
  const bridgeIdentity = descendants(projectorFunction.body).find((node) =>
    ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === "bridgeBelongsToSession"
  );
  assert.ok(bridgeIdentity?.initializer, "projector must bind the deck bridge to the active session generation");
  assert.match(bridgeIdentity.initializer.getText(projector), /bridgeSession\.(id|generation)/, "bridge identity must come from the session-bound bridge state");
  for (const telemetry of ["acknowledgeSlide", "checkpointReached"]) {
    const attempt = descendants(projectorFunction.body).find((node) => callName(node) === telemetry);
    assert.ok(attempt, `projector must execute ${telemetry}`);
    let scope = attempt.parent;
    while (scope && !ts.isArrowFunction(scope)) scope = scope.parent;
    assert.ok(scope, `${telemetry} must be inside a guarded effect callback`);
    const effectBody = scope.body.getText(projector);
    assert.match(effectBody, /isActiveSession\(classSessionId, sessionGeneration\)/, `${telemetry} must verify active session generation`);
    assert.ok((effectBody.match(/bridgeBelongsToSession/g) || []).length >= 4, `${telemetry} must verify bridge session identity on initial attempt, completion, failure, and retry`);
  }
  assert.match(projectorSource, /const\s+POLL_MS\s*=\s*750/, "projector polling must be responsive");
  assert.match(projectorSource, /const\s+HEARTBEAT_MS\s*=\s*5000/, "projector heartbeat must be five seconds");
  assert.match(projectorSource, /const\s+MAX_TELEMETRY_RETRIES\s*=\s*[1-9]/, "telemetry retries must be bounded");
  assert.match(projectorSource, /clearTimeout\(ackRetryTimer\.current\)/, "ack retry timer must be cancelled");
  assert.match(projectorSource, /clearTimeout\(checkpointRetryTimer\.current\)/, "checkpoint retry timer must be cancelled");
  const forbiddenMembers = new Set(["controllerCurrent", "requestSlide", "setPresentationPhase", "callFn", "CheckpointPanel", "pulseResults", "closePulse", "revealPulse", "pushBankQuestion"]);
  const forbiddenAliases = new Set();
  const forbiddenKeys = new Map();
  for (const node of descendants(projectorFunction.body)) {
    if (!ts.isVariableDeclaration(node)) continue;
    if (ts.isIdentifier(node.name) && node.initializer) {
      if (ts.isPropertyAccessExpression(node.initializer) && forbiddenMembers.has(node.initializer.name.text)) {
        forbiddenAliases.add(node.name.text);
      }
      if (ts.isStringLiteral(node.initializer) && forbiddenMembers.has(node.initializer.text)) {
        forbiddenKeys.set(node.name.text, node.initializer.text);
      }
    }
    if (!ts.isObjectBindingPattern(node.name)) continue;
    for (const element of node.name.elements) {
      if (!ts.isBindingElement(element)) continue;
      const property = element.propertyName;
      const name = element.name;
      const propertyText = property && (ts.isIdentifier(property) || ts.isStringLiteral(property))
        ? property.text
        : null;
      if (propertyText && forbiddenMembers.has(propertyText) && ts.isIdentifier(name)) {
        forbiddenAliases.add(name.text);
      }
    }
  }
  for (const node of descendants(projectorFunction.body)) {
    if (!ts.isCallExpression(node)) continue;
    const expression = node.expression;
    if (ts.isPropertyAccessExpression(expression) && forbiddenMembers.has(expression.name.text)) {
      assert.fail(`projector must not execute forbidden member ${expression.name.text}`);
    }
    if (ts.isElementAccessExpression(expression)) {
      const argument = expression.argumentExpression;
      const member = ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)
        ? argument.text
        : ts.isIdentifier(argument) && forbiddenKeys.has(argument.text)
          ? forbiddenKeys.get(argument.text)
          : argument.getText(projector);
      if (forbiddenMembers.has(member)) assert.fail(`projector must not execute forbidden member ${member}`);
    }
  }
  for (const node of descendants(projectorFunction.body)) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      assert.equal(forbiddenAliases.has(node.expression.text), false, `projector must not execute aliased forbidden member ${node.expression.text}`);
    }
  }
  for (const forbidden of ["controllerCurrent", "setPresentationPhase", "callFn", "CheckpointPanel", "pulseResults", "closePulse", "revealPulse", "pushBankQuestion"]) {
    assert.equal(calls.includes(forbidden), false, `projector must not execute ${forbidden}`);
  }
  assert.equal(jsxNames(projectorFunction.body).includes("button"), false, "projector must not render controls");

  const pulseFunction = exportedFunction(pulse, "ProjectorPulse");
  for (const node of [pulseFunction, ...descendants(pulseFunction)]) {
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === "revealed") {
      assert.fail("revealed must not be shadowed by a parameter");
    }
  }
  const revealed = descendants(pulseFunction.body).find((node) =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "revealed"
  );
  assert.ok(revealed?.initializer, "pulse must derive a revealed flag from server state");
  assert.match(revealed.initializer.getText(pulse), /^pulse\.state\s*===\s*["']revealed["']$/, "revealed flag must be coupled to pulse.state");
  const sensitive = new Set(["correct_option", "explanation", "explanation_es"]);
  const reads = descendants(pulseFunction.body).filter((node) => {
    if (ts.isPropertyAccessExpression(node)) return sensitive.has(node.name.text);
    if (ts.isElementAccessExpression(node)) {
      const argument = node.argumentExpression;
      if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
        return sensitive.has(argument.text);
      }
    }
    if (ts.isBindingElement(node)) {
      const property = node.propertyName;
      return Boolean(
        (ts.isIdentifier(property) && sensitive.has(property.text))
        || (ts.isStringLiteral(property) && sensitive.has(property.text))
      );
    }
    return false;
  });
  assert.ok(reads.length > 0, "projector pulse must render server-provided reveal data");
  const revealedDeclarations = descendants(pulseFunction.body).filter((node) =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "revealed"
  );
  assert.equal(revealedDeclarations.length, 1, "revealed must have one server-derived binding");
  for (const read of reads) {
    assert.equal(isDominatedByReveal(read, pulse), true, `${sensitiveName(read)} must only be read inside the revealed branch`);
  }
  const sourceText = pulseFunction.body.getText(pulse);
  assert.match(sourceText, /revealed\s*\?[\s\S]*projector-pulse-reveal/s, "reveal UI must be conditionally mounted from the revealed guard");
  assert.match(sourceText, /key=\{option\.key\}/, "projector options need stable keys");
  assert.equal(jsxNames(pulseFunction.body).includes("button"), false, "projector pulse must not render controls");
}
