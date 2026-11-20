'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const imageDir = path.join(__dirname, '..', 'image');
const dockerfile = fs.readFileSync(path.join(imageDir, 'Dockerfile'), 'utf8');
const entrypoint = fs.readFileSync(path.join(imageDir, 'execute.js'), 'utf8');
const docs = fs.readFileSync(path.join(imageDir, 'README.md'), 'utf8');

test('image requires a caller-supplied base image and documents immutable digest pinning', () => {
  assert.match(dockerfile, /^ARG NODE_BASE_IMAGE$/m);
  assert.match(dockerfile, /^FROM \${NODE_BASE_IMAGE}$/m);
  assert.match(docs, /@sha256:/);
  assert.doesNotMatch(dockerfile, /^FROM node:(?!.*@sha256:)/m);
});

test('image runs as a fixed non-root identity with a fail-closed entrypoint', () => {
  assert.match(dockerfile, /USER 10001:10001/);
  assert.match(dockerfile, /ENTRYPOINT \["node", "\/opt\/nexusdev\/execute\.js"\]/);
  assert.match(entrypoint, /process\.exitCode = 78/);
  assert.match(entrypoint, /evaluator is not installed/);
});

test('image definition does not copy keys, environment files, or install dependencies', () => {
  assert.doesNotMatch(dockerfile, /COPY .*\.env|COPY .*\.pem|COPY .*private.*key/i);
  assert.doesNotMatch(dockerfile, /npm (install|ci)|yarn|pnpm/);
  assert.match(docs, /must not be connected to the backend/);
});
