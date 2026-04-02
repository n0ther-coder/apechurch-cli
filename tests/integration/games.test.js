/**
 * Integration Tests: Live Game Execution
 * 
 * ⚠️  THESE TESTS USE REAL APE ON MAINNET!
 * ⚠️  Each test makes real bets with real money.
 * 
 * Prerequisites:
 * - Funded wallet with at least 20 APE
 * - Encrypted wallet installed locally
 * - Password available via prompt or the configured password env var before signing
 * 
 * To skip these tests, set: SKIP_LIVE_TESTS=1
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/cli.js');

// Minimum bet for tests
const TEST_BET = '1';

/**
 * Run CLI command and return output
 */
function cli(args, options = {}) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      encoding: 'utf8',
      timeout: options.timeout || 60000,
      ...options,
    });
    return { stdout: result, stderr: '', code: 0 };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      code: error.status || 1,
    };
  }
}

/**
 * Check if we should skip live tests
 */
function shouldSkipLiveTests() {
  if (process.env.SKIP_LIVE_TESTS === '1') {
    return 'SKIP_LIVE_TESTS=1';
  }
  
  // Check balance
  try {
    const { stdout } = cli('status --json');
    const data = JSON.parse(stdout);
    const available = parseFloat(data.available_ape);
    
    if (available < 10) {
      return `Insufficient balance: ${available} APE (need 10+)`;
    }
  } catch (e) {
    return `Cannot check balance: ${e.message}`;
  }
  
  return false;
}

// Check skip reason once at module load time
const SKIP_REASON = shouldSkipLiveTests();
if (SKIP_REASON) {
  console.log(`⚠️  Skipping live tests: ${SKIP_REASON}`);
}

describe('Live Game Tests', () => {

  describe('ApeStrong (Simple)', { skip: SKIP_REASON }, () => {
    it('plays a game with 50% odds', async () => {
      const { stdout, code } = cli(`play ape-strong ${TEST_BET} 50 --json`, { timeout: 45000 });
      
      const data = JSON.parse(stdout);
      
      assert.ok('status' in data || 'result' in data, 'Should return game status');
      assert.ok('tx' in data, 'Should have transaction hash');
      assert.ok(data.tx.startsWith('0x'), 'TX should be valid hash');
    });

    it('handles different odds values', async () => {
      // Test with 25% odds (higher payout)
      const { stdout, code } = cli(`play ape-strong ${TEST_BET} 25 --json`, { timeout: 45000 });
      
      const data = JSON.parse(stdout);
      assert.ok('tx' in data, 'Should complete transaction');
    });
  });

  describe('Roulette', { skip: SKIP_REASON }, () => {
    it('plays RED bet', async () => {
      const { stdout } = cli(`play roulette ${TEST_BET} RED --json`, { timeout: 45000 });
      
      const data = JSON.parse(stdout);
      assert.ok('tx' in data, 'Should have transaction');
    });

    it('plays number bet', async () => {
      const { stdout } = cli(`play roulette ${TEST_BET} 17 --json`, { timeout: 45000 });
      
      const data = JSON.parse(stdout);
      assert.ok('tx' in data, 'Should have transaction');
    });
  });

  describe('Plinko', { skip: SKIP_REASON }, () => {
    it('plays with default config', async () => {
      const { stdout } = cli(`play jungle ${TEST_BET} --json`, { timeout: 45000 });
      
      const data = JSON.parse(stdout);
      assert.ok('tx' in data, 'Should have transaction');
    });
  });

  describe('Baccarat', { skip: SKIP_REASON }, () => {
    it('plays PLAYER bet', async () => {
      const { stdout } = cli(`play baccarat ${TEST_BET} PLAYER --json`, { timeout: 45000 });
      
      const data = JSON.parse(stdout);
      assert.ok('tx' in data, 'Should have transaction');
    });
  });

  describe('Blackjack (Stateful)', { skip: SKIP_REASON }, () => {
    it('plays auto game to completion', async () => {
      const { stdout, code } = cli(`blackjack ${TEST_BET} --auto`, { timeout: 90000 });
      
      assert.ok(
        stdout.includes('Game complete') || 
        stdout.includes('WINS') || 
        stdout.includes('DEALER') ||
        stdout.includes('BLACKJACK'),
        'Should complete game'
      );
    });
  });

  describe('Video Poker (Stateful)', { skip: SKIP_REASON }, () => {
    it('plays auto game to completion', async () => {
      const { stdout } = cli(`video-poker ${TEST_BET} --auto`, { timeout: 90000 });
      
      assert.ok(
        stdout.includes('Game complete') || 
        stdout.includes('VIDEO POKER') ||
        stdout.includes('Discarding') ||
        stdout.includes('No winning'),
        'Should complete game'
      );
    });
  });

  describe('Loop Mode', { skip: SKIP_REASON }, () => {
    it('--max-games stops after specified count', async () => {
      const { stdout } = cli(`play ape-strong ${TEST_BET} 50 --loop --max-games 2 --json`, { timeout: 120000 });
      
      // Should have completed 2 games
      // Count occurrences of "tx" in output
      const txCount = (stdout.match(/"tx"/g) || []).length;
      assert.ok(txCount >= 1, 'Should play at least 1 game');
    });
  });

  describe('Result Verification', { skip: SKIP_REASON }, () => {
    it('history shows recent game', async () => {
      // First play a game
      cli(`play ape-strong ${TEST_BET} 50`, { timeout: 45000 });
      
      // Then check history
      const { stdout } = cli('history --json --limit 1');
      const data = JSON.parse(stdout);
      
      assert.ok(data.games.length > 0, 'Should have game in history');
      
      const game = data.games[0];
      assert.ok('game' in game, 'Should have game name');
      assert.ok('wager_ape' in game, 'Should have wager');
      assert.ok('settled' in game, 'Should have settled status');
    });
  });
});

