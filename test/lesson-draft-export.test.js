'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUserDataExport } = require('../src/modules/privacy/user-export');

test('personal data export includes versioned lesson drafts', () => {
  const savedDraftMap = {
    'mod-1-aula-1': {
      revision: 3,
      files: { 'index.html': '<h1>Draft</h1>' },
      updatedAt: new Date('2026-11-20T12:00:00.000Z')
    }
  };
  const result = buildUserDataExport({ _id: 'user-1', name: 'Student', email: 'student@example.com', savedDraftMap });
  assert.deepEqual(result.data.savedDraftMap, savedDraftMap);
});
