const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionModels } = require('../src/modules/auth/session-models');

test('requires a Mongoose-compatible instance', () => {
  assert.throws(() => createSessionModels(null), TypeError);
});

test('defines session persistence models and indexes', () => {
  const models = {};
  const mongoose = {
    Schema: class Schema {
      static Types = { ObjectId: function ObjectId() {} };
      constructor(definition, options) { this.definition = definition; this.options = options; this.indexes = []; }
      index(fields, options) { this.indexes.push({ fields, options }); }
    },
    models,
    model(name, schema) { models[name] = { schema }; return models[name]; },
    connection: { models, model(name, schema) { models[name] = { schema }; return models[name]; } }
  };
  const result = createSessionModels(mongoose);
  assert.ok(result.Session);
  assert.ok(result.RefreshToken);
  assert.equal(models.Session.schema.definition.userId.required, true);
  assert.equal(models.RefreshToken.schema.definition.tokenHash.unique, true);
  assert.ok(models.Session.schema.indexes.some(index => index.options?.expireAfterSeconds === 0));
  assert.ok(models.RefreshToken.schema.indexes.some(index => index.options?.expireAfterSeconds === 0));
});
