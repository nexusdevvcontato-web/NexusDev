const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createApiErrorHandlers, CORS_ORIGIN_ERROR } = require('../src/http/api-error-handlers');

async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '32b', strict: true }));
  app.post('/cors-error', (_req, _res, next) => next(new Error(CORS_ORIGIN_ERROR)));
  app.post('/internal-error', (_req, _res, next) => next(new Error('secret database details')));
  const { notFound, errorHandler } = createApiErrorHandlers();
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

test('returns JSON 404 for unknown API routes', async () => {
  await withServer(createTestApp(), async base => {
    const response = await fetch(base + '/not-found');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Rota não encontrada.' });
  });
});

test('returns a safe JSON 400 for malformed JSON', async () => {
  await withServer(createTestApp(), async base => {
    const response = await fetch(base + '/internal-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"invalid":'
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Corpo JSON inválido.' });
  });
});

test('returns a safe JSON 413 when the request body is too large', async () => {
  await withServer(createTestApp(), async base => {
    const response = await fetch(base + '/internal-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(128) })
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'Corpo da requisição excede o limite permitido.' });
  });
});

test('maps denied CORS origins to JSON 403', async () => {
  await withServer(createTestApp(), async base => {
    const response = await fetch(base + '/cors-error', { method: 'POST' });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Origem não permitida.' });
  });
});

test('does not expose internal exception details in JSON 500', async () => {
  await withServer(createTestApp(), async base => {
    const response = await fetch(base + '/internal-error', { method: 'POST' });
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.deepEqual(payload, { error: 'Erro interno do servidor.' });
    assert.equal(JSON.stringify(payload).includes('secret database details'), false);
  });
});
