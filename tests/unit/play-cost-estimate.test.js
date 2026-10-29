import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseEther, decodeAbiParameters } from 'viem';
import { resolveGame } from '../../registry.js';
import { getConfiguredGameVrfFeeWei, getConfiguredGameVrfFeeApe } from '../../lib/loop-estimate.js';
import { estimatePlayCosts } from '../../lib/play-cost-estimate.js';
import { prepareGameTransaction } from '../../lib/games/index.js';
import { estimateGasUnits, observeGasReceipt, gasModeKey, GAS_SAMPLE_TTL_MS } from '../../lib/gas-estimates.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-cost-estimate-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const gameEntry = resolveGame('ape-strong');
const config = { range: 70 };
const account = `0x${'1'.repeat(40)}`;
const now = Date.now();
const hash = n => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const fee = 123456789012345678n;
const client = { chain: { id: 33139 }, getGasPrice: async () => 7n,
  readContract: async () => fee };
const file = name => path.join(root, `${name}.json`);
const mode = { chainId: 33139, contract: gameEntry.contract, config };
function observe(cacheFile, n, gas = 200000n, extra = {}) {
  return observeGasReceipt({ ...mode, cacheFile, hash: hash(n), now,
    receipt: { status: 'success', gasUsed: gas }, ...extra });
}

describe('read-only exact play cost estimates', () => {
  it('keeps all contract fee digits and adds current gas and explicit reserve exactly', async () => {
    assert.equal(await getConfiguredGameVrfFeeWei({ publicClient: client, gameEntry }), fee);
    assert.equal(await getConfiguredGameVrfFeeApe({ publicClient: client, gameEntry }), Number('0.123456789012345678'));
    const result = await estimatePlayCosts({ publicClient: client, gameEntry, config,
      cacheFile: file('exact'), additionalReserveApe: '0.000000000000000003' });
    assert.equal(result.transaction_fee_wei, fee.toString());
    assert.equal(result.gas_source, 'fallback');
    assert.equal(result.gas_units, '460000');
    assert.equal(result.total_wei, (fee + 460000n * 7n + 3n).toString());
    await assert.rejects(estimatePlayCosts({ publicClient: client, gameEntry,
      additionalReserveApe: '-1' }), /cannot be negative/);
    for (const options of [{ additionalReserveApe: '0.0000000000000000001' },
      { amountApe: '1.0000000000000000001' }]) {
      await assert.rejects(estimatePlayCosts({ publicClient: client, gameEntry, ...options }), /18 decimal places/);
    }
  });

  it('prepares the actual encoded request and estimates gas without signing or submitting', async () => {
    const requests = [];
    const publicClient = { ...client, estimateContractGas: async request => { requests.push(request); return 300001n; } };
    const result = await estimatePlayCosts({ publicClient, gameEntry, config, account,
      amountApe: '17.000000000000000001', cacheFile: file('rpc') });
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request.functionName, 'play');
    assert.equal(request.account, account);
    assert.equal(request.value, parseEther('17.000000000000000001') + fee);
    assert.equal(decodeAbiParameters([{ type: 'uint8' }, { type: 'uint256' },
      { type: 'address' }, { type: 'bytes32' }], request.args[1])[0], 70);
    assert.equal(result.gas_source, 'rpc');
    assert.equal(result.gas_units, '345002');
    assert.equal(result.total_wei, (fee + 345002n * 7n).toString());
    assert.equal(fs.existsSync(file('rpc')), false);
  });

  it('falls back on failed RPC estimation, without hiding invalid wager configuration', async () => {
    const publicClient = { ...client, estimateContractGas: async () => { throw new Error('RPC unavailable'); } };
    const result = await estimatePlayCosts({ publicClient, gameEntry, config, account,
      amountApe: '10', cacheFile: file('rpc-failed') });
    assert.equal(result.gas_source, 'fallback');
    await assert.rejects(estimatePlayCosts({ publicClient, gameEntry, account,
      config: { range: 1 }, amountApe: '10' }), /range/i);
  });

  it('includes dynamic VRF and executor fees for the configured purchase mode', async () => {
    const entry = resolveGame('blizzard-blitz');
    const publicClient = { ...client, readContract: async ({ functionName }) => functionName === 'EXECUTOR_FEE' ? 19n : fee };
    const exact = await getConfiguredGameVrfFeeWei({ publicClient, gameEntry: entry, config: { bonus: true } });
    const prepared = await prepareGameTransaction({ publicClient, game: entry.key,
      account: { address: account }, amountApe: '100', bonus: true });
    assert.equal(exact, fee + 19n);
    assert.equal(prepared.transactionFeeWei, exact);
    assert.equal(prepared.request.value, parseEther('100') + exact);
  });
});

