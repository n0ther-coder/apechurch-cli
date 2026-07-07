/**
 * Unit Tests: script watch helpers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { parseEther } from 'viem';

import {
  getBalanceConditionResult,
  parseWatchOptions,
  resolveScriptFile,
  validateScriptName,
} from '../../lib/script-watch.js';

describe('Script Watch Helpers', () => {
  it('parses default and explicit watch options', () => {
    const defaults = parseWatchOptions({});

    assert.strictEqual(defaults.everySeconds, 60);
    assert.strictEqual(defaults.ifBalanceOverWei, null);
    assert.strictEqual(defaults.ifBalanceUnderWei, null);

    const parsed = parseWatchOptions({
      every: '30',
      ifBalanceOver: '500.5',
      ifBalanceUnder: '1500',
    });

    assert.strictEqual(parsed.everySeconds, 30);
    assert.strictEqual(parsed.ifBalanceOverWei, parseEther('500.5'));
    assert.strictEqual(parsed.ifBalanceUnderWei, parseEther('1500'));
  });

  it('rejects invalid watch options', () => {
    assert.throws(
      () => parseWatchOptions({ every: '60s' }),
      /--every must be a positive integer/,
    );
    assert.throws(
      () => parseWatchOptions({ every: '0' }),
      /--every must be a positive integer/,
    );
    assert.throws(
      () => parseWatchOptions({ ifBalanceOver: '-1' }),
      /--if-balance-over must be a non-negative APE amount/,
    );
    assert.throws(
      () => parseWatchOptions({ ifBalanceOver: '100', ifBalanceUnder: '100' }),
      /--if-balance-over must be lower/,
    );
  });

  it('resolves only script names under the script directory', () => {
    const scriptDir = path.join('/tmp', 'apechurch-cli-scripts');
    const resolved = resolveScriptFile('custom_script', scriptDir);

    assert.strictEqual(resolved.name, 'custom_script');
    assert.strictEqual(resolved.scriptDir, scriptDir);
    assert.strictEqual(resolved.scriptPath, path.join(scriptDir, 'custom_script'));

    assert.throws(
      () => validateScriptName('../custom_script'),
      /without path separators/,
    );
    assert.throws(
      () => validateScriptName('nested/custom_script'),
      /without path separators/,
    );
  });

  it('uses strict balance comparisons for watch gates', () => {
    const conditions = parseWatchOptions({
      ifBalanceOver: '10',
      ifBalanceUnder: '20',
    });

    assert.strictEqual(getBalanceConditionResult(parseEther('10'), conditions).ok, false);
    assert.strictEqual(getBalanceConditionResult(parseEther('10.000000000000000001'), conditions).ok, true);
    assert.strictEqual(getBalanceConditionResult(parseEther('20'), conditions).ok, false);
    assert.strictEqual(getBalanceConditionResult(parseEther('19.999999999999999999'), conditions).ok, true);
  });
});
