'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDockerArgs, DEFAULT_LIMITS } = require('../src/docker-policy');

const image = 'ghcr.io/nexusdev/runner@sha256:' + 'a'.repeat(64);

test('builds a fixed hardened Docker argument vector for an immutable image', () => {
  const args = buildDockerArgs({ image, workspace: '/var/lib/nexusdev/jobs/job-1' });
  for (const flag of [
    '--network=none', '--read-only', '--cap-drop=ALL', '--pull=never', '--ipc=private', '--shm-size=16m',
    '--security-opt=no-new-privileges:true',
    '--security-opt=seccomp=/etc/nexusdev/seccomp-runner.json',
    '--security-opt=apparmor=nexusdev-runner', '--user=10001:10001',
    '--pids-limit=64', '--memory=128m', '--memory-swap=128m',
    '--cpus=0.5', '--ulimit=nofile=64:64',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m',
    '--env=NODE_OPTIONS=--disable-proto=throw --max-old-space-size=64',
    '--mount=type=bind,src=/var/lib/nexusdev/jobs/job-1,dst=/workspace,readonly'
  ]) assert.ok(args.includes(flag), flag);
  assert.equal(args.at(-3), 'node');
  assert.equal(args.at(-2), '/opt/nexusdev/execute.js');
  assert.equal(args.at(-1), '--timeout-ms=5000');
  assert.ok(Object.isFrozen(args));
  assert.equal(DEFAULT_LIMITS.pids, '64');
});

test('rejects mutable image tags and malformed image references', () => {
  for (const invalid of ['node:20-alpine', 'ghcr.io/nexusdev/runner:latest', 'ghcr.io/nexusdev/runner@sha256:xyz']) {
    assert.throws(() => buildDockerArgs({ image: invalid, workspace: '/tmp/job' }));
  }
});

test('rejects unsafe workspace paths and mount-option injection', () => {
  for (const workspace of ['relative/path', '/', '/tmp/job,readonly=false', '/tmp/../etc', '/tmp/job\n--privileged']) {
    assert.throws(() => buildDockerArgs({ image, workspace }));
  }
});

test('bounds timeout and never accepts caller-supplied command arguments', () => {
  assert.throws(() => buildDockerArgs({ image, workspace: '/tmp/job', timeoutMs: 99 }));
  assert.throws(() => buildDockerArgs({ image, workspace: '/tmp/job', timeoutMs: 30_001 }));
  const args = buildDockerArgs({ image, workspace: '/tmp/job', timeoutMs: 1000 });
  assert.equal(args.includes('--privileged'), false);
  assert.equal(args.includes('sh'), false);
  assert.equal(args.includes('bash'), false);
});