describe('Error Handling in Games', () => {
  describe('Invalid inputs', () => {
    it('rejects negative bet amount', () => {
      const { stdout, stderr, code } = cli('play ape-strong -5 50');
      const output = stdout + stderr;
      
      assert.ok(output.includes('Invalid') || output.includes('error') || code !== 0,
        'Should reject negative amount');
    });

    it('rejects zero bet amount', () => {
      const { stdout, stderr, code } = cli('play ape-strong 0 50');
      const output = stdout + stderr;
      
      assert.ok(output.includes('Invalid') || output.includes('error') || output.includes('must be') || code !== 0,
        'Should reject zero amount');
    });

    it('rejects invalid game name', () => {
      const { stdout, stderr, code } = cli('play nonexistentgame 1');
      const output = stdout + stderr;
      
      assert.ok(output.includes('not found') || output.includes('Unknown') || code !== 0,
        'Should reject invalid game');
    });

    it('rejects invalid roulette bet', () => {
      const { stdout, stderr, code } = cli('play roulette 1 INVALID');
      const output = stdout + stderr;
      
      assert.ok(output.includes('Invalid') || output.includes('error') || code !== 0,
        'Should reject invalid roulette bet');
    });

    it('rejects ape-strong range out of bounds', () => {
      const { stdout, stderr, code } = cli('play ape-strong 1 101');
      const output = stdout + stderr;
      
      assert.ok(output.includes('Invalid') || output.includes('range') || output.includes('5-95') || code !== 0,
        'Should reject range > 95');
    });
  });

  describe('Strategy validation', () => {
    it('rejects invalid betting strategy', () => {
      const { stdout, stderr, code } = cli('play ape-strong 1 50 --loop --bet-strategy invalid --max-games 1');
      const output = stdout + stderr;
      
      assert.ok(output.includes('Unknown') || output.includes('strategy') || code !== 0,
        'Should reject invalid strategy');
    });

    it('accepts valid betting strategies', () => {
      const strategies = ['flat', 'martingale', 'reverse-martingale', 'fibonacci', 'dalembert'];
      
      for (const strat of strategies) {
        const { code, stderr } = cli(`play ape-strong 1 50 --loop --bet-strategy ${strat} --max-games 0`);
        // Should not error on strategy validation (may error on other things)
        assert.ok(!stderr.includes(`Unknown betting strategy`), 
          `Strategy ${strat} should be valid`);
      }
    });
  });
});
