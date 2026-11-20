'use strict';

// Fail-closed image entrypoint. This prevents accidental execution of arbitrary
// student source before the evaluator protocol and host-side verification exist.
process.stderr.write('NexusDev runner image is not enabled: evaluator is not installed.\\n');
process.exitCode = 78;
