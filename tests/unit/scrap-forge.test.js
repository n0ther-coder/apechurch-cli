import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, parseAbi, parseEther, zeroAddress } from 'viem';
import { GAME_CONTRACT_ABI, SCRAP_FORGE_CONTRACT } from '../../lib/constants.js';
import { getGamePaytable } from '../../lib/game-paytable.js';
import { getScrapForgeLimits, inspectScrapForgeSubmission, SCRAP_FORGE_GAME } from '../../lib/games/scrap-forge.js';
import { resolveGame, resolveGameDisplayName } from '../../registry.js';

test('exposes all UI tier limits and only prices exact configurations', () => {
  const { tiers, maximum_round_wager_ape } = getScrapForgeLimits();
  assert.deepEqual(tiers.map((tier) => [tier.wager_per_forge_ape, tier.max_forges, tier.capsules_per_amp]), [
    [10, 15, 1], [50, 15, 5], [100, 15, 10], [500, 8, 5], [1000, 4, 10],
  ]);
  assert.equal(maximum_round_wager_ape, 4000);
  for (const tier of tiers) {
    const options = { spin: tier.wager_per_forge_ape, split: tier.max_forges };
    const table = getGamePaytable(SCRAP_FORGE_GAME, options);
    assert.equal(table.parameters.round_wager_ape, tier.max_round_wager_ape);
    assert.equal(table.parameters.capsule_class, tier.capsule_class);
    assert.equal(table.max_multiplier, null);
    assert.equal(table.payouts_enumerated, false);
    assert.deepEqual(table.material_paytable.map((row) => row.multiplier), ['0.2', '0.5', '1', '1.5', '2', '4', '10', '25', '50']);
    assert.throws(() => getGamePaytable(SCRAP_FORGE_GAME, { ...options, split: tier.max_forges + 1 }), /exact count/);
  }
  const table = getGamePaytable(SCRAP_FORGE_GAME, { betSplit: '10', amount: '150' });
  assert.equal(table.parameters.forges, 15);
  assert.equal(table.material_paytable[0].payout_ape, '2');
  assert.match(table.notes[0], /Copper/);
  assert.throws(() => getGamePaytable(SCRAP_FORGE_GAME, { spin: '10', amount: '11' }), /exact count/);
  assert.throws(() => getGamePaytable(SCRAP_FORGE_GAME, { amount: '4000' }), /Specify/);
  assert.throws(() => getGamePaytable(SCRAP_FORGE_GAME, { amount: '4000', split: '5' }), /stake per forge/);
  assert.throws(() => getGamePaytable(SCRAP_FORGE_GAME, { bonus: true }), /unavailable/);
});

test('registry resolves the display title without enabling execution', () => {
  for (const alias of [SCRAP_FORGE_GAME.key, ...SCRAP_FORGE_GAME.aliases]) {
    assert.equal(resolveGame(alias), null);
    assert.equal(resolveGameDisplayName({ gameKey: alias }), 'Scrap Forge');
  }
});

const HASH = `0x${'ab'.repeat(32)}`;
const PLAYER = '0x1111111111111111111111111111111111111111';
const WRAPPER = '0xa35500b5c420066d6315da0bec29246efe3660ad';
const ENTROPY = `0x${'02'.repeat(32)}`;
const ID = 2n ** 255n + 1n;
const CVOL_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
const VRF_ABI = parseAbi([
  'event RandomnessRequested(uint64 indexed sequenceNumber, address indexed requester, bytes32 userContribution, uint64 segmentIndex, uint64 blockNumber, uint32 callbackGasLimit)',
]);
const input = encodeFunctionData({
  abi: GAME_CONTRACT_ABI,
  functionName: 'play',
  args: [PLAYER, encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }],
    [7n, 15n, ID, zeroAddress, ENTROPY],
  )],
});
const mintLog = {
  address: '0xb90636359a683fcd9bc2f54623b5c52e48604f08',
  topics: encodeEventTopics({ abi: CVOL_ABI, eventName: 'Transfer', args: { from: zeroAddress, to: PLAYER } }),
  data: encodeAbiParameters([{ type: 'uint256' }], [parseEther('150')]),
};
const vrfLog = {
  address: '0xe892d2576bcf131e1d4a6a31e1921bb27f8f91f2',
  topics: encodeEventTopics({
    abi: VRF_ABI, eventName: 'RandomnessRequested', args: { sequenceNumber: 777n, requester: WRAPPER },
  }),
  data: encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint64' }, { type: 'uint64' }, { type: 'uint32' }],
    [ENTROPY, 0n, 123n, 1100000],
  ),
};

function mockChain({ status = 'success', logs = [mintLog, vrfLog], to = SCRAP_FORGE_CONTRACT, blockNumber = 1000n } = {}) {
  return {
    getTransaction: async () => ({ to, input, blockNumber, value: parseEther('150.1234') }),
    getTransactionReceipt: async () => {
      assert.notEqual(blockNumber, null, 'pending transactions have no receipt');
      return { status, blockNumber, logs, gasUsed: 700000n, effectiveGasPrice: 100000000000n };
    },
  };
}

test('inspect correlates observed receipt evidence and preserves exact monetary units and IDs', async () => {
  const result = await inspectScrapForgeSubmission(mockChain(), HASH);
  assert.equal(result.submission_status, 'accepted');
  assert.equal(result.settlement_status, 'unknown');
  assert.equal(result.round_id, ID.toString());
  assert.ok(result.replay_url.endsWith(`?id=${ID}`));
  assert.equal(result.vrf_sequence_number, '777');
  assert.equal(result.vrf_callback_gas_limit, 1100000);
  assert.equal(result.forges, 15);
  assert.equal(result.round_wager_ape, '150');
  assert.equal(result.value_above_wager_ape, '0.1234');
  assert.equal(result.gas_fee_ape, '0.07');
  assert.equal(result.submitted_cost_wei, parseEther('150.1934').toString());
});

test('inspect preserves unknown values for incomplete or ambiguous evidence', async () => {
  const result = await inspectScrapForgeSubmission(mockChain({ logs: [mintLog, mintLog] }), HASH);
  assert.equal(result.round_wager_ape, undefined);
  assert.equal(result.vrf_sequence_number, undefined);
  assert.equal((await inspectScrapForgeSubmission(mockChain({ status: 'reverted' }), HASH)).round_wager_ape, undefined);
  assert.equal((await inspectScrapForgeSubmission(mockChain({ blockNumber: null }), HASH)).submission_status, 'pending');
  await assert.rejects(inspectScrapForgeSubmission(mockChain({ to: PLAYER }), HASH), /does not target/);
  await assert.rejects(inspectScrapForgeSubmission({}, '0x12'), /32-byte/);
});
