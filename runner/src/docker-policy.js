'use strict';

// Pure policy builder. This module does not start Docker or execute student code.
// The host adapter must call Docker with this exact argument vector and a trusted
// workspace created by the host; never append request-controlled flags or commands.

const REQUIRED_IMAGE = /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/;
const DEFAULT_LIMITS = Object.freeze({
  memory: '128m',
  memorySwap: '128m',
  cpus: '0.5',
  pids: '64',
  tmpfsSize: '16m',
  openFiles: '64'
});

function buildDockerArgs({ image, workspace, timeoutMs = 5000 } = {}) {
  if (typeof image !== 'string' || !REQUIRED_IMAGE.test(image)) {
    throw new Error('RUNNER_IMAGE must be pinned to an immutable sha256 digest.');
  }
  if (typeof workspace !== 'string' || !workspace.startsWith('/') ||
      workspace.includes(',') || /[\r\n\0]/.test(workspace) ||
      workspace === '/' || workspace.endsWith('/..') || workspace.includes('/../')) {
    throw new Error('A safe absolute host workspace path is required.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error('Execution timeout must be between 100 and 30000 milliseconds.');
  }

  return Object.freeze([
    'run', '--rm', '--init', '--pull=never', '--ipc=private', '--shm-size=16m',
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--pids-limit=' + DEFAULT_LIMITS.pids,
    '--memory=' + DEFAULT_LIMITS.memory,
    '--memory-swap=' + DEFAULT_LIMITS.memorySwap,
    '--cpus=' + DEFAULT_LIMITS.cpus,
    '--ulimit=nofile=' + DEFAULT_LIMITS.openFiles + ':' + DEFAULT_LIMITS.openFiles,
    '--user=10001:10001',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=' + DEFAULT_LIMITS.tmpfsSize,
    '--mount=type=bind,src=' + workspace + ',dst=/workspace,readonly',
    '--workdir=/workspace',
    '--env=HOME=/tmp',
    '--env=NODE_OPTIONS=--max-old-space-size=64',
    image,
    'node', '/opt/nexusdev/execute.js',
    '--timeout-ms=' + timeoutMs
  ]);
}

module.exports = { buildDockerArgs, DEFAULT_LIMITS };
