import { describe, it } from 'node:test';
import assert from 'node:assert';
import { decodeAbiParameters, parseEther } from 'viem';
import {
  encodeSlotsGameData,
  getSlotsMinimumWager,
  getSlotsTransactionFee,
  getSlotsVrfGasLimit,
  playSlots,
  resolveSlotsConfig,
} from '../../lib/games/slots.js';

describe('Slots config resolution', () => {
  const gameEntry = {
    config: {
      spins: {
        min: 1,
        max: 15,
        default: 10,
      },
    },
  };

  it('prefers explicit --spins over every fallback', () => {
    const config = resolveSlotsConfig({
      opts: { spins: '12' },
      positionalConfig: { spins: 9 },
      strategyConfig: { slots: { spins: [7, 12] } },
      randomIntInclusive: () => 8,
      gameEntry,
      preferGameDefault: true,
    });

    assert.deepStrictEqual(config, { spins: 12 });
  });

  it('prefers positional spins over the registry default', () => {
    const config = resolveSlotsConfig({
      opts: {},
      positionalConfig: { spins: 6 },
      strategyConfig: { slots: { spins: [7, 12] } },
      randomIntInclusive: () => 8,
      gameEntry,
      preferGameDefault: true,
    });

    assert.deepStrictEqual(config, { spins: 6 });
  });

  it('uses the game default for manual fixed-game play when requested', () => {
    const config = resolveSlotsConfig({
      opts: {},
      positionalConfig: {},
      strategyConfig: { slots: { spins: [7, 12] } },
      randomIntInclusive: () => 8,
      gameEntry,
      preferGameDefault: true,
    });

    assert.deepStrictEqual(config, { spins: 10 });
  });

  it('keeps strategy-driven randomness when the game default is not preferred', () => {
    const config = resolveSlotsConfig({
      opts: {},
      positionalConfig: {},
      strategyConfig: { slots: { spins: [7, 12] } },
      randomIntInclusive: () => 8,
      gameEntry,
      preferGameDefault: false,
    });

    assert.deepStrictEqual(config, { spins: 8 });
  });
});

describe('Slots VRF fee config', () => {
  it('computes the observed Reel Pirates dynamic gas limit', () => {
    assert.equal(
      getSlotsVrfGasLimit({ name: 'Reel Pirates', vrf: { type: 'slots-dynamic', baseGas: 550000, perUnitGas: 200000 } }, 15),
      3550000
    );
    assert.equal(
      getSlotsVrfGasLimit({ name: 'Reel Pirates', vrf: { type: 'slots-dynamic', baseGas: 550000, perUnitGas: 200000 } }, 5),
      1550000
    );
  });

  it('adds the Reel Pirates executor fee per spin', async () => {
    const calls = [];
    const publicClient = {
      async readContract(call) {
        calls.push(call);
        if (call.functionName === 'getVRFFee') return 393n;
        if (call.functionName === 'EXECUTOR_FEE') return 40n;
        throw new Error(`unexpected call ${call.functionName}`);
      },
    };
    const gameEntry = {
      contract: '0x5E405198B349d6522BbB614E7391bDC4F4F6f681',
      vrf: { type: 'slots-dynamic', baseGas: 550000, perUnitGas: 200000, executorFee: 'per-spin' },
    };

    const fee = await getSlotsTransactionFee(publicClient, gameEntry, 10);

    assert.equal(fee, 793n);
    assert.equal(calls[0].functionName, 'getVRFFee');
    assert.deepStrictEqual(calls[0].args, [2550000]);
    assert.equal(calls[1].functionName, 'EXECUTOR_FEE');
  });

  it('computes the Reel Pirates minimum wager from bet-per-spin', () => {
    assert.equal(
      getSlotsMinimumWager({ config: { minBetPerSpinApe: 2.5 } }, 10),
      25000000000000000000n
    );
  });

  it('rejects Reel Pirates wagers below the per-spin minimum before reading fees', async () => {
    const publicClient = {
      async readContract() {
        throw new Error('fee should not be read');
      },
    };
    const gameEntry = {
      name: 'Reel Pirates',
      contract: '0x5E405198B349d6522BbB614E7391bDC4F4F6f681',
      slug: 'reel-pirates',
      config: {
        minBetPerSpinApe: 2.5,
        gameDataOrder: 'spins-first',
        spins: { min: 1, max: 15, default: 10 },
      },
      vrf: { type: 'slots-dynamic', baseGas: 550000, perUnitGas: 200000, executorFee: 'per-spin' },
    };

    await assert.rejects(
      () => playSlots({
        account: { address: '0x0000000000000000000000000000000000000001' },
        publicClient,
        walletClient: {},
        gameEntry,
        wager: parseEther('20'),
        spins: 10,
        timeoutMs: 0,
      }),
      /requires at least 2\.5 APE per spin \(25 APE total for 10 spins\)/
    );
  });
});

describe('Slots game data encoding', () => {
  const refAddress = '0x0000000000000000000000000000000000000001';
  const userRandomWord = '0x1111111111111111111111111111111111111111111111111111111111111111';

  it('keeps the classic slot ABI order by default', () => {
    const encoded = encodeSlotsGameData({
      gameId: 123n,
      spins: 7,
      refAddress,
      userRandomWord,
    });
    const decoded = decodeAbiParameters(
      [
        { name: 'gameId', type: 'uint256' },
        { name: 'numSpins', type: 'uint8' },
        { name: 'ref', type: 'address' },
        { name: 'userRandomWord', type: 'bytes32' },
      ],
      encoded
    );

    assert.deepStrictEqual(decoded, [123n, 7, refAddress, userRandomWord]);
  });

  it('supports the Reel Pirates spins-first payload', () => {
    const encoded = encodeSlotsGameData({
      gameId: 456n,
      spins: 15,
      refAddress,
      userRandomWord,
      order: 'spins-first',
    });
    const decoded = decodeAbiParameters(
      [
        { name: 'numSpins', type: 'uint256' },
        { name: 'gameId', type: 'uint256' },
        { name: 'ref', type: 'address' },
        { name: 'userRandomWord', type: 'bytes32' },
      ],
      encoded
    );

    assert.deepStrictEqual(decoded, [15n, 456n, refAddress, userRandomWord]);
  });
});