describe('bounded receipt gas calibration', () => {
  it('deduplicates samples, separates modes and chains, and expires stale observations', () => {
    const cacheFile = file('samples');
    for (let n = 1; n <= 5; n++) assert.equal(observe(cacheFile, n), true);
    assert.equal(observe(cacheFile, 1), false);
    const options = { ...mode, cacheFile, now };
    assert.equal(estimateGasUnits(options).source, 'receipts');
    assert.equal(estimateGasUnits(options).gasUnits, 230000n);
    assert.equal(estimateGasUnits({ ...options, config: { range: 71 } }).source, 'fallback');
    assert.equal(estimateGasUnits({ ...options, chainId: 1 }).source, 'fallback');
    assert.equal(estimateGasUnits({ ...options, now: now + GAS_SAMPLE_TTL_MS + 1 }).source, 'fallback');
    assert.equal(estimateGasUnits({ ...options, gasUnits: 900000n }).gasUnits, 900000n);
    assert.throws(() => estimateGasUnits({ ...options, gasUnits: 0 }), /must be positive/);
    assert.equal(gasModeKey({ ...mode, config: { range: 70, wagerPerSplit: '1' } }), gasModeKey(mode));
  });

  it('raises reserves immediately on an expensive observation and keeps only a bounded window', () => {
    const cacheFile = file('bounded');
    assert.equal(observe(cacheFile, 1, 600000n), true);
    assert.equal(estimateGasUnits({ ...mode, cacheFile, now }).gasUnits, 690000n);
    for (let n = 2; n <= 40; n++) observe(cacheFile, n);
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    assert.equal(data.modes[gasModeKey(mode)].length, 32);
    assert.equal(estimateGasUnits({ ...mode, cacheFile, now }).gasUnits, 230000n);
    assert.equal(estimateGasUnits({ ...mode, cacheFile, now, rpcGas: 500000n }).gasUnits, 575000n);
  });

  it('ignores reverted and pending receipts and recovers from a malformed cache', () => {
    const cacheFile = file('malformed');
    assert.equal(observe(cacheFile, 1, 200000n, { receipt: { status: 'reverted', gasUsed: 900000n } }), false);
    assert.equal(observe(cacheFile, 2, 200000n, { receipt: null }), false);
    assert.equal(fs.existsSync(cacheFile), false);
    fs.writeFileSync(cacheFile, '{');
    assert.equal(estimateGasUnits({ ...mode, cacheFile, now }).source, 'fallback');
    assert.equal(observe(cacheFile, 3), true);
    assert.equal(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).version, 1);
    const locked = file('locked');
    fs.writeFileSync(`${locked}.lock`, '');
    assert.equal(observe(locked, 4), false);
    assert.equal(fs.existsSync(locked), false);
  });

  it('reads a receipt added by another process instead of keeping stale in-memory statistics', () => {
    const cacheFile = file('subprocess');
    for (let n = 1; n <= 5; n++) observe(cacheFile, n);
    assert.equal(estimateGasUnits({ ...mode, cacheFile, now }).gasUnits, 230000n);
    const module = pathToFileURL(path.resolve('lib/gas-estimates.js')).href;
    const input = { ...mode, cacheFile, hash: hash(6), now,
      receipt: { status: 'success', gasUsed: '700000' } };
    const run = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { observeGasReceipt } from ${JSON.stringify(module)}; if (!observeGasReceipt(JSON.parse(process.argv[1]))) process.exit(1);`,
      JSON.stringify(input)], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(estimateGasUnits({ ...mode, cacheFile, now }).gasUnits, 805000n);
  });
});
