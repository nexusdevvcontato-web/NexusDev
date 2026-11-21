const test = require('node:test');
const assert = require('node:assert/strict');
const { getReadiness } = require('../src/http/readiness');

test('reports ready only when MongoDB connection is established', () => {
  assert.deepEqual(getReadiness(1), {
    httpStatus: 200,
    body: { status: 'ready', database: 'connected' }
  });
});

test('reports not ready when MongoDB is disconnected or connecting', () => {
  for (const state of [0, 2, 3, 99]) {
    assert.deepEqual(getReadiness(state), {
      httpStatus: 503,
      body: { status: 'not_ready', database: 'disconnected' }
    });
  }
});
