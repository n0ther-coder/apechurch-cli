import { parentPort, workerData } from 'node:worker_threads';

import { getBestActionByEV } from './solver.js';

try {
  const result = getBestActionByEV(workerData.gameState, {
    allowedActions: workerData.allowedActions,
    maxPlayerStates: workerData.maxPlayerStates,
  });

  parentPort.postMessage({
    ok: true,
    result,
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      code: error?.code || null,
      stack: error?.stack || null,
    },
  });
}
