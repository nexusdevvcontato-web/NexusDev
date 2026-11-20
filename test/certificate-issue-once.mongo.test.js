'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { issueCertificateOnce } = require('../src/modules/certificates/issue-once');

const sourceUri = process.env.MONGO_SESSION_TEST_URI;
const enabled = typeof sourceUri === 'string' && sourceUri.length > 0;

test('MongoDB concurrent certificate issuance freezes exactly one certificate snapshot', {
  skip: !enabled
}, async () => {
  const uri = new URL(sourceUri);
  uri.pathname = '/nexusdev_certificate_issue_race_test';
  const connection = mongoose.createConnection(uri.toString(), { serverSelectionTimeoutMS: 10000 });
  try {
    await connection.asPromise();
    const schema = new mongoose.Schema({
      certificateCode: { type: String, unique: true, sparse: true },
      certificateIssuedAt: { type: Date, default: null },
      certificateStudentName: String,
      certificateCompletedCount: Number,
      certificateXp: Number
    });
    const User = connection.model('CertificateIssueRaceUser', schema);
    await User.init();
    const user = await User.create({});

    const attempts = await Promise.all([
      issueCertificateOnce(
        User, user._id, 'NXD-RACE-A', new Date('2026-11-20T12:00:00.000Z'),
        () => 'NXD-RACE-A-RETRY',
        { certificateStudentName: 'First candidate', certificateCompletedCount: 700, certificateXp: 850 }
      ),
      issueCertificateOnce(
        User, user._id, 'NXD-RACE-B', new Date('2026-11-20T12:00:01.000Z'),
        () => 'NXD-RACE-B-RETRY',
        { certificateStudentName: 'Second candidate', certificateCompletedCount: 700, certificateXp: 900 }
      )
    ]);

    assert.ok(attempts.every(Boolean));
    assert.equal(attempts[0].certificateCode, attempts[1].certificateCode);
    assert.equal(attempts[0].certificateIssuedAt.getTime(), attempts[1].certificateIssuedAt.getTime());
    assert.equal(attempts[0].certificateStudentName, attempts[1].certificateStudentName);
    assert.equal(attempts[0].certificateXp, attempts[1].certificateXp);

    const stored = await User.findById(user._id).lean();
    assert.equal(stored.certificateCode, attempts[0].certificateCode);
    assert.ok(['First candidate', 'Second candidate'].includes(stored.certificateStudentName));
    assert.equal(await User.countDocuments({ certificateIssuedAt: { $ne: null } }), 1);
  } finally {
    if (connection.readyState === 1) {
      await connection.dropDatabase();
      await connection.close();
    }
  }
});
