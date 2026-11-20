const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DELETION_REQUEST_STATES,
  canTransitionDeletionRequest
} = require('../src/modules/privacy/deletion-request-state');

const ready = { ready: true };
const blocked = { ready: false };

test('exposes a finite deletion request lifecycle', () => {
  assert.deepEqual(DELETION_REQUEST_STATES, [
    'requested',
    'identity_confirmed',
    'cooling_off',
    'ready_for_execution',
    'processing',
    'failed',
    'completed',
    'cancelled'
  ]);
});

test('allows only declared forward transitions and cancellation before processing', () => {
  assert.equal(canTransitionDeletionRequest({ from: 'requested', to: 'identity_confirmed' }), true);
  assert.equal(canTransitionDeletionRequest({ from: 'identity_confirmed', to: 'cooling_off' }), true);
  assert.equal(canTransitionDeletionRequest({ from: 'cooling_off', to: 'cancelled' }), true);
  assert.equal(canTransitionDeletionRequest({ from: 'requested', to: 'completed' }), false);
  assert.equal(canTransitionDeletionRequest({ from: 'completed', to: 'cancelled' }), false);
});

test('requires deletion readiness before execution can be prepared or started', () => {
  assert.equal(canTransitionDeletionRequest({ from: 'cooling_off', to: 'ready_for_execution', readiness: blocked }), false);
  assert.equal(canTransitionDeletionRequest({ from: 'cooling_off', to: 'ready_for_execution', readiness: ready }), true);
  assert.equal(canTransitionDeletionRequest({ from: 'ready_for_execution', to: 'processing', readiness: blocked }), false);
  assert.equal(canTransitionDeletionRequest({ from: 'ready_for_execution', to: 'processing', readiness: ready }), true);
});

test('completion requires explicit successful execution result', () => {
  assert.equal(canTransitionDeletionRequest({ from: 'processing', to: 'completed' }), false);
  assert.equal(canTransitionDeletionRequest({ from: 'processing', to: 'completed', executionSucceeded: false }), false);
  assert.equal(canTransitionDeletionRequest({ from: 'processing', to: 'completed', executionSucceeded: true }), true);
});

test('failed processing can be retried only after readiness is restored', () => {
  assert.equal(canTransitionDeletionRequest({ from: 'processing', to: 'failed' }), true);
  assert.equal(canTransitionDeletionRequest({ from: 'failed', to: 'ready_for_execution', readiness: blocked }), false);
  assert.equal(canTransitionDeletionRequest({ from: 'failed', to: 'ready_for_execution', readiness: ready }), true);
});

test('unknown states and malformed inputs fail closed', () => {
  assert.equal(canTransitionDeletionRequest({ from: 'unknown', to: 'processing', readiness: ready }), false);
  assert.equal(canTransitionDeletionRequest({ from: null, to: 'cancelled' }), false);
});
