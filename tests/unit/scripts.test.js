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

    const reparsed = parseWatchOptions(parsed);
    assert.strictEqual(reparsed.everySeconds, 30);
    assert.strictEqual(reparsed.ifBalanceOverWei, parseEther('500.5'));
    assert.strictEqual(reparsed.ifBalanceUnderWei, parseEther('1500'));
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
      '--resilient',
      'game=bj --auto max --solver-timeout-ms 180000',
      'bankroll',
      '500',
      'bet',
      'fractional=0.055',
      '--spillover',
      "bot=zen --stop 500 game1='keno --picks 5' --bet1 2 --again1 1x game2='bear --survive 2' --gate2 1.87x game3=blocks --gate3 1.2x game4=monkey",
      '--color',
    ]);

    assert.deepStrictEqual(payload, {
      command: [
        {
          bot: 'bob',
          game: {
            arg: 'game',
            value: [
              'bj --auto max --solver-timeout-ms 180000',
            ],
          },
          bankroll: '500',
          bet: 'fractional=0.055',
          '--spillover': {
            arg: 'bot',
            value: [
              'zen --stop 500',
              "game1='keno --picks 5' --bet1 2 --again1 1x",
              "game2='bear --survive 2' --gate2 1.87x",
              'game3=blocks --gate3 1.2x',
              'game4=monkey',
            ],
          },
        },
        '--resilient',
        '--color',
      ],
    });
  });

  it('freezes optional-value defaults when writing and reading scripts', () => {
    const payload = buildScriptPayloadFromArgs([
      'blackjack',
      '10',
      '--auto',
      '--solver',
      '--human',
      '--color',
    ]);

    assert.deepStrictEqual(payload, {
      command: [
        {
          blackjack: '10',
          '--auto': 'simple',
          '--solver': 'best',
          '--human': 'weighted:3-9',
        },
        '--color',
      ],
    });

    assert.deepStrictEqual(normalizeScriptCommand(payload), [
      'blackjack',
      '10',
      '--auto',
      'simple',
      '--solver',
      'best',
      '--human',
      'weighted:3-9',
      '--color',
    ]);

    assert.deepStrictEqual(
      normalizeScriptCommand({
        command: [
          {
            'hi-lo-nebula': '10',
            '--auto': true,
            '--solver': true,
            '--human': true,
          },
        ],
      }),
      [
        'hi-lo-nebula',
        '10',
        '--auto',
        'simple',
        '--solver',
        'best',
        '--human',
        'weighted:3-9',
      ],
    );
  });

  it('keeps boolean solver flags boolean for commands without solver modes', () => {
    assert.deepStrictEqual(
      buildScriptPayloadFromArgs([
        'cash-dash',
        '10',
        '--solver',
        '--auto',
      ]),
      {
        command: [
          {
            'cash-dash': '10',
            '--auto': 'simple',
          },
          '--solver',
        ],
      },
    );

    assert.deepStrictEqual(
      normalizeScriptCommand({
        command: [
          {
            'video-poker': '10',
            '--solver': true,
          },
        ],
      }),
      [
        'video-poker',
        '10',
        '--solver',
      ],
    );
  });

  it('freezes known defaults inside structured game argument values', () => {
    const payload = buildScriptPayloadFromArgs([
      'bot',
      'bob',
      '--human',
      'game=bj --auto --solver --human',
    ]);

    assert.deepStrictEqual(payload, {
      command: [
        {
          bot: 'bob',
          game: {
            arg: 'game',
            value: [
              'bj --auto simple --solver best --human weighted:3-9',
            ],
          },
        },
        '--human',
      ],
    });

    assert.deepStrictEqual(normalizeScriptCommand(payload), [
      'bot',
      'bob',
      'game=bj --auto simple --solver best --human weighted:3-9',
      '--human',
    ]);
  });

  it('normalizes JSON command objects and renders copy-pasteable shell text', () => {
    const command = normalizeScriptCommand({
      command: [
        {
          bot: 'bob',
          '--resilient': true,
          game: {
            arg: 'game',
            value: [
              'bj --auto max',
            ],
          },
          '--spillover': {
            arg: 'bot',
            value: [
              'zen --stop 500',
              "game1='keno --picks 5'",
            ],
          },
        },
        '--resilient',
        '--color',
      ],
    });

    assert.deepStrictEqual(command, [
      'bot',
      'bob',
      '--resilient',
      'game=bj --auto max',
      '--spillover',
      "bot=zen --stop 500 game1='keno --picks 5'",
      '--color',
    ]);

    assert.strictEqual(
      renderScriptCommand(command),
      'apechurch-cli bot bob --resilient \'game=bj --auto max\' --spillover "bot=zen --stop 500 game1=\'keno --picks 5\'" --color',
    );
  });

  it('rejects malformed structured command JSON clearly', () => {
    assert.throws(
      () => normalizeScriptCommand({ command: [{ 'bad key': 'value' }] }),
      /must not contain whitespace/,
    );
    assert.throws(
      () => normalizeScriptCommand({ command: [{ game: { arg: 'other', value: ['x'] } }] }),
      /must match object arg/,
    );
    assert.throws(
      () => normalizeScriptCommand({ command: [{ '--spillover': { arg: 'bot' } }] }),
      /must be a string, number, boolean/,
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
