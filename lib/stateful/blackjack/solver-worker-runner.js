import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';

export const DEFAULT_AUTO_BEST_SOLVER_TIMEOUT_MS = 5000;
export const DEFAULT_AUTO_BEST_MAX_PLAYER_STATES = 50000;
export const DEFAULT_AUTO_MAX_SOLVER_TIMEOUT_MS = 30000;
export const DEFAULT_AUTO_MAX_MAX_PLAYER_STATES = 150000;
export const DEFAULT_AUTO_BEST_SOLVER_WORKER_MEMORY_MB = 512;
export const BLACKJACK_SOLVER_TIMEOUT_CODE = 'BLACKJACK_SOLVER_TIMEOUT';

function elapsedSince(startedAt) {
  return Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10);
}

function createWorkerError(payload, fallbackMessage) {
  const error = new Error(payload?.message || fallbackMessage);
  error.name = payload?.name || 'Error';
  error.code = payload?.code || null;
  if (payload?.stack) {
    error.stack = payload.stack;
  }
  return error;
}

export function solveBestActionByEVWithWorker(gameState, {
  allowedActions = null,
  maxPlayerStates = null,
  timeoutMs = DEFAULT_AUTO_BEST_SOLVER_TIMEOUT_MS,
  workerMemoryMb = DEFAULT_AUTO_BEST_SOLVER_WORKER_MEMORY_MB,
} = {}) {
  const normalizedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_AUTO_BEST_SOLVER_TIMEOUT_MS;
  const normalizedWorkerMemoryMb = Number.isFinite(workerMemoryMb) && workerMemoryMb > 0
    ? workerMemoryMb
    : DEFAULT_AUTO_BEST_SOLVER_WORKER_MEMORY_MB;
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./solver-worker.js', import.meta.url), {
      workerData: {
        gameState,
        allowedActions,
        maxPlayerStates,
      },
      resourceLimits: {
        maxOldGenerationSizeMb: normalizedWorkerMemoryMb,
      },
    });

    let settled = false;
    let timeout = null;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      worker.removeAllListeners('message');
      worker.removeAllListeners('error');
      worker.removeAllListeners('exit');
    };

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      handler(value);
    };

    const terminateAndReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate()
        .catch(() => {})
        .finally(() => reject(error));
    };

    timeout = setTimeout(() => {
      const elapsedMs = elapsedSince(startedAt);
      const error = new Error(`Blackjack EV search timed out after ${normalizedTimeoutMs} ms`);
      error.name = 'BlackjackSolverTimeoutError';
      error.code = BLACKJACK_SOLVER_TIMEOUT_CODE;
      error.solverElapsedMs = elapsedMs;
      terminateAndReject(error);
    }, normalizedTimeoutMs);

    worker.once('message', (message) => {
      const elapsedMs = elapsedSince(startedAt);

      if (message?.ok) {
        finish(resolve, {
          ...message.result,
          solverElapsedMs: elapsedMs,
          solverWorker: true,
        });
        return;
      }

      const error = createWorkerError(message?.error, 'Blackjack EV worker failed');
      error.solverElapsedMs = elapsedMs;
      finish(reject, error);
    });

    worker.once('error', (error) => {
      error.solverElapsedMs = elapsedSince(startedAt);
      finish(reject, error);
    });

    worker.once('exit', (code) => {
      if (code === 0) return;
      const error = new Error(`Blackjack EV worker exited with code ${code}`);
      error.solverElapsedMs = elapsedSince(startedAt);
      finish(reject, error);
    });
  });
}
