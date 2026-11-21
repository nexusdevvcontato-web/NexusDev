'use strict';

const acorn = require('acorn');

const RESPONSE_MOCKS = new WeakMap();

const LIMITS = Object.freeze({ sourceBytes: 50_000, astNodes: 2_000, depth: 80, steps: 10_000, arrayLength: 1_000, stringLength: 10_000 });

class EvaluationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function safeValue(value, depth = 0, allowNonFiniteInput = false) {
  if (value && typeof value === 'object' && RESPONSE_MOCKS.has(value)) return value;
  if (depth > LIMITS.depth) throw new EvaluationError('value-depth-limit');
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'number' && !Number.isFinite(value) && !allowNonFiniteInput) throw new EvaluationError('invalid-number');
    if (typeof value === 'string' && value.length > LIMITS.stringLength) throw new EvaluationError('string-limit');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > LIMITS.arrayLength) throw new EvaluationError('array-limit');
    return value.map((item) => safeValue(item, depth + 1, allowNonFiniteInput));
  }
  if (typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const out = Object.create(null);
    for (const key of Object.keys(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new EvaluationError('unsafe-property');
      out[key] = safeValue(value[key], depth + 1, allowNonFiniteInput);
    }
    return out;
  }
  throw new EvaluationError('unsupported-value');
}

function bounded(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new EvaluationError('invalid-number');
  if (typeof value === 'string' && value.length > LIMITS.stringLength) throw new EvaluationError('string-limit');
  return value;
}

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a).sort(); const bk = Object.keys(b).sort();
    return ak.length === bk.length && ak.every((k, i) => k === bk[i] && equal(a[k], b[k]));
  }
  return false;
}

function parseSolution(source, exportName) {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > LIMITS.sourceBytes) throw new EvaluationError('source-limit');
  let ast;
  try { ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script', allowHashBang: false }); }
  catch (_) { throw new EvaluationError('syntax-error'); }
  let count = 0;
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') {
      const allowed = new Set(['Program','FunctionDeclaration','VariableDeclaration','VariableDeclarator','Identifier','BlockStatement','ReturnStatement','IfStatement','EmptyStatement','ExpressionStatement','AssignmentExpression','Literal','ArrayExpression','ObjectExpression','Property','SpreadElement','UnaryExpression','BinaryExpression','LogicalExpression','ConditionalExpression','MemberExpression','CallExpression','ArrowFunctionExpression','FunctionExpression']);
      if (!allowed.has(node.type)) throw new EvaluationError('unsupported-syntax');
      count += 1;
      if (count > LIMITS.astNodes) throw new EvaluationError('ast-node-limit');
      if (depth > LIMITS.depth) throw new EvaluationError('ast-depth-limit');
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue;
      if (Array.isArray(value)) for (const child of value) visit(child, depth + 1);
      else if (value && typeof value === 'object') visit(value, depth + 1);
    }
  };
  visit(ast);
  if (ast.body.length !== 1) throw new EvaluationError('one-function-required');
  const declaration = ast.body[0];
  if (declaration.type === 'FunctionDeclaration' && declaration.id?.name === exportName) return declaration;
  if (declaration.type === 'VariableDeclaration' && declaration.declarations.length === 1 &&
      declaration.declarations[0].id.type === 'Identifier' && declaration.declarations[0].id.name === exportName &&
      declaration.declarations[0].init && ['ArrowFunctionExpression', 'FunctionExpression'].includes(declaration.declarations[0].init.type)) {
    return declaration.declarations[0].init;
  }
  throw new EvaluationError('expected-function-export');
}

