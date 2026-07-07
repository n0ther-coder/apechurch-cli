/**
 * Unit Tests: JSON command script helpers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { parseEther } from 'viem';

import {
  buildScriptPayloadFromArgs,
  getBalanceConditionResult,
  normalizeScriptCommand,
  parseWatchArgv,
  parseWatchOptions,
  renderScriptCommand,
  resolveScriptFile,
  validateScriptName,
} from '../../lib/scripts.js';

describe('Command Script Helpers', () => {
  it('parses default and explicit watch options', () => {
    const defaults = parseWatchOptions({});

    assert.strictEqual(defaults.everySeconds, 60);
    assert.strictEqual(defaults.ifBalanceOverWei, null);
    assert.strictEqual(defaults.ifBalanceUnderWei, null);

    const parsed = parseWatchArgv([
      '--every',
      '30',
      '--if-balance-over=500.5',
      '--if-balance-under',
      '1500',
    ]);

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
    assert.throws(
      () => parseWatchArgv(['--unknown']),
      /Unknown script watch option/,
    );
  });

  it('resolves only script names under the script directory', () => {
    const scriptDir = path.join('/tmp', 'apechurch-cli-scripts');
    const resolved = resolveScriptFile('custom_script', scriptDir);

    assert.strictEqual(resolved.name, 'custom_script.json');
    assert.strictEqual(resolved.scriptDir, scriptDir);
    assert.strictEqual(resolved.scriptPath, path.join(scriptDir, 'custom_script.json'));

    const explicit = resolveScriptFile('custom_script.json', scriptDir);
    assert.strictEqual(explicit.name, 'custom_script.json');
    assert.strictEqual(explicit.scriptPath, path.join(scriptDir, 'custom_script.json'));

    assert.throws(
      () => validateScriptName('../custom_script'),
      /without path separators/,
    );
    assert.throws(
      () => validateScriptName('nested/custom_script'),
      /without path separators/,
    );
  });

  it('formats nested assignment tokens as editable JSON command entries', () => {
    const payload = buildScriptPayloadFromArgs([
      'bot',
      'bob',
      '--spillover',
      "bot=zen --stop 500 game1='keno --picks 5' --bet1 2 --again1 1x game2='bear --survive 2' --gate2 1.87x game3=blocks --gate3 1.2x game4=monkey",
    ]);

    assert.deepStrictEqual(payload, {
      command: [
        'bot',
        'bob',
        '--spillover',
        {
          arg: 'bot',
          value: [
            'zen --stop 500',
            "game1='keno --picks 5' --bet1 2 --again1 1x",
            "game2='bear --survive 2' --gate2 1.87x",
            'game3=blocks --gate3 1.2x',
            'game4=monkey',
          ],
        },
      ],
    });
  });

  it('normalizes JSON command objects and renders copy-pasteable shell text', () => {
    const command = normalizeScriptCommand({
      command: [
        'bot',
        'bob',
        '--spillover',
        {
          arg: 'bot',
          value: [
            'zen --stop 500',
            "game1='keno --picks 5'",
          ],
        },
      ],
    });

    assert.deepStrictEqual(command, [
      'bot',
      'bob',
      '--spillover',
      "bot=zen --stop 500 game1='keno --picks 5'",
    ]);

    assert.strictEqual(
      renderScriptCommand(command),
      'apechurch-cli bot bob --spillover "bot=zen --stop 500 game1=\'keno --picks 5\'"',
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
