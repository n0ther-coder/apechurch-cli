/**
 * Integration Tests: Hardened Wallet Management
 *
 * These tests are intentionally non-destructive.
 * They validate the hardened interface without exporting or caching keys.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const MULTI_WALLET_HOME = path.join(__dirname, '../tmp-wallet-multi-home');
const TEST_PASSWORD = 'correct horse battery staple';
const PRIVATE_KEY_ONE = '0x1111111111111111111111111111111111111111111111111111111111111111';
const PRIVATE_KEY_TWO = '0x2222222222222222222222222222222222222222222222222222222222222222';
const ADDRESS_ONE = privateKeyToAccount(PRIVATE_KEY_ONE).address;
const ADDRESS_TWO = privateKeyToAccount(PRIVATE_KEY_TWO).address;

function stripVersionBanner(output) {
  return String(output || '').replace(/^apechurch-cli v[^\n]*\n+/, '');
}

function cli(args, options = {}) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      encoding: 'utf8',
      timeout: options.timeout || 30000,
      ...options,
    });
    return { stdout: stripVersionBanner(result), stderr: '', code: 0 };
  } catch (error) {
    return {
      stdout: stripVersionBanner(error.stdout || ''),
      stderr: stripVersionBanner(error.stderr || ''),
      code: error.status || 1,
    };
  }
}

function resetMultiWalletHome() {
  fs.rmSync(MULTI_WALLET_HOME, { recursive: true, force: true });
  fs.mkdirSync(MULTI_WALLET_HOME, { recursive: true });
}

function multiWalletEnv(extra = {}) {
  return {
    ...process.env,
    HOME: MULTI_WALLET_HOME,
    APECHURCH_CLI_PASS: TEST_PASSWORD,
    ...extra,
  };
}

function readJson(home, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(home, relativePath), 'utf8'));
}

describe('Wallet Integration Tests', () => {
  it('wallet status reports encryption-related state', () => {
    const { stdout } = cli('wallet status');
    assert.ok(
      stdout.includes('Encrypted') || stdout.includes('encrypted') || stdout.includes('Wallet not found'),
      'Should report wallet status or missing wallet'
    );
  });

  it('wallet export is explicitly disabled', () => {
    const { stdout, stderr, code } = cli('wallet export');
    const out = stdout + stderr;
    assert.ok(code !== 0, 'wallet export should fail');
    assert.ok(
      out.includes('disabled') || out.includes('not allowed') || out.includes('hardened'),
      'Should explain that plaintext export is disabled'
    );
  });

  it('wallet unlock is explicitly disabled', () => {
    const { stdout, stderr, code } = cli('wallet unlock');
    const out = stdout + stderr;
    assert.ok(code !== 0, 'wallet unlock should fail');
    assert.ok(
      out.includes('disabled') || out.includes('not allowed') || out.includes('hardened'),
      'Should explain that unlock/session caching is disabled'
    );
  });

  it('wallet new-password is exposed and fails safely when unavailable', () => {
    const { stdout, stderr, code } = cli('wallet new-password');
    const out = stdout + stderr;
    assert.ok(code !== 0, 'wallet new-password should not silently succeed in non-interactive tests');
    assert.ok(
      out.includes('No wallet found') ||
      out.includes('Wallet is not encrypted') ||
      out.includes('interactive terminal'),
      'Should fail with a safe explanatory message'
    );
  });

  it('wallet new creates a selectable archive and initializes per-wallet state files', () => {
    resetMultiWalletHome();

    const { stdout } = cli('wallet new --json', {
      env: multiWalletEnv({ APECHURCH_CLI_PK: PRIVATE_KEY_ONE }),
    });
    const data = JSON.parse(stdout);

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.address, ADDRESS_ONE);

    const apechurchDir = path.join(MULTI_WALLET_HOME, '.apechurch-cli');
    assert.ok(fs.existsSync(path.join(apechurchDir, 'wallet.json')), 'Should create wallet.json');
    assert.ok(fs.existsSync(path.join(apechurchDir, 'wallets', `${ADDRESS_ONE.toLowerCase()}.json`)), 'Should archive the current wallet');
    assert.ok(fs.existsSync(path.join(apechurchDir, 'profiles', `${ADDRESS_ONE.toLowerCase()}_profile.json`)), 'Should initialize a per-wallet profile file');
    assert.ok(fs.existsSync(path.join(apechurchDir, 'states', `${ADDRESS_ONE.toLowerCase()}_state.json`)), 'Should initialize a per-wallet state file');
    assert.ok(fs.existsSync(path.join(apechurchDir, 'games', `${ADDRESS_ONE.toLowerCase()}_games.json`)), 'Should initialize a per-wallet active games file');
  });

  it('wallet select restores the profile belonging to the selected wallet', () => {
    resetMultiWalletHome();

    cli('wallet new --json', {
      env: multiWalletEnv({ APECHURCH_CLI_PK: PRIVATE_KEY_ONE }),
    });
    cli('profile set --persona aggressive --gp-ape 7.5 --json', {
      env: multiWalletEnv(),
    });

    const secondWallet = JSON.parse(cli('wallet new --json', {
      env: multiWalletEnv({ APECHURCH_CLI_PK: PRIVATE_KEY_TWO }),
    }).stdout);
    assert.strictEqual(secondWallet.previous_address, ADDRESS_ONE);
    assert.strictEqual(secondWallet.address, ADDRESS_TWO);

    const currentProfile = JSON.parse(cli('profile show --json', {
      env: multiWalletEnv(),
    }).stdout);
    assert.strictEqual(currentProfile.persona, 'balanced', 'New wallet should start from a fresh profile');
    assert.strictEqual(currentProfile.currentGpPerApe, null, 'New wallet should not inherit the previous wallet rate');
    assert.strictEqual(currentProfile.effectiveGpPerApe, 5, 'New wallet should fall back to the base rate');

    const selected = JSON.parse(cli(`wallet select ${ADDRESS_ONE} --json`, {
      env: multiWalletEnv(),
    }).stdout);
    assert.strictEqual(selected.success, true);
    assert.strictEqual(selected.changed, true);
    assert.strictEqual(selected.address, ADDRESS_ONE);

    const restoredProfile = JSON.parse(cli('profile show --json', {
      env: multiWalletEnv(),
    }).stdout);
    assert.strictEqual(restoredProfile.persona, 'aggressive', 'Selecting the original wallet should restore its profile');
    assert.strictEqual(restoredProfile.currentGpPerApe, 7.5, 'Selecting the original wallet should restore its current GP rate');
    assert.strictEqual(restoredProfile.effectiveGpPerApe, 7.5, 'Wallet-specific GP rate should override the base rate');

    const currentWallet = readJson(MULTI_WALLET_HOME, '.apechurch-cli/wallet.json');
    assert.strictEqual(currentWallet.address, ADDRESS_ONE, 'wallet.json should now point to the selected wallet');
  });

  it('wallet select is blocked when the current wallet still has unfinished games', () => {
    resetMultiWalletHome();

    cli('wallet new --json', {
      env: multiWalletEnv({ APECHURCH_CLI_PK: PRIVATE_KEY_ONE }),
    });
    cli('wallet new --json', {
      env: multiWalletEnv({ APECHURCH_CLI_PK: PRIVATE_KEY_TWO }),
    });

    const apechurchDir = path.join(MULTI_WALLET_HOME, '.apechurch-cli');
    fs.writeFileSync(
      path.join(apechurchDir, 'games', `${ADDRESS_TWO.toLowerCase()}_games.json`),
      JSON.stringify({ blackjack: ['42'] }, null, 2)
    );

    const { stdout, code } = cli(`wallet select ${ADDRESS_ONE} --json`, {
      env: multiWalletEnv(),
    });
    assert.ok(code !== 0, 'Switch should fail when unfinished games exist');

    const data = JSON.parse(stdout);
    assert.ok(String(data.error).includes('unfinished games'), 'Error should explain why the switch was blocked');
    assert.ok(Array.isArray(data.unfinished_games), 'Should surface the unfinished games in JSON mode');
    assert.ok(data.unfinished_games.length > 0, 'Should include at least one unfinished game entry');

    const currentWallet = readJson(MULTI_WALLET_HOME, '.apechurch-cli/wallet.json');
    assert.strictEqual(currentWallet.address, ADDRESS_TWO, 'wallet.json should remain unchanged after a blocked switch');
  });

  it('wallet --list shows all locally available wallet addresses', () => {
    resetMultiWalletHome();

    cli('wallet new --json', {
      env: multiWalletEnv({ APECHURCH_CLI_PK: PRIVATE_KEY_ONE }),
    });
    cli('wallet new --json', {
      env: multiWalletEnv({ APECHURCH_CLI_PK: PRIVATE_KEY_TWO }),
    });

    const listed = JSON.parse(cli('wallet --list --json', {
      env: multiWalletEnv(),
    }).stdout);

    assert.ok(Array.isArray(listed.wallets), 'wallet --list should return a wallets array');
    assert.ok(listed.wallets.some((wallet) => wallet.address === ADDRESS_ONE), 'Should include the first wallet');
    assert.ok(listed.wallets.some((wallet) => wallet.address === ADDRESS_TWO), 'Should include the second wallet');
    assert.ok(listed.wallets.some((wallet) => wallet.address === ADDRESS_TWO && wallet.current), 'Should mark the current wallet');
  });
});
