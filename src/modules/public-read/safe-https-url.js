'use strict';

function normalizeSafeHttpsUrl(value, { maxLength = 2048 } = {}) {
  if (typeof value !== 'string' || value.length > maxLength) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function isSafeHttpsUrl(value, options) {
  return normalizeSafeHttpsUrl(value, options) !== '';
}

module.exports = { normalizeSafeHttpsUrl, isSafeHttpsUrl };
