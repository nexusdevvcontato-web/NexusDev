'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCompletionProofModel, consumeCompletionProof, UUID_PATTERN, FILES_HASH_PATTERN } = require('../src/modules/proofs/completion-proof-store');
const { hashCompletionFiles } = require('../src/modules/proofs/completion-files-hash');
const filesHash = hashCompletionFiles({ 'index.html': '<h1>Olá, Mundo!</h1>' });

function fakeModel() {
  const seen = new Set();
  return {
    async create(record) {
      if (seen.has(record.jti)) {
        const error = new Error('duplicate key');
        error.code = 11000;
        throw error;
      }
      seen.add(record.jti);
      return record;
    }
  };
}


test('requires a SHA-256 source digest in persistent proof records', () => {
  const models = {};
  class Schema {
    static Types = { ObjectId: function ObjectId() {} };
    constructor(definition, options) { this.definition = definition; this.options = options; this.indexes = []; }
    index(fields, options) { this.indexes.push({ fields, options }); }
  }
  const mongoose = {
    Schema,
    models,
    model(name, schema) { models[name] = { schema }; return models[name]; }
  };
  const model = createCompletionProofModel(mongoose);
  assert.equal(model.schema.definition.filesHash.required, true);
  assert.equal(FILES_HASH_PATTERN.test(filesHash), true);
  assert.ok(model.schema.definition.filesHash.match instanceof RegExp);
});

test('consumes a valid proof identifier exactly once', async () => {
  const model = fakeModel();
  const proof = { jti: '123e4567-e89b-42d3-a456-426614174000', exp: 1800000120, challengeId: 'html-00-o-que-e-web', filesHash };
  assert.equal(UUID_PATTERN.test(proof.jti), true);
  assert.equal(await consumeCompletionProof(model, proof, 'user-1'), true);
  assert.equal(await consumeCompletionProof(model, proof, 'user-1'), false);
});

test('only one concurrent request can consume the same proof', async () => {
  const model = fakeModel();
  const proof = { jti: '123e4567-e89b-42d3-a456-426614174001', exp: 1800000120, challengeId: 'html-00-o-que-e-web', filesHash };
  const results = await Promise.all([
    consumeCompletionProof(model, proof, 'user-1'),
    consumeCompletionProof(model, proof, 'user-1')
  ]);
  assert.equal(results.filter(Boolean).length, 1);
});

test('rejects malformed proof records and propagates database failures', async () => {
  await assert.rejects(consumeCompletionProof(fakeModel(), { jti: 'bad', exp: 1800000120, challengeId: 'html-00-o-que-e-web', filesHash }, 'user-1'));
  await assert.rejects(consumeCompletionProof({ create: async () => { throw new Error('database unavailable'); } },
    { jti: '123e4567-e89b-42d3-a456-426614174002', exp: 1800000120, challengeId: 'x' }, 'user-1'), /database unavailable/);
});
