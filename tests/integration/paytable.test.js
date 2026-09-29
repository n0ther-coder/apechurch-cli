import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cliPath = path.join(root, 'bin', 'cli.js');

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  });
}

describe('game --paytable command', () => {
  it('returns a bot-ready JSON paytable without starting a game', () => {
    const result = runCli(['game', 'speed-keno', '--paytable', '--picks', '5', '--split', '1', '--json']);
    const payload = JSON.parse(result.stdout);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(payload.game, 'speed-keno');
    assert.deepStrictEqual(payload.parameters, { picks: 5, split: 1 });
    assert.strictEqual(payload.min_multiplier, '0.2');
    assert.strictEqual(payload.max_multiplier, '2000');
    assert.strictEqual(payload.payout_count, 6);
    assert.ok(!result.stdout.includes('tx_hash'));
  });

  it('returns a structured error for a missing required paytable parameter', () => {
    const result = runCli(['game', 'roulette', '--paytable', '--json']);
    const payload = JSON.parse(result.stdout);

    assert.strictEqual(result.status, 1);
    assert.match(payload.error, /requires --bet/);
  });
});
