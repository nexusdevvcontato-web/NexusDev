'use strict';

const { isKnownChallengeId } = require('../curriculum/catalog');
const { normalizeSafeHttpsUrl } = require('./safe-https-url');

function normalizePublicAvatar(value) {
  return normalizeSafeHttpsUrl(value);
}

function buildLeaderboard(users) {
  if (!Array.isArray(users)) return [];
  return users
    .filter(user => user && user.privacyPreferences?.showInLeaderboard !== false)
    .filter(user => typeof user.xp === 'number' && Number.isSafeInteger(user.xp) && user.xp >= 0)
    .slice(0, 15)
    .map((user, index) => ({
      rank: index + 1,
      name: typeof user.name === 'string' && user.name.trim()
        ? user.name.trim().slice(0, 80)
        : 'Aluno NexusDev',
      avatar: normalizePublicAvatar(user.avatar),
      xp: user.xp,
      streak: Number.isSafeInteger(user.streak) && user.streak >= 0 ? user.streak : 0,
      completedCount: Array.isArray(user.completedIds)
        ? new Set(user.completedIds.filter(isKnownChallengeId)).size
        : 0
    }));
}

module.exports = { buildLeaderboard, normalizePublicAvatar };
