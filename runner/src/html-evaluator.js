'use strict';

const parse5 = require('parse5');

const LIMITS = Object.freeze({ sourceBytes: 50_000, nodes: 5_000, depth: 64, textLength: 20_000 });
const SELECTORS = Object.freeze({
  h1: (node) => node.tagName === 'h1',
  h2: (node) => node.tagName === 'h2',
  p: (node) => node.tagName === 'p',
  strong: (node) => node.tagName === 'strong',
  'p strong': (node, ancestors) => node.tagName === 'strong' && ancestors.some((parent) => parent.tagName === 'p'),
  ul: (node) => node.tagName === 'ul',
  'ul li': (node, ancestors) => node.tagName === 'li' && ancestors.some((parent) => parent.tagName === 'ul'),
  button: (node) => node.tagName === 'button',
  'header h1': (node, ancestors) => node.tagName === 'h1' && ancestors.some((parent) => parent.tagName === 'header'),
  'nav a': (node, ancestors) => node.tagName === 'a' && ancestors.some((parent) => parent.tagName === 'nav'),
  'form input': (node, ancestors) => node.tagName === 'input' && ancestors.some((parent) => parent.tagName === 'form'),
  'form button': (node, ancestors) => node.tagName === 'button' && ancestors.some((parent) => parent.tagName === 'form'),
  'article.perfil h2': (node, ancestors) => node.tagName === 'h2' && ancestors.some((parent) =>
    parent.tagName === 'article' && parent.attrs?.some((attr) =>
      attr.name === 'class' && attr.value.split(/\s+/).includes('perfil'))),
  'article.perfil p': (node, ancestors) => node.tagName === 'p' && ancestors.some((parent) =>
    parent.tagName === 'article' && parent.attrs?.some((attr) =>
      attr.name === 'class' && attr.value.split(/\s+/).includes('perfil')))
});

class HtmlEvaluationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function collectElements(root) {
  const found = [];
  const stack = [{ node: root, ancestors: [], depth: 0 }];
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    const node = current.node;
    if (++count > LIMITS.nodes) throw new HtmlEvaluationError('node-limit');
    if (current.depth > LIMITS.depth) throw new HtmlEvaluationError('depth-limit');
    if (node.tagName) found.push({ node, ancestors: current.ancestors });
    const children = Array.isArray(node.childNodes) ? node.childNodes : [];
    const ancestors = node.tagName ? [...current.ancestors, node] : current.ancestors;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push({ node: children[i], ancestors, depth: current.depth + 1 });
    }
  }
  return found;
}

function textContent(node) {
  let result = '';
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (current.nodeName === '#text') result += current.value;
    if (result.length > LIMITS.textLength) throw new HtmlEvaluationError('text-limit');
    const children = Array.isArray(current.childNodes) ? current.childNodes : [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  return result;
}

function evaluateChallenge({ challengeId, source }) {
  const { getChallengeSpec } = require('./challenge-registry');
  const spec = getChallengeSpec(challengeId);
  if (!spec || spec.language !== 'html' || spec.entrypoint !== 'index.html' ||
      !Array.isArray(spec.tests) || spec.tests.length === 0) {
    return { ok: false, reason: 'unsupported-challenge' };
  }
  try {
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > LIMITS.sourceBytes) {
      throw new HtmlEvaluationError('source-limit');
    }
    const document = parse5.parseFragment(source, { scriptingEnabled: false });
    const elements = collectElements(document);
    const matches = (selector) => {
      const matcher = SELECTORS[selector];
      if (!matcher) throw new HtmlEvaluationError('unsupported-selector');
      return elements.filter(({ node, ancestors }) => matcher(node, ancestors)).map(({ node }) => node);
    };
    for (const check of spec.tests) {
      if (!check || typeof check !== 'object') throw new HtmlEvaluationError('invalid-test-spec');
      switch (check.type) {
        case 'selector-exists':
          if (matches(check.selector).length === 0) return { ok: false, reason: 'tests-failed' };
          break;
        case 'text-includes': {
          const nodes = matches(check.selector);
          if (!nodes.some((node) => textContent(node).includes(check.value))) return { ok: false, reason: 'tests-failed' };
          break;
        }
        case 'text-min-length': {
          const nodes = matches(check.selector);
          if (!nodes.some((node) => textContent(node).trim().length >= check.minLength)) return { ok: false, reason: 'tests-failed' };
          break;
        }
        case 'selector-text-min-length': {
          const nodes = matches(check.selector);
          if (!nodes.some((node) => textContent(node).trim().length >= check.minLength)) return { ok: false, reason: 'tests-failed' };
          break;
        }
        case 'selector-count-min':
          if (matches(check.selector).length < check.minCount) return { ok: false, reason: 'tests-failed' };
          break;
        default:
          throw new HtmlEvaluationError('unsupported-test-type');
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof HtmlEvaluationError ? error.code : 'parse-failed' };
  }
}

module.exports = { evaluateChallenge, LIMITS, HtmlEvaluationError };
