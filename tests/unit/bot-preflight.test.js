import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { waitForStandardBotPreflight } from '../../lib/bots/session.js';

function terminal({ raw = false, flowing = false } = {}) {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = raw;
  const modes = [];
  input.setRawMode = value => { modes.push(value); input.isRaw = value; return input; };
  if (flowing) input.resume();
  const messages = [];
  const output = { isTTY: true, write: text => messages.push(text) };
  return { input, output, modes, messages };
}

function assertDetached(t) {
  for (const event of ['data', 'end', 'close', 'error']) assert.equal(t.input.listenerCount(event), 0);
}

describe('Interactive bot preflight', () => {
  it('does nothing for a disabled preflight and validates negative delays', async () => {
    const t = terminal();
    assert.equal(await waitForStandardBotPreflight({ preflight: '0' }, t), 'disabled');
    assert.deepEqual(t.modes, []);
    assert.deepEqual(t.messages, []);
    assertDetached(t);
    assert.throws(() => waitForStandardBotPreflight({ preflight: '-1' }, t), /non-negative/);
  });

  it('uses the normal injected sleep without interactive stdin or output', async () => {
    for (const side of ['input', 'output']) {
      const t = terminal();
      t[side].isTTY = false;
      const sleeps = [];
      assert.equal(await waitForStandardBotPreflight({ preflight: '0.75' }, {
        ...t, sleep: async ms => sleeps.push(ms),
      }), 'elapsed');
      assert.deepEqual(sleeps, [750]);
      assert.deepEqual(t.modes, []);
      assert.deepEqual(t.messages, []);
      assertDetached(t);
    }
  });

  it('supports a default duration without changing the existing delay parser', async () => {
    const durations = [];
    assert.equal(await waitForStandardBotPreflight({}, {
      defaultSeconds: 2.5, input: { isTTY: false }, sleep: async ms => durations.push(ms),
    }), 'elapsed');
    assert.deepEqual(durations, [2500]);
  });

  for (const enter of ['\r', '\n', '\r\n']) {
    it(`skips immediately on ${JSON.stringify(enter)} and restores the terminal`, async () => {
      const t = terminal();
      let settled = false;
      const wait = waitForStandardBotPreflight({ preflight: '60' }, t);
      wait.then(() => { settled = true; });
      assert.equal(t.input.isRaw, true);
      assert.match(t.messages.join(''), /Press Enter to skip/);
      t.input.emit('data', Buffer.from('x'));
      await Promise.resolve();
      assert.equal(settled, false);
      t.input.emit('data', Buffer.from(enter));
      assert.equal(await wait, 'skipped');
      assert.equal(t.input.isRaw, false);
      assert.equal(t.input.readableFlowing, false);
      assert.deepEqual(t.modes, [true, false]);
      assertDetached(t);
    });
  }

  it('expires normally and removes its keyboard listeners', async () => {
    const t = terminal();
    assert.equal(await waitForStandardBotPreflight({ preflight: '0.005' }, t), 'elapsed');
    assert.equal(t.input.isRaw, false);
    assertDetached(t);
    assert.doesNotMatch(t.messages.join(''), /Preflight skipped/);
  });

  it('preserves pre-existing raw mode, flowing input and unrelated listeners', async () => {
    const t = terminal({ raw: true, flowing: true });
    let seen = 0;
    const observer = () => { seen += 1; };
    t.input.on('data', observer);
    const wait = waitForStandardBotPreflight({ preflight: '60' }, t);
    t.input.emit('data', Buffer.from('\r'));
    assert.equal(await wait, 'skipped');
    assert.equal(t.input.isRaw, true);
    assert.equal(t.input.readableFlowing, true);
    assert.deepEqual(t.modes, []);
    assert.equal(t.input.listenerCount('data'), 1);
    assert.equal(seen, 1);
    t.input.removeListener('data', observer);
    t.input.pause();
  });

  for (const event of ['end', 'close', 'error']) {
    it(`falls back to the remaining timer after stdin ${event}`, async () => {
      const t = terminal();
      const wait = waitForStandardBotPreflight({ preflight: '0.005' }, t);
      t.input.emit(event, new Error('input unavailable'));
      assert.equal(t.input.isRaw, false);
      assertDetached(t);
      assert.equal(await wait, 'elapsed');
    });
  }

  it('keeps the timer when raw mode cannot be enabled', async () => {
    const t = terminal();
    t.input.setRawMode = () => { throw Error('closed TTY'); };
    assert.equal(await waitForStandardBotPreflight({ preflight: '0.005' }, t), 'elapsed');
    assert.deepEqual(t.messages, []);
    assertDetached(t);
  });

  it('restores the terminal before forwarding Ctrl+C and rejects instead of starting play', async () => {
    const t = terminal();
    let interrupts = 0;
    const wait = waitForStandardBotPreflight({ preflight: '60' }, { ...t, onInterrupt: () => {
      interrupts += 1;
      assert.equal(t.input.isRaw, false);
      assertDetached(t);
    } });
    t.input.emit('data', Buffer.from('\u0003'));
    await assert.rejects(wait, { name: 'AbortError', code: 'ABORT_ERR' });
    assert.equal(interrupts, 1);
    assert.doesNotMatch(t.messages.join(''), /Preflight skipped/);
  });

  it('does not leave Enter handlers armed for the next wait or child command', async () => {
    const t = terminal();
    for (let index = 0; index < 3; index += 1) {
      const wait = waitForStandardBotPreflight({ preflight: '60' }, t);
      t.input.emit('data', Buffer.from('\r'));
      assert.equal(await wait, 'skipped');
      assertDetached(t);
    }
    const count = t.messages.length;
    t.input.emit('data', Buffer.from('\r'));
    assert.equal(t.messages.length, count);
  });
});
