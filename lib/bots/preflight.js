/** Wait for the startup delay, with an Enter shortcut on an interactive TTY. */
export async function waitForPreflight(delayMs, {
  input = process.stdin,
  output = process.stderr,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onInterrupt = () => process.kill(process.pid, 'SIGINT'),
} = {}) {
  if (delayMs <= 0) return 'disabled';
  if (!input?.isTTY || !output?.isTTY || typeof input.setRawMode !== 'function') {
    await sleep(delayMs);
    return 'elapsed';
  }

  return new Promise((resolve, reject) => {
    const wasRaw = Boolean(input.isRaw);
    const wasFlowing = input.readableFlowing === true;
    let rawModeChanged = false;
    let settled = false;

    function detachKeyboard() {
      input.removeListener('data', onData);
      input.removeListener('end', detachKeyboard);
      input.removeListener('close', detachKeyboard);
      input.removeListener('error', detachKeyboard);
      if (rawModeChanged) {
        rawModeChanged = false;
        try { input.setRawMode(wasRaw); } catch { /* The TTY may have closed. */ }
      }
      if (!wasFlowing) input.pause();
    }

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      detachKeyboard();
      if (result === 'interrupted') {
        const error = new Error('Preflight interrupted.');
        error.name = 'AbortError';
        error.code = 'ABORT_ERR';
        reject(error);
        onInterrupt();
      } else {
        if (result === 'skipped') output.write('Preflight skipped.\n');
        resolve(result);
      }
    }

    function onData(chunk) {
      const text = chunk.toString();
      if (text.includes('\u0003')) finish('interrupted');
      else if (text.includes('\r') || text.includes('\n')) finish('skipped');
    }

    const timer = setTimeout(() => finish('elapsed'), delayMs);
    try {
      if (!wasRaw) {
        input.setRawMode(true);
        rawModeChanged = true;
      }
      input.on('data', onData);
      input.once('end', detachKeyboard);
      input.once('close', detachKeyboard);
      input.once('error', detachKeyboard);
      output.write(`Preflight: ${delayMs / 1000} s. Press Enter to skip.\n`);
      input.resume();
    } catch {
      // An unavailable TTY must not turn the normal timed wait into a skip.
      detachKeyboard();
    }
  });
}
