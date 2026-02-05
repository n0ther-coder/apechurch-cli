/**
 * Integration Tests: Wallet Management
 * 
 * Tests wallet encryption/decryption flow.
 * ⚠️  These tests modify the real wallet file!
 * 
 * Prerequisites:
 * - Wallet must exist (~/.apechurch/wallet.json)
 * - Wallet should be UNENCRYPTED before running
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/cli.js');

// Test password - DO NOT use in production
const TEST_PASSWORD = 'TestPass123!';

/**
 * Helper to run CLI command with stdin input
 */
function runCli(args, inputs = [], timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send inputs with delays
    let inputIndex = 0;
    const sendNextInput = () => {
      if (inputIndex < inputs.length) {
        setTimeout(() => {
          child.stdin.write(inputs[inputIndex] + '\n');
          inputIndex++;
          sendNextInput();
        }, 500);
      } else {
        setTimeout(() => child.stdin.end(), 500);
      }
    };
    sendNextInput();

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Command timed out'));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

describe('Wallet Integration Tests', () => {
  // Track state to ensure cleanup
  let walletWasEncrypted = false;

  describe('wallet export', () => {
    it('exports private key when unencrypted', async () => {
      const { stdout, code } = await runCli(['wallet', 'export']);
      
      // Should show private key (0x...)
      assert.ok(stdout.includes('0x') || stdout.includes('PRIVATE KEY'), 
        'Should display private key or encrypted message');
    });
  });

  describe('wallet status check', () => {
    it('status command works', async () => {
      const { stdout, code } = await runCli(['status', '--json']);
      
      const data = JSON.parse(stdout);
      assert.ok('address' in data, 'Should have address');
      assert.ok('balance' in data, 'Should have balance');
      assert.ok('can_play' in data, 'Should have can_play');
    });
  });

  describe('wallet encrypt/decrypt flow', { skip: process.env.SKIP_WALLET_TESTS }, () => {
    
    it('encrypts wallet with password', async () => {
      // Input: password, confirm password, 3 empty hints
      const inputs = [TEST_PASSWORD, TEST_PASSWORD, '', '', ''];
      const { stdout, code } = await runCli(['wallet', 'encrypt'], inputs, 15000);
      
      assert.ok(
        stdout.includes('encrypted') || stdout.includes('already encrypted'),
        'Should encrypt or note already encrypted'
      );
      walletWasEncrypted = true;
    });

    it('locks session', async () => {
      const { stdout } = await runCli(['wallet', 'lock']);
      assert.ok(stdout.includes('locked') || stdout.includes('Session'), 
        'Should confirm lock');
    });

    it('unlocks with correct password', async () => {
      const { stdout } = await runCli(['wallet', 'unlock'], [TEST_PASSWORD]);
      assert.ok(
        stdout.includes('unlocked') || stdout.includes('Session') || stdout.includes('active'),
        'Should unlock or create session'
      );
    });

    it('decrypts wallet back to raw', async () => {
      const { stdout } = await runCli(['wallet', 'decrypt'], [TEST_PASSWORD]);
      assert.ok(
        stdout.includes('decrypted') || stdout.includes('removed'),
        'Should decrypt wallet'
      );
      walletWasEncrypted = false;
    });
  });

  // Cleanup: ensure wallet is decrypted after tests
  after(async () => {
    if (walletWasEncrypted) {
      console.log('⚠️  Cleaning up: decrypting wallet...');
      try {
        await runCli(['wallet', 'decrypt'], [TEST_PASSWORD]);
      } catch (e) {
        console.error('Failed to decrypt wallet in cleanup:', e.message);
      }
    }
  });
});
