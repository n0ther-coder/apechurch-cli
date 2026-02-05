/**
 * Integration Tests: CLI Commands
 * 
 * Tests CLI commands that don't modify state significantly.
 * Safe to run anytime.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/cli.js');

/**
 * Run CLI command and return output
 */
function cli(args, options = {}) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: 'utf8',
      timeout: options.timeout || 30000,
      ...options,
    });
    return { stdout: result, code: 0 };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      code: error.status || 1,
    };
  }
}

describe('CLI Commands Integration Tests', () => {

  describe('version and help', () => {
    it('--version shows version number', () => {
      const { stdout } = cli('--version');
      assert.ok(/\d+\.\d+\.\d+/.test(stdout), 'Should show semver version');
    });

    it('--help shows usage', () => {
      const { stdout } = cli('--help');
      assert.ok(stdout.includes('Usage'), 'Should show usage');
      assert.ok(stdout.includes('Commands'), 'Should list commands');
    });

    it('commands shows full reference', () => {
      const { stdout } = cli('commands');
      assert.ok(stdout.includes('play') || stdout.includes('PLAY'), 'Should mention play command');
    });
  });

  describe('status command', () => {
    it('returns status information', () => {
      const { stdout } = cli('status');
      assert.ok(stdout.includes('Address') || stdout.includes('address'), 'Should show address');
      assert.ok(stdout.includes('Balance') || stdout.includes('balance'), 'Should show balance');
    });

    it('--json returns valid JSON', () => {
      const { stdout } = cli('status --json');
      const data = JSON.parse(stdout);
      
      assert.ok('address' in data, 'JSON should have address');
      assert.ok('balance' in data, 'JSON should have balance');
      assert.ok('can_play' in data, 'JSON should have can_play');
      assert.ok('username' in data, 'JSON should have username');
    });

    it('address is valid Ethereum format', () => {
      const { stdout } = cli('status --json');
      const data = JSON.parse(stdout);
      
      assert.ok(/^0x[a-fA-F0-9]{40}$/.test(data.address), 'Address should be valid');
    });
  });

  describe('games command', () => {
    it('lists available games', () => {
      const { stdout } = cli('games');
      assert.ok(stdout.includes('ApeStrong') || stdout.includes('ape-strong'), 'Should list ApeStrong');
      assert.ok(stdout.includes('Roulette') || stdout.includes('roulette'), 'Should list Roulette');
      assert.ok(stdout.includes('Plinko') || stdout.includes('plinko'), 'Should list Plinko');
    });

    it('--json returns array of games', () => {
      const { stdout } = cli('games --json');
      const data = JSON.parse(stdout);
      
      assert.ok('games' in data, 'Should have games array');
      assert.ok(Array.isArray(data.games), 'Games should be array');
      assert.ok(data.games.length > 0, 'Should have at least one game');
      
      // Check game structure
      const game = data.games[0];
      assert.ok('key' in game, 'Game should have key');
      assert.ok('name' in game, 'Game should have name');
      assert.ok('type' in game, 'Game should have type');
    });
  });

  describe('game <name> command', () => {
    it('shows details for valid game', () => {
      const { stdout } = cli('game ape-strong');
      assert.ok(stdout.includes('ApeStrong') || stdout.includes('ape-strong'), 'Should show game name');
    });

    it('shows error for invalid game', () => {
      const { stdout, stderr, code } = cli('game nonexistent');
      const output = stdout + stderr;
      assert.ok(output.includes('not found') || output.includes('Unknown') || code !== 0, 
        'Should error for invalid game');
    });

    it('--json returns game details', () => {
      const { stdout } = cli('game roulette --json');
      const data = JSON.parse(stdout);
      
      assert.ok('name' in data || 'key' in data, 'Should have game info');
    });
  });

  describe('history command', () => {
    it('shows game history', () => {
      const { stdout } = cli('history');
      // May be empty or have games
      assert.ok(
        stdout.includes('Recent') || stdout.includes('history') || stdout.includes('No games'),
        'Should show history or empty message'
      );
    });

    it('--json returns games array', () => {
      const { stdout } = cli('history --json');
      const data = JSON.parse(stdout);
      
      assert.ok('games' in data, 'Should have games key');
      assert.ok(Array.isArray(data.games), 'Games should be array');
    });

    it('--limit works', () => {
      const { stdout } = cli('history --json --limit 5');
      const data = JSON.parse(stdout);
      
      assert.ok(data.games.length <= 5, 'Should respect limit');
    });
  });

  describe('house status command', () => {
    it('shows house information', () => {
      const { stdout } = cli('house status');
      assert.ok(stdout.includes('House') || stdout.includes('Staked'), 'Should show house info');
    });

    it('--json returns house data', () => {
      const { stdout } = cli('house status --json');
      const data = JSON.parse(stdout);
      
      assert.ok('total_staked' in data, 'Should have total_staked');
      assert.ok('max_payout' in data, 'Should have max_payout');
    });
  });

  describe('profile command', () => {
    it('shows profile information', () => {
      const { stdout } = cli('profile show');
      assert.ok(
        stdout.includes('persona') || stdout.includes('Persona') || stdout.includes('username'),
        'Should show profile info'
      );
    });
  });

  describe('error handling', () => {
    it('invalid command shows error', () => {
      const { stdout, stderr, code } = cli('invalidcommand');
      const output = stdout + stderr;
      assert.ok(output.includes('error') || output.includes('unknown') || code !== 0,
        'Should error for invalid command');
    });

    it('play without amount shows error', () => {
      const { stdout, stderr, code } = cli('play ape-strong');
      const output = stdout + stderr;
      assert.ok(output.includes('amount') || output.includes('required') || output.includes('Usage'),
        'Should require amount');
    });
  });
});
