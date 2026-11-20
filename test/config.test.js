const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function loadConfig(overrides = {}) {
  const env = {
    PATH: process.env.PATH,
    NODE_ENV: 'test',
    PORT: '5000',
    MONGO_URI: 'mongodb://127.0.0.1:27017/nexusdev_test',
    JWT_SECRET: 'test-secret-with-at-least-32-characters-long',
    CORS_ORIGINS: 'http://localhost:5173',
    ...overrides
  };
  return spawnSync(process.execPath, ['-e', "require('./src/config')"], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8'
  });
}

test('rejects missing MongoDB URI', () => {
  const result = loadConfig({ MONGO_URI: '', MONGODB_URI: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MONGO_URI/);
});

test('rejects missing JWT secret', () => {
  const result = loadConfig({ JWT_SECRET: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('rejects short JWT secret', () => {
  const result = loadConfig({ JWT_SECRET: 'too-short' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /32 caracteres/);
});


test('rejects the example placeholder as a signing secret', () => {
  const result = loadConfig({ JWT_SECRET: 'REPLACE_WITH_A_LONG_RANDOM_SECRET' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('requires explicit CORS origins in production', () => {
  const result = loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: '', FRONTEND_URL: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CORS_ORIGINS/);
});

test('accepts valid configuration and comma-separated origins', () => {
  const result = loadConfig({
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://nexusdev-frontend.vercel.app,https://www.nexusdev.com'
  });
  assert.equal(result.status, 0, result.stderr);
});
