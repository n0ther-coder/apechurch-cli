import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'apechurch-bot-runtime-'));
process.env.APECHURCH_CLI_CONFIG_DIR = tmpRoot;
process.env.APECHURCH_CLI_LOG_DIR = path.join(tmpRoot, 'logs');

const fakeCliPath = path.join(tmpRoot, 'fake-cli.js');
fs.writeFileSync(fakeCliPath, `
const [, , command, ...args] = process.argv;
if (args.includes('--settled-loop')) {
  console.log(JSON.stringify({ loop: true, games_detail: [
    { status: 'complete', counts_as_game: false, wager_wei: '500', payout_wei: '0' },
    { accounting_version: 2, wager_wei: '10', payout_wei: '0', pnl_wei: '-10' },
    { accounting_version: 2, wager_wei: '20', payout_wei: '40', pnl_wei: '19' },
    { status: 'pending', accounting_version: 2, wager_wei: '999', payout_wei: '0' },
  ] }));
  process.exit(0);
}
if (args.includes('--pending-game')) {
  console.log(JSON.stringify({ status: 'pending', wager_wei: '999' }));
  process.exit(0);
}
if (args.includes('--nested-latest')) {
  console.log(JSON.stringify({ first_wager_wei: '15', latest_play: { status: 'complete', wager_wei: '30', payout_wei: '90' } }));
  process.exit(0);
}
if (args.includes('--emit-cost-error')) {
  console.error(JSON.stringify({ error: 'Retries exhausted', accounting_version: 2,
    wager_wei: '0', payout_wei: '0', cost_wei: '5', pnl_wei: '-5', multiplier: null,
    costs: { total_wei: '5', complete: true, transactions: [] },
    failed_transaction_only: true, counts_as_game: false }));
  process.exit(1);
}
if (args.includes('--emit-retry')) {
  process.stderr.write('⚠️ Contract returns error message "Paused", Rechecking in 3m (at 2026-JUL-18 18:36:15+0200).\\n');
  process.stderr.write('{"error":"not a retry notice"}\\n');
}
console.log(JSON.stringify({
  command,
  args,
  watchResume: process.env.APECHURCH_CLI_WATCH_RESUME || null,
  retainedBalance: process.env.APECHURCH_RETAINED_BALANCE_WEI ?? null,
}));
`);

const {
  createBotRuntimeContext,
  findLatestBotResumeSummary,
  isResumablePendingSummary,
  normalizeBotRuntimeResult,
} = await import('../../lib/bots.js');
const {
  RESUMABLE_PENDING_EXIT_CODE,
  WATCH_RESUME_ENV_VAR,
} = await import('../../lib/constants.js');
const { createEncryptedWalletFromPrivateKey } = await import('../../lib/wallet.js');

function createContext(rawArgs = [], runtimeOptions = {}) {
  return createBotRuntimeContext({
    name: 'Test Bot',
    command: 'test-bot',
    description: '',
    directory: tmpRoot,
    manifestPath: path.join(tmpRoot, 'bot.json'),
    entryPath: path.join(tmpRoot, 'index.js'),
  }, {
    cliPath: fakeCliPath,
    rawArgs,
    ...runtimeOptions,
  });
}

