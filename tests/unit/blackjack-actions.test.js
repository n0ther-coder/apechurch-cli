import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_ACCOUNT = '0x0000000000000000000000000000000000000001';
const TX_HASH = `0x${'11'.repeat(32)}`;

let configDir;

async function importActions() {
  const url = new URL('../../lib/stateful/blackjack/actions.js', import.meta.url);
  url.searchParams.set('cacheBust', `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

describe('Blackjack actions', () => {
  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apechurch-cli-blackjack-'));
    process.env.APECHURCH_CLI_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    delete process.env.APECHURCH_CLI_CONFIG_DIR;
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('returns a JSON-safe game id after starting a game', async () => {
    const { startGame } = await importActions();
    const publicClient = {
      async readContract({ functionName }) {
        assert.equal(functionName, 'vrfFee');
        return 1n;
      },
      async waitForTransactionReceipt({ hash }) {
        assert.equal(hash, TX_HASH);
        return { status: 'success' };
      },
    };
    const walletClient = {
      async writeContract() {
        return TX_HASH;
      },
    };

    const result = await startGame({
      account: { address: TEST_ACCOUNT },
      publicClient,
      walletClient,
      betApe: '1',
      json: true,
    });

    assert.equal(typeof result.gameId, 'string');
    assert.doesNotThrow(() => JSON.stringify({ gameId: result.gameId }));
    assert.match(result.gameId, /^\d+$/);
  });
});
