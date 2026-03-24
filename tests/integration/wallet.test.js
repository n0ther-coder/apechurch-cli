/**
 * Integration Tests: Hardened Wallet Management
 *
 * These tests are intentionally non-destructive.
 * They validate the hardened interface without exporting or caching keys.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/cli.js');

function cli(args, options = {}) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      encoding: 'utf8',
      timeout: options.timeout || 30000,
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
});
