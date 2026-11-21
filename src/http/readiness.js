'use strict';

function getReadiness(readyState) {
  const databaseReady = readyState === 1;
  return Object.freeze({
    httpStatus: databaseReady ? 200 : 503,
    body: Object.freeze({
      status: databaseReady ? 'ready' : 'not_ready',
      database: databaseReady ? 'connected' : 'disconnected'
    })
  });
}

module.exports = { getReadiness };
