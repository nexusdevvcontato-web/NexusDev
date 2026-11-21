'use strict';

const required = ['STAGING_API_URL', 'STAGING_ACCESS_TOKEN', 'STAGING_TEST_PASSWORD'];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(2);
  }
}

let base;
try {
  base = new URL(process.env.STAGING_API_URL);
} catch {
  console.error('STAGING_API_URL must be a valid URL.');
  process.exit(2);
}

const stagingHost = /(^|[.-])(staging|stage|preview)([.-]|$)/i.test(base.hostname);
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
if (base.protocol !== 'https:' && !localHost) {
  console.error('Refusing non-HTTPS API URL outside localhost.');
  process.exit(2);
}
if (!stagingHost && !localHost) {
  console.error('Refusing host without an explicit staging/preview hostname marker.');
  process.exit(2);
}
if (base.username || base.password || base.search || base.hash) {
  console.error('STAGING_API_URL must not contain credentials, query parameters or fragments.');
  process.exit(2);
}

const endpoint = new URL('/api/auth/reauthenticate', base);
const authHeaders = {
  Authorization: `Bearer ${process.env.STAGING_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
};

async function request(body) {
  return fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: authHeaders,
    body: JSON.stringify(body)
  });
}

async function run() {
  const unauthenticated = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'intentionally-not-a-real-password' })
  });
  if (unauthenticated.status !== 401) {
    throw new Error(`Unauthenticated request expected 401, received ${unauthenticated.status}.`);
  }
  console.log('PASS unauthenticated request rejected (401)');

  const invalid = await request({ password: 'intentionally-invalid-password' });
  if (invalid.status !== 401) {
    throw new Error(`Invalid password expected 401, received ${invalid.status}.`);
  }
  console.log('PASS incorrect password rejected (401)');

  const valid = await request({ password: process.env.STAGING_TEST_PASSWORD });
  if (valid.status !== 200) {
    throw new Error(`Valid staging password expected 200, received ${valid.status}.`);
  }
  if ((valid.headers.get('cache-control') || '').toLowerCase().split(',').map(x => x.trim()).includes('no-store') !== true) {
    throw new Error('Successful response is missing Cache-Control: no-store.');
  }

  const payload = await valid.json();
  if (typeof payload.reauthToken !== 'string' ||
      payload.reauthToken.split('.').length !== 3 ||
      payload.expiresIn !== 300) {
    throw new Error('Successful response does not match the expected short-lived proof contract.');
  }

  // Intentionally do not print, persist, or consume the proof. Privacy export consumes a proof, but that separate path is tested independently.
  console.log('PASS valid password issued a five-minute proof; token withheld from output');
  console.log('PASS response marked no-store');
  console.log('NOTE this smoke test does not consume the proof; staging export consumption requires a separate end-to-end check');
}

run().catch((error) => {
  console.error(`STAGING SMOKE TEST FAILED: ${error.message}`);
  process.exitCode = 1;
});