function executeFunction(fn, args, budget, options = {}) {
  if (fn.async || fn.generator) throw new EvaluationError('unsupported-function-kind');
  const scope = new Map();
  const parentScope = options.parentScope || null;
  const params = fn.params;
  if (params.some((p) => p.type !== 'Identifier') || args.length > params.length) throw new EvaluationError('unsupported-parameters');
  params.forEach((p, i) => scope.set(p.name, safeValue(args[i] === undefined ? null : args[i], 0, true)));
  const tick = () => { budget.steps += 1; if (budget.steps > LIMITS.steps) throw new EvaluationError('step-limit'); };
  const lookup = (name) => { if (scope.has(name)) return scope.get(name); if (parentScope?.has(name)) return parentScope.get(name); throw new EvaluationError('unknown-identifier'); };
  const assign = (name, value) => { if (!scope.has(name)) throw new EvaluationError('unknown-assignment'); scope.set(name, value); return value; };
  const evalExpr = (node, depth = 0) => {
    tick(); if (depth > LIMITS.depth) throw new EvaluationError('evaluation-depth-limit');
    switch (node.type) {
      case 'Literal': return node.value;
      case 'Identifier': return lookup(node.name);
      case 'ArrayExpression': {
        if (node.elements.length > LIMITS.arrayLength || node.elements.some((x) => !x)) throw new EvaluationError('unsupported-array');
        const out = [];
        for (const element of node.elements) {
          if (element.type === 'SpreadElement') {
            const spread = evalExpr(element.argument, depth + 1);
            if (!Array.isArray(spread)) throw new EvaluationError('invalid-array-spread');
            if (out.length + spread.length > LIMITS.arrayLength) throw new EvaluationError('array-limit');
            out.push(...spread.map((item) => safeValue(item)));
          } else {
            out.push(evalExpr(element, depth + 1));
          }
        }
        return out;
      }
      case 'ObjectExpression': {
        const out = Object.create(null);
        for (const prop of node.properties) {
          if (prop.type === 'SpreadElement') {
            const spread = evalExpr(prop.argument, depth + 1);
            if (!spread || typeof spread !== 'object' || Array.isArray(spread) ||
                ![null, Object.prototype].includes(Object.getPrototypeOf(spread))) {
              throw new EvaluationError('invalid-object-spread');
            }
            for (const key of Object.keys(spread)) {
              if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new EvaluationError('unsafe-property');
              out[key] = safeValue(spread[key]);
            }
            continue;
          }
          if (prop.type !== 'Property' || prop.computed || prop.kind !== 'init' || prop.method ||
              (!prop.shorthand && !['Identifier', 'Literal'].includes(prop.key.type))) {
            throw new EvaluationError('unsupported-object-property');
          }
          const key = String(prop.key.name ?? prop.key.value);
          if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new EvaluationError('unsafe-property');
          out[key] = evalExpr(prop.value, depth + 1);
        }
        return out;
      }
      case 'UnaryExpression': {
        if (node.operator === 'typeof') {
          // typeof on an unresolved identifier is safe and returns "undefined";
          // no other identifier lookup is relaxed.
          if (node.argument.type === 'Identifier' && !scope.has(node.argument.name) && !parentScope?.has(node.argument.name)) return 'undefined';
          return typeof evalExpr(node.argument, depth + 1);
        }
        const value = evalExpr(node.argument, depth + 1);
        if (node.operator === '!') return !value;
        if (node.operator === '-') return bounded(-value);
        if (node.operator === '+') return bounded(+value);
        throw new EvaluationError('unsupported-unary');
      }
      case 'BinaryExpression': {
        const a = evalExpr(node.left, depth + 1); const b = evalExpr(node.right, depth + 1);
        switch (node.operator) {
          case '+': return bounded(typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : a + b);
          case '-': return bounded(a - b); case '*': return bounded(a * b); case '/': return bounded(a / b); case '%': return bounded(a % b);
          case '===': return a === b; case '!==': return a !== b;
          case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
          default: throw new EvaluationError('unsupported-binary');
        }
      }
      case 'LogicalExpression': {
        const a = evalExpr(node.left, depth + 1);
        if (node.operator === '&&') return a && evalExpr(node.right, depth + 1);
        if (node.operator === '||') return a || evalExpr(node.right, depth + 1);
        throw new EvaluationError('unsupported-logical');
      }
      case 'ConditionalExpression': return evalExpr(node.test, depth + 1) ? evalExpr(node.consequent, depth + 1) : evalExpr(node.alternate, depth + 1);
      case 'MemberExpression': {
        if (node.computed) {
          const object = evalExpr(node.object, depth + 1); const key = evalExpr(node.property, depth + 1);
          if (!Array.isArray(object) || !Number.isInteger(key) || key < 0 || key >= object.length) throw new EvaluationError('unsupported-member');
          return object[key];
        }
        const object = evalExpr(node.object, depth + 1);
        if (node.property.name === 'length' && (Array.isArray(object) || typeof object === 'string')) return object.length;
        if (object && typeof object === 'object' && !Array.isArray(object) &&
            [null, Object.prototype].includes(Object.getPrototypeOf(object)) &&
            typeof node.property.name === 'string' &&
            !['__proto__', 'prototype', 'constructor'].includes(node.property.name)) {
          // Plain-object reads follow JavaScript semantics: absent own keys yield undefined.
          // Prototype traversal remains impossible because only own data is read.
          return Object.prototype.hasOwnProperty.call(object, node.property.name)
            ? object[node.property.name]
            : undefined;
        }
        throw new EvaluationError('unsupported-member');
      }
      case 'CallExpression': {
        if (node.optional || node.arguments.some((a) => a.type === 'SpreadElement') ||
            node.callee.type !== 'MemberExpression' || node.callee.computed) {
          throw new EvaluationError('unsupported-call');
        }
        const method = node.callee.property.name;
        if (node.callee.object.type === 'Identifier' && node.callee.object.name === 'Number' &&
            method === 'isFinite' && node.arguments.length === 1) {
          return Number.isFinite(evalExpr(node.arguments[0], depth + 1));
        }
        const target = evalExpr(node.callee.object, depth + 1);
        if (target instanceof RegExp && method === 'test' && node.arguments.length === 1) {
          const allowedPatterns = new Set([
            '[A-Z]', '[a-z]', '[0-9]',
            '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            '^\\S+$'
          ]);
          if (!allowedPatterns.has(target.source) || target.flags !== '') {
            throw new EvaluationError('unsupported-regex');
          }
          const input = evalExpr(node.arguments[0], depth + 1);
          if (typeof input !== 'string') throw new EvaluationError('invalid-regex-input');
          return target.test(input);
        }
        if (target && typeof target === 'object' && RESPONSE_MOCKS.has(target)) {
          const args = node.arguments.map((arg) => evalExpr(arg, depth + 1));
          const response = RESPONSE_MOCKS.get(target);
          if (method === 'status' && args.length === 1 && Number.isInteger(args[0]) && args[0] >= 100 && args[0] <= 599) {
            response.status = args[0];
            return target;
          }
          if (method === 'json' && args.length === 1) {
            response.body = safeValue(args[0]);
            response.sent = true;
            return target;
          }
          throw new EvaluationError('unsupported-response-method');
        }
        const callArgs = typeof target === 'string'
          ? node.arguments.map((arg) => evalExpr(arg, depth + 1))
          : node.arguments.slice(1).map((arg) => evalExpr(arg, depth + 1));
        if (typeof target === 'string') {
          if (['trim', 'toLowerCase', 'toUpperCase'].includes(method) && callArgs.length === 0) {
            const result = method === 'trim' ? target.trim() :
              method === 'toLowerCase' ? target.toLowerCase() : target.toUpperCase();
            return bounded(result);
          }
          if (['includes', 'startsWith', 'endsWith'].includes(method) && callArgs.length >= 1 && callArgs.length <= 2) {
            if (typeof callArgs[0] !== 'string' || (callArgs.length === 2 && !Number.isInteger(callArgs[1]))) {
              throw new EvaluationError('invalid-string-argument');
            }
            return method === 'includes' ? target.includes(callArgs[0], callArgs[1]) :
              method === 'startsWith' ? target.startsWith(callArgs[0], callArgs[1]) :
              target.endsWith(callArgs[0], callArgs[1]);
          }
          if (method === 'split' && node.arguments.length <= 2) {
            if (node.arguments.length === 0) return [target];
            let separator;
            const separatorNode = node.arguments[0];
            if (separatorNode.type === 'Literal' && typeof separatorNode.value === 'string') {
              separator = separatorNode.value;
            } else if (separatorNode.type === 'Literal' && separatorNode.regex &&
                separatorNode.regex.pattern === '\\s+' && separatorNode.regex.flags === '') {
              // Deliberately allow only this fixed, linear whitespace pattern.
              separator = /\s+/;
            } else {
              throw new EvaluationError('invalid-split-argument');
            }
            const limit = node.arguments.length === 2 ? evalExpr(node.arguments[1], depth + 1) : undefined;
            if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) throw new EvaluationError('invalid-split-argument');
            const parts = target.split(separator, limit);
            if (parts.length > LIMITS.arrayLength) throw new EvaluationError('array-limit');
            return parts.map((part) => bounded(part));
          }
          throw new EvaluationError('unsupported-string-method');
        }
        if (Array.isArray(target) && method === 'slice') {
          if (node.arguments.length > 2) throw new EvaluationError('invalid-slice-arguments');
          const start = node.arguments.length === 0 ? 0 : evalExpr(node.arguments[0], depth + 1);
          const end = node.arguments.length < 2 ? target.length : evalExpr(node.arguments[1], depth + 1);
          if (!Number.isInteger(start) || start < 0 || !Number.isInteger(end) || end < 0) {
            throw new EvaluationError('invalid-slice-arguments');
          }
          return target.slice(Math.min(start, target.length), Math.min(end, target.length))
            .map((item) => safeValue(item));
        }
        if (!Array.isArray(target) || node.arguments.length < 1 ||
            !['reduce', 'map', 'filter', 'some', 'find'].includes(method) ||
            node.arguments.length > (method === 'reduce' ? 2 : 1)) {
          throw new EvaluationError('unsupported-call-target');
        }
        const callback = node.arguments[0];
        if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(callback.type) || callback.async || callback.generator ||
            callback.params.length < (method === 'reduce' ? 2 : 1) || callback.params.length > 2 ||
            callback.params.some((p) => p.type !== 'Identifier')) throw new EvaluationError('unsupported-array-callback');
        if (method === 'reduce') {
          let accumulator;
          let index;
          if (node.arguments.length === 2) { accumulator = callArgs[0]; index = 0; }
          else { if (!target.length) throw new EvaluationError('reduce-empty-without-initial'); accumulator = target[0]; index = 1; }
          for (; index < target.length; index += 1) {
            tick();
            accumulator = executeFunction(callback, [accumulator, target[index]], budget, { parentScope: scope });
          }
          return bounded(accumulator);
        }
        if (target.length > LIMITS.arrayLength) throw new EvaluationError('array-limit');
        const output = [];
        for (let index = 0; index < target.length; index += 1) {
          tick();
          const callbackArgs = [target[index], index].slice(0, callback.params.length);
          const result = executeFunction(callback, callbackArgs, budget, { parentScope: scope });
          if (method === 'map') output.push(safeValue(result));
          else if (method === 'filter' && result) output.push(target[index]);
          else if (method === 'some' && result) return true;
          else if (method === 'find' && result) return safeValue(target[index]);
          if (output.length > LIMITS.arrayLength) throw new EvaluationError('array-limit');
        }
        return method === 'some' ? false : (method === 'find' ? null : output);
      }
      default: throw new EvaluationError('unsupported-expression');
    }
  };
  const execStatement = (node, depth = 0) => {
    tick(); if (depth > LIMITS.depth) throw new EvaluationError('evaluation-depth-limit');
    switch (node.type) {
      case 'BlockStatement':
        for (const statement of node.body) { const result = execStatement(statement, depth + 1); if (result.returned) return result; }
        return { returned: false };
      case 'VariableDeclaration':
        for (const declaration of node.declarations) {
          if (declaration.id.type !== 'Identifier' || scope.has(declaration.id.name) || !declaration.init) throw new EvaluationError('unsupported-declaration');
          scope.set(declaration.id.name, evalExpr(declaration.init, depth + 1));
        }
        return { returned: false };
      case 'ReturnStatement': return { returned: true, value: node.argument ? evalExpr(node.argument, depth + 1) : null };
      case 'IfStatement':
        return execStatement(evalExpr(node.test, depth + 1) ? node.consequent : (node.alternate || { type: 'EmptyStatement' }), depth + 1);
      case 'ExpressionStatement':
        if (node.expression.type !== 'AssignmentExpression' || node.expression.operator !== '=' || node.expression.left.type !== 'Identifier') throw new EvaluationError('unsupported-statement');
        assign(node.expression.left.name, evalExpr(node.expression.right, depth + 1)); return { returned: false };
      case 'EmptyStatement': return { returned: false };
      default: throw new EvaluationError('unsupported-statement');
    }
  };
  const body = fn.body.type === 'BlockStatement' ? fn.body : { type: 'BlockStatement', body: [{ type: 'ReturnStatement', argument: fn.body }] };
  const result = execStatement(body);
  const value = result.returned && result.value && typeof result.value === 'object' &&
    RESPONSE_MOCKS.has(result.value) ? result.value : (result.returned ? safeValue(result.value) : null);
  if (options.includeFinalArgs === true) {
    return { value, finalArgs: params.map((param) => safeValue(scope.get(param.name))) };
  }
  if (options.controllerResponse) {
    return { status: options.controllerResponse.status, body: options.controllerResponse.body, sent: options.controllerResponse.sent };
  }
  return value;
}

