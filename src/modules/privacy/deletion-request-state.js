const TRANSITIONS = Object.freeze({
  requested: new Set(['identity_confirmed', 'cancelled']),
  identity_confirmed: new Set(['cooling_off', 'cancelled']),
  cooling_off: new Set(['ready_for_execution', 'cancelled']),
  ready_for_execution: new Set(['processing', 'cancelled']),
  processing: new Set(['completed', 'failed']),
  failed: new Set(['ready_for_execution', 'cancelled']),
  completed: new Set(),
  cancelled: new Set()
});

function canTransitionDeletionRequest({ from, to, readiness, executionSucceeded } = {}) {
  if (typeof from !== 'string' || typeof to !== 'string') return false;
  if (!TRANSITIONS[from] || !TRANSITIONS[from].has(to)) return false;

  if (to === 'ready_for_execution' || to === 'processing') {
    if (readiness?.ready !== true) return false;
  }

  if (to === 'completed' && executionSucceeded !== true) return false;
  return true;
}

module.exports = {
  DELETION_REQUEST_STATES: Object.freeze(Object.keys(TRANSITIONS)),
  canTransitionDeletionRequest
};