describe('Bot Runtime Context', () => {
  it('keeps the same runtime alive across exhausted short balance retries', async (t) => {
    createEncryptedWalletFromPrivateKey(`0x${'01'.repeat(32)}`, 'test-wallet');
    const previousRpcUrl = process.env.APECHAIN_RPC_URL;
    delete process.env.APECHAIN_RPC_URL;
    t.after(() => {
      if (previousRpcUrl !== undefined) process.env.APECHAIN_RPC_URL = previousRpcUrl;
    });

    const backoffs = [];
    const setTimeout = globalThis.setTimeout;
    t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
      if (delay === 180_000) backoffs.push(delay);
      return setTimeout(callback, delay === 20_000 ? delay : 0, ...args);
    });

    const readBalance = t.mock.method(globalThis, 'fetch', async (_url, request) => {
      const { id, method } = JSON.parse(request.body);
      assert.equal(method, 'eth_getBalance');
      if (backoffs.length === 0) return new Response('Service unavailable', { status: 503 });
      return Response.json({ jsonrpc: '2.0', id, result: '0x7b' });
    });

    const ctx = createContext(['--resilient', '--json']);
    await assert.rejects(ctx.captureBalanceSnapshot({ label: 'optional', resilient: false }), { status: 503 });
    const shortAttempts = readBalance.mock.callCount();
    assert.ok(shortAttempts > 1);
    assert.deepEqual(backoffs, []);

    const balance = await ctx.balanceJson();
    assert.equal(balance.balance_wei, '123');
    assert.deepEqual(backoffs, [180_000]);
    assert.equal(readBalance.mock.callCount(), 2 * shortAttempts + 1);

    const next = await ctx.captureBalanceSnapshot({ label: 'post-recovery' });
    assert.equal(next.snapshot.sequence, 1);
    assert.equal(next.snapshot.balance_wei, '123');
  });

  it('preserves the latest settled transaction through native loops, pending calls and nested bots', async () => {
    const ctx = createContext();
    await ctx.playJson(['blackjack', '10', '--settled-loop']);
    assert.equal(ctx.getLatestPlay().payout_wei, '40');
    await ctx.playJson(['blackjack', '10', '--pending-game']);
    assert.equal(ctx.getLatestPlay().payout_wei, '40');
    await ctx.botJson('example', ['--nested-latest']);
    assert.equal(ctx.getLatestPlay().payout_wei, '90');
    const restored = createContext([], { resumeSummary: { latest_play: ctx.getLatestPlay() } });
    assert.deepEqual(restored.getLatestPlay(), ctx.getLatestPlay());
  });

  it('tracks and restores the first settled wager through game loops and nested summaries', async () => {
    const ctx = createContext();
    await ctx.playJson(['blackjack', '10', '--pending-game']);
    assert.equal(ctx.getFirstSettledWagerWei(), null);
    await ctx.playJson(['blackjack', '10', '--settled-loop']);
    await ctx.botJson('example', ['--nested-latest']);
    assert.equal(ctx.getFirstSettledWagerWei(), 10n);
    assert.equal(ctx.getLatestPlay().wager_wei, '30');

    const nested = createContext();
    await nested.botJson('example', ['--nested-latest']);
    assert.equal(nested.getFirstSettledWagerWei(), 15n);
    const restored = createContext([], { resumeSummary: { first_wager_wei: '15' } });
    await restored.playJson(['blackjack', '10', '--settled-loop']);
    assert.equal(restored.getFirstSettledWagerWei(), 15n);

    const legacy = createContext([], { resumeSummary: { total_wager_ape: '1' } });
    await legacy.playJson(['blackjack', '10', '--settled-loop']);
    assert.equal(legacy.getFirstSettledWagerWei(), null);
  });

  it('inherits precision across bot calls while preserving explicit overrides and exact plays', async () => {
    const ctx = createContext(['--strategy-precision', '4']);
    assert.equal(ctx.session.parseStandardBotArgs([]).loopControls.strategyPrecision, '4');
    assert.equal(ctx.session.parseStandardBotArgs([]).strategyPrecisionExplicit, null);
    assert.equal(ctx.session.extractStrategyPrecisionArgs([]).precision, '4');
    for (const [tokens, expected] of [[[], '4'], [['--strategy-precision=none'], 'none'], [['--strategy-precision', '0'], '0']]) {
      const child = await ctx.botJson('example-bot', tokens);
      assert.equal(ctx.session.extractStrategyPrecisionArgs(child.args).precision, expected);
    }
    const pendingChild = await ctx.botJson('example-bot', [], { resumeRequested: true });
    assert.ok(!pendingChild.args.some(arg => arg.startsWith('--strategy-precision')));
    const play = await ctx.playJson(['ape-strong', '1']);
    assert.ok(!play.args.some(arg => arg.startsWith('--strategy-precision')));
    const restored = createContext([], { resumeSummary: { resume_state: { strategy_precision: 'none' } } });
    assert.equal(restored.session.parseStandardBotArgs([]).loopControls.strategyPrecision, 'none');
    assert.throws(() => createContext(['--strategy-precision', '2'], {
      resumeSummary: { resume_state: { strategy_precision: 'none' } },
    }), /Cannot change/);
  });

  it('does not report a failed summary as a successful bot exit', () => {
    for (const summary of [{ status: 'error' }, { status: 'indeterminate_error' }, { error: 'Interrupted' }]) {
      assert.equal(normalizeBotRuntimeResult({ exitCode: 0, summary }).exitCode, 1);
    }
  });
  it('preserves exhausted retry costs through game and nested bot exceptions', async () => {
    const ctx = createContext();
    for (const call of [() => ctx.playJson(['ape-strong', '1', '--emit-cost-error']),
      () => ctx.botJson('example-bot', ['--emit-cost-error'])]) {
      await assert.rejects(call, (error) => {
        assert.equal(error.accounting.cost_wei, '5');
        assert.equal(error.accounting.pnl_wei, '-5');
        assert.equal(error.accounting.multiplier, null);
        assert.equal(error.accounting.failed_transaction_only, true);
        assert.equal(error.accounting.counts_as_game, false);
        return true;
      });
    }
  });
  it('exposes the authoritative game and bot command resolvers', () => {
    const ctx = createContext([], {
      gameResolver: (command) => (
        command === 'vp' ? { key: 'video-poker', type: 'stateful' } : null
      ),
      botResolver: (command) => (
        command === 'example-bot' ? { command: 'example-bot', name: 'Example Bot' } : null
      ),
    });

    assert.deepStrictEqual(ctx.resolveGame('vp'), { key: 'video-poker', type: 'stateful' });
    assert.deepStrictEqual(ctx.resolveBot('example-bot'), { command: 'example-bot', name: 'Example Bot' });
    assert.strictEqual(ctx.resolveGame('example-bot'), null);
    assert.strictEqual(ctx.resolveBot('vp'), null);
  });

  it('exposes watcher resume state without changing bot argv', () => {
    const resumeSummary = { status: 'pending', tx: `0x${'1'.repeat(64)}` };
    const ctx = createContext(['--resilient'], {
      resumeRequested: true,
      resumeSummary,
    });

    assert.strictEqual(ctx.resumeRequested, true);
    assert.strictEqual(ctx.resumeSummary, resumeSummary);
    assert.deepStrictEqual(ctx.args, ['--resilient']);
  });

  it('does not leak a parent resume marker into fresh child commands', async () => {
    const previous = process.env[WATCH_RESUME_ENV_VAR];
    process.env[WATCH_RESUME_ENV_VAR] = '1';

    try {
      const ctx = createContext([], { resumeRequested: true });
      const play = await ctx.playJson(['ape-strong', '1', '60']);
      const freshBot = await ctx.botJson('child-bot');
      const resumedBot = await ctx.botJson('child-bot', [], { resumeRequested: true });

      assert.strictEqual(play.watchResume, null);
      assert.strictEqual(freshBot.watchResume, null);
      assert.strictEqual(resumedBot.watchResume, '1');
    } finally {
      if (previous === undefined) {
        delete process.env[WATCH_RESUME_ENV_VAR];
      } else {
        process.env[WATCH_RESUME_ENV_VAR] = previous;
      }
    }
  });

  it('maps a pending bot summary to the reserved resumable exit code', () => {
    const summary = {
      status: 'pending',
      pending_play: {
        status: 'pending',
        contract: '0x1111111111111111111111111111111111111111',
        gameId: '42',
        tx: `0x${'1'.repeat(64)}`,
      },
    };

    assert.deepStrictEqual(normalizeBotRuntimeResult({
      exitCode: 1,
      summary,
    }), {
      exitCode: RESUMABLE_PENDING_EXIT_CODE,
      summary,
    });
    assert.strictEqual(isResumablePendingSummary(summary), true);
  });

  it('does not reserve resume mode for an ambiguous pending summary', () => {
    const summary = { status: 'pending' };
    assert.deepStrictEqual(normalizeBotRuntimeResult({ exitCode: 0, summary }), {
      exitCode: 1,
      summary,
    });
    assert.strictEqual(isResumablePendingSummary(summary), false);
  });

  it('loads only the newest matching pending summary for resume', () => {
    const logDir = path.join(tmpRoot, 'resume-logs');
    const botDir = path.join(logDir, 'test-bot');
    fs.mkdirSync(botDir, { recursive: true });
    const olderPath = path.join(botDir, 'older.json');
    const newerPath = path.join(botDir, 'newer.json');
    const pendingSummary = {
      status: 'pending',
      args: ['same'],
      pending_play: {
        status: 'pending',
        contract: '0x1111111111111111111111111111111111111111',
        gameId: '42',
        tx: `0x${'1'.repeat(64)}`,
      },
    };
    fs.writeFileSync(olderPath, JSON.stringify(pendingSummary));
    fs.writeFileSync(newerPath, JSON.stringify({ status: 'complete', args: ['other'] }));
    fs.utimesSync(olderPath, new Date(1_000), new Date(1_000));
    fs.utimesSync(newerPath, new Date(2_000), new Date(2_000));

    assert.deepStrictEqual(
      findLatestBotResumeSummary('test-bot', ['same'], { logDir }),
      pendingSummary,
    );

    fs.writeFileSync(newerPath, JSON.stringify({ status: 'completed', args: ['same'] }));
    assert.strictEqual(findLatestBotResumeSummary('test-bot', ['same'], { logDir }), null);

    fs.writeFileSync(newerPath, '{');
    assert.strictEqual(
      findLatestBotResumeSummary('test-bot', ['same'], { logDir }),
      null,
      'an unreadable newer checkpoint must not revive an older pending run',
    );
  });

  it('adds bot-level --resilient to direct playJson calls', async () => {
    const ctx = createContext(['--resilient']);

    const payload = await ctx.playJson(['ape-strong', '1', '60']);

    assert.strictEqual(payload.command, 'play');
    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--resilient', '--json']);
  });

  it('exposes a game paytable as parsed JSON without starting play', async () => {
    const ctx = createContext();

    const payload = await ctx.gamePaytable('speed-keno', ['--picks', '5', '--split', '1']);

    assert.strictEqual(payload.command, 'game');
    assert.deepStrictEqual(payload.args, [
      'speed-keno',
      '--paytable',
      '--picks',
      '5',
      '--split',
      '1',
      '--json',
    ]);
  });

  it('does not duplicate --resilient when a playJson call already includes it', async () => {
    const ctx = createContext(['--resilient']);

    const payload = await ctx.playJson(['ape-strong', '1', '60', '--resilient']);

    assert.strictEqual(payload.args.filter((arg) => arg === '--resilient').length, 1);
    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--resilient', '--json']);
  });

  it('does not add inherited --resilient when the bot-level flag is disabled', async () => {
    const ctx = createContext(['--no-resilient']);

    const payload = await ctx.playJson(['ape-strong', '1', '60']);

    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--json']);
  });

  it('does not treat --resilient=false as a bot-level resilient value', async () => {
    const ctx = createContext(['--resilient=false']);

    const payload = await ctx.playJson(['ape-strong', '1', '60']);

    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--json']);
  });

  it('lets a direct playJson call opt out of inherited --resilient', async () => {
    const ctx = createContext(['--resilient']);

    const payload = await ctx.playJson(['ape-strong', '1', '60', '--no-resilient']);

    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--no-resilient', '--json']);
  });

  it('adds bot-level --resilient to direct play validation calls', async () => {
    const ctx = createContext(['--resilient']);

    const payload = await ctx.validatePlayArgs(['ape-strong', '1', '60']);

    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--resilient', '--validate-only', '--json']);
  });

  it('forwards only transaction retry notices from nested JSON plays', async () => {
    const ctx = createContext(['--resilient']);
    const writes = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };

    try {
      const payload = await ctx.playJson(['ape-strong', '1', '60', '--emit-retry']);
      assert.strictEqual(payload.command, 'play');
    } finally {
      process.stderr.write = originalWrite;
    }

    const output = writes.join('');
    assert.match(output, /⚠️ Contract returns error message "Paused", Rechecking in 3m/);
    assert.doesNotMatch(output, /not a retry notice/);
  });
});

it('preserves the stronger signing boundary across nested calls', async () => {
  const key = 'APECHURCH_RETAINED_BALANCE_WEI';
  const saved = process.env[key];
  try {
    process.env[key] = '100';
    const ctx = createContext();
    assert.equal(ctx.signingCapitalCheck, true);
    assert.equal((await ctx.playJson(['ape-strong', '1'], { env: { [key]: '50' } })).retainedBalance, '100');
    assert.equal((await ctx.botJson('example', ['1'], { env: { [key]: '150' } })).retainedBalance, '150');
  } finally {
    if (saved === undefined) delete process.env[key]; else process.env[key] = saved;
  }
});