function evaluateChallenge({ challengeId, source }) {
  const { getChallengeSpec } = require('./challenge-registry');
  const spec = getChallengeSpec(challengeId);
  const tests = spec?.tests;
  if (!spec || spec.language !== 'javascript' || !spec.exportName || !Array.isArray(tests) || tests.length === 0 ||
      tests.some((test) => !['function-cases', 'function-deep-equals', 'does-not-mutate-input', 'http-controller-case'].includes(test.type))) {
    return { ok: false, reason: 'unsupported-challenge' };
  }
  try {
    const fn = parseSolution(source, spec.exportName);
    for (const test of tests) {
      if (test.type === 'http-controller-case') {
        if (!Number.isInteger(test.expectedStatus) || test.expectedStatus < 100 || test.expectedStatus > 599 ||
            (Object.prototype.hasOwnProperty.call(test, 'body') && (!test.body || typeof test.body !== 'object' || Array.isArray(test.body)))) {
          return { ok: false, reason: 'invalid-test-spec' };
        }
        const responseState = { status: 200, body: null, sent: false };
        const responseMock = Object.create(null);
        RESPONSE_MOCKS.set(responseMock, responseState);
        const requestMock = safeValue({ body: test.body ?? {}, params: test.params ?? {} });
        const extraArgs = Array.isArray(test.extraArgs) ? safeValue(test.extraArgs) : [];
        const result = executeFunction(fn, [requestMock, responseMock, ...extraArgs], { steps: 0 }, { controllerResponse: responseState });
        if (!result.sent || result.status !== test.expectedStatus) return { ok: false, reason: 'tests-failed' };
        if (Object.prototype.hasOwnProperty.call(test, 'expectedBody') && !equal(result.body, test.expectedBody)) {
          return { ok: false, reason: 'tests-failed' };
        }
        if (Object.prototype.hasOwnProperty.call(test, 'expectedBodyIncludes')) {
          if (!result.body || typeof result.body !== 'object' ||
              !Object.prototype.hasOwnProperty.call(result.body, test.expectedBodyIncludes)) {
            return { ok: false, reason: 'tests-failed' };
          }
        }
      } else if (test.type === 'function-cases') {
        if (!Array.isArray(test.cases) || test.cases.length === 0) return { ok: false, reason: 'unsupported-challenge' };
        for (const testCase of test.cases) {
          if (!Array.isArray(testCase.args)) return { ok: false, reason: 'invalid-test-spec' };
          const actual = executeFunction(fn, testCase.args, { steps: 0 });
          if (!equal(actual, testCase.expected)) return { ok: false, reason: 'tests-failed' };
        }
      } else if (test.type === 'function-deep-equals') {
        if (!Array.isArray(test.args) || !Object.prototype.hasOwnProperty.call(test, 'expected')) {
          return { ok: false, reason: 'invalid-test-spec' };
        }
        const actual = executeFunction(fn, test.args, { steps: 0 });
        if (!equal(actual, test.expected)) return { ok: false, reason: 'tests-failed' };
      } else if (test.type === 'does-not-mutate-input') {
        if (!Array.isArray(test.args)) return { ok: false, reason: 'invalid-test-spec' };
        const before = safeValue(test.args);
        const execution = executeFunction(fn, test.args, { steps: 0 }, { includeFinalArgs: true });
        if (!equal(before, execution.finalArgs)) return { ok: false, reason: 'input-mutated' };
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof EvaluationError ? error.code : 'evaluation-failed' };
  }
}

module.exports = { evaluateChallenge, parseSolution, LIMITS, EvaluationError };
