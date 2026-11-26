import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeAbiParameters, encodeAbiParameters, encodeEventTopics, encodeFunctionData, parseAbi, parseEther, zeroAddress } from 'viem';
import { GAME_CONTRACT_ABI, SCRAP_FORGE_CONTRACT } from '../../lib/constants.js';
import { getGamePaytable } from '../../lib/game-paytable.js';
import {
  getScrapForgeLimits, getScrapForgeSelection, inspectScrapForgeSubmission, parseScrapForgeRoundId,
  quoteScrapForge, readScrapForgeRound, SCRAP_FORGE_GAME, SCRAP_FORGE_LENS, simulateScrapForge,
} from '../../lib/games/scrap-forge.js';
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
  assert.equal(table.material_paytable.reduce((sum, { weight }) => sum + weight, table.amp_weight), table.probability_weight_denominator);
  assert.equal(table.probability_source, 'official_frontend_model');
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
const REVEAL_HASH = `0x${'cd'.repeat(32)}`;
const PLAYER = '0x1111111111111111111111111111111111111111';
const NFT = '0x2222222222222222222222222222222222222222';
const VRF = '0xe892d2576bcf131e1d4a6a31e1921bb27f8f91f2';
const VAULT = '0xc7C9276ED86ce559029C5a6b25760b3DDf3273d7';
const CLAIM_MANAGER = '0xd2a5c5f58bdbed24ef919d9dfb312ca84e7b31dd';
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

const REVEAL_ABI = parseAbi(['function reveal(uint64 sequenceNumber, bytes32 userContribution, bytes32 revelation)']);
const REWARD_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
]);
const nftReceiptLogs = [
  {
    address: NFT,
    topics: encodeEventTopics({ abi: REWARD_ABI, eventName: 'Transfer', args: { from: zeroAddress, to: PLAYER, tokenId: ID } }),
    data: '0x',
    logIndex: 1,
  },
  {
    address: NFT,
    topics: encodeEventTopics({ abi: REWARD_ABI, eventName: 'TransferSingle', args: { operator: WRAPPER, from: WRAPPER, to: PLAYER } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [2n, 6n]),
    logIndex: 2,
  },
  {
    address: NFT,
    topics: encodeEventTopics({ abi: REWARD_ABI, eventName: 'TransferBatch', args: { operator: WRAPPER, from: WRAPPER, to: PLAYER } }),
    data: encodeAbiParameters([{ type: 'uint256[]' }, { type: 'uint256[]' }], [[3n, 4n], [5n, 9n]]),
    logIndex: 3,
  },
  mintLog,
];

function chainWithReveal({ sequence = 777n, contribution = ENTROPY, status = 'success', logs = nftReceiptLogs, request, blockNumber = 1001n } = {}) {
  const submission = mockChain();
  const reveal = {
    to: VRF, blockNumber,
    input: encodeFunctionData({ abi: REVEAL_ABI, functionName: 'reveal', args: [
      sequence, contribution, `0x${'03'.repeat(32)}`,
    ] }),
  };
  return {
    getTransaction: async ({ hash }) => hash === REVEAL_HASH ? reveal : submission.getTransaction(),
    getTransactionReceipt: async ({ hash }) => hash === REVEAL_HASH ? { status, blockNumber, logs } : submission.getTransactionReceipt(),
    request: async (rpc) => request(rpc, reveal),
  };
}

test('matches the reveal without inferring settlement or valuing NFT transfers', async () => {
  const result = await inspectScrapForgeSubmission(chainWithReveal(), HASH, { revealHash: REVEAL_HASH });
  assert.equal(result.reveal_status, 'confirmed');
  assert.equal(result.settlement_status, 'unknown');
  assert.deepEqual(result.reveal_nft_transfers_to_player.map(({ standard, token_id, quantity }) => [standard, token_id, quantity]), [
    ['ERC721', ID.toString(), '1'], ['ERC1155', '2', '6'], ['ERC1155', '3', '5'], ['ERC1155', '4', '9'],
  ]);
  assert.equal(result.trace_status, undefined);
  const reverted = await inspectScrapForgeSubmission(chainWithReveal({ status: 'reverted' }), HASH, { revealHash: REVEAL_HASH, trace: true });
  assert.equal(reverted.reveal_status, 'reverted');
  assert.equal(reverted.reveal_nft_transfers_to_player, undefined);
  const pending = await inspectScrapForgeSubmission(chainWithReveal({ blockNumber: null }), HASH, { revealHash: REVEAL_HASH });
  assert.equal(pending.reveal_status, 'pending');
});

test('rejects unrelated or out-of-order reveals', async () => {
  for (const mismatch of [{ sequence: 778n }, { contribution: `0x${'04'.repeat(32)}` }]) {
    await assert.rejects(inspectScrapForgeSubmission(chainWithReveal(mismatch), HASH, { revealHash: REVEAL_HASH }), /does not match/);
  }
  await assert.rejects(inspectScrapForgeSubmission(chainWithReveal({ blockNumber: 999n }), HASH, { revealHash: REVEAL_HASH }), /must follow/);
  await assert.rejects(inspectScrapForgeSubmission(mockChain({ logs: [mintLog, vrfLog, vrfLog] }), HASH, { revealHash: REVEAL_HASH }), /no unique/);
});

const payment = (from, to, amount, extras = {}) => ({ type: 'CALL', from, to, value: `0x${parseEther(amount).toString(16)}`, ...extras });

test('counts successful direct and ClaimManager outputs once, within the Forge path', async () => {
  const chain = chainWithReveal({
    request: (rpc, tx) => {
      assert.deepEqual(rpc, { method: 'debug_traceTransaction', params: [REVEAL_HASH, { tracer: 'callTracer' }] });
      return {
        type: 'CALL', to: VRF, input: tx.input,
        calls: [
          payment(VRF, SCRAP_FORGE_CONTRACT, '0', { calls: [
            payment(SCRAP_FORGE_CONTRACT, CLAIM_MANAGER, '49', { calls: [payment(CLAIM_MANAGER, PLAYER, '49')] }),
            payment(SCRAP_FORGE_CONTRACT, PLAYER, '3'),
            payment(SCRAP_FORGE_CONTRACT, PLAYER, '10', { error: 'execution reverted' }),
            payment(SCRAP_FORGE_CONTRACT, NFT, '0', { error: 'execution reverted', calls: [payment(SCRAP_FORGE_CONTRACT, PLAYER, '12')] }),
          ] }),
          payment(CLAIM_MANAGER, PLAYER, '110'),
          payment(NFT, PLAYER, '5'),
        ],
      };
    },
  });
  const result = await inspectScrapForgeSubmission(chain, HASH, { revealHash: REVEAL_HASH, trace: true });
  assert.equal(result.trace_status, 'observed');
  assert.equal(result.ape_received_via_forge_paths, '52');
  assert.equal(result.ape_received_via_forge_paths_wei, parseEther('52').toString());
});

test('keeps correlated receipts when tracing is unsupported or the callback is missing', async () => {
  const missing = await inspectScrapForgeSubmission(chainWithReveal({
    request: (_rpc, tx) => ({ type: 'CALL', to: VRF, input: tx.input }),
  }), HASH, { revealHash: REVEAL_HASH, trace: true });
  assert.equal(missing.trace_status, 'no_successful_forge_call');
  assert.equal(missing.ape_received_via_forge_paths, undefined);
  const unsupported = await inspectScrapForgeSubmission(chainWithReveal({
    request: () => { throw new Error('RPC method unavailable'); },
  }), HASH, { revealHash: REVEAL_HASH, trace: true });
  assert.equal(unsupported.reveal_status, 'confirmed');
  assert.equal(unsupported.trace_status, 'unavailable');
  assert.equal(unsupported.reveal_nft_transfers_to_player.length, 4);
});

test('reads an exact quote at one block and checks live limits and wei reconciliation', async () => {
  const selection = getScrapForgeSelection({ spin: '500', split: '5' });
  let max = 8;
  let paused = false;
  let value = parseEther('2500.125');
  const calls = [];
  const chain = {
    getBlockNumber: async () => 444n,
    readContract: async (request) => {
      assert.equal(request.blockNumber, 444n);
      calls.push(request.functionName);
      if (request.functionName === 'paused') return paused;
      assert.equal(request.address, SCRAP_FORGE_LENS);
      if (request.functionName === 'maxForgesAllowed') {
        assert.deepEqual(request.args, [3]);
        return max;
      }
      assert.equal(request.functionName, 'getPlayValue');
      assert.deepEqual(request.args, [3, 5]);
      return [parseEther('2500'), parseEther('0.125'), value];
    },
  };
  const quote = await quoteScrapForge(chain, selection);
  assert.deepEqual(calls, ['maxForgesAllowed', 'paused', 'getPlayValue']);
  assert.equal(quote.transaction_value.wei, value.toString());
  assert.equal(quote.gas_fee, null);
  value += 1n;
  await assert.rejects(quoteScrapForge(chain, selection), /did not reconcile/);
  max = 4;
  await assert.rejects(quoteScrapForge(chain, selection), /live limit.*4/);
  paused = true;
  await assert.rejects(quoteScrapForge(chain, selection), /paused/);
});

test('reads Forge outcomes and linked Vault pulls without equating reported payout with cash', async () => {
  const info = {
    player: PLAYER, tier: 0, forges: 3, betAmount: parseEther('10'),
    bucketIndexes: [0, 9, 2], totalPayout: parseEther('112'), metalPayout: parseEther('12'),
    capsuleSpend: parseEther('100'), vault: VAULT, vaultRequestId: 123n, hasEnded: true, owed: false,
  };
  let vaultId = 123n;
  let readCount = 0;
  const chain = {
    getBlockNumber: async () => 555n,
    readContract: async (request) => {
      assert.equal(request.blockNumber, 555n);
      assert.deepEqual(request.args, [ID]);
      readCount++;
      if (request.functionName === 'getGameInfo') {
        assert.equal(request.address, SCRAP_FORGE_CONTRACT);
        return info;
      }
      assert.equal(request.address, SCRAP_FORGE_LENS);
      assert.equal(request.functionName, 'getVaultPulls');
      return [VAULT, vaultId, 4, 1, 1, [
        { forgeIndex: 1, kind: 1, delivery: 0, capsule: 0, listingId: 789n, amountOrValue: parseEther('80') },
      ]];
    },
  };
  const round = await readScrapForgeRound(chain, parseScrapForgeRoundId(ID.toString()));
  assert.equal(round.wager.ape, '30');
  assert.equal(round.metal_payout.ape, '12');
  assert.equal(round.reported_total_payout.ape, '112');
  assert.equal(round.net_pnl, undefined);
  assert.deepEqual(round.outcomes.map(({ outcome }) => outcome), ['Cast Iron', 'AMP', 'Zinc']);
  assert.equal(round.vault_draw.pulls[0].listing_id, '789');
  assert.equal(round.vault_draw.pulls[0].amount_or_value.ape, '80');
  vaultId = 124n;
  await assert.rejects(readScrapForgeRound(chain, ID), /linked to this round/);
  info.hasEnded = false;
  readCount = 0;
  assert.equal((await readScrapForgeRound(chain, ID)).vault_draw, null);
  assert.equal(readCount, 1);
  info.player = zeroAddress;
  await assert.rejects(readScrapForgeRound(chain, ID), /not found/);
  assert.throws(() => parseScrapForgeRoundId((2n ** 256n).toString()), /uint256/);
  assert.throws(() => parseScrapForgeRoundId('-1'), /uint256/);
});

test('links a separate Vault reveal by its round request and fulfillment events', async () => {
  const abi = parseAbi([
    'event RandomnessFulfilled(uint64 indexed sequenceNumber, bytes32 randomness, uint32 gasUsed)',
    'event RandomnessReceived(uint256 indexed requestId, uint64 vrfId)',
    'event Pulled(uint256 indexed requestId, uint16 group, uint16 index, uint8 prizeKind, uint256 listingIdOrAmount, uint256 value)',
    'event RequestDone(uint256 indexed requestId)',
  ]);
  const event = (address, eventName, args, data) => ({
    address, topics: encodeEventTopics({ abi, eventName, args }), data,
  });
  const requestId = 24n;
  const sequence = 803n;
  const logs = [
    event(VAULT, 'RandomnessReceived', { requestId }, encodeAbiParameters([{ type: 'uint64' }], [sequence])),
    event(VAULT, 'Pulled', { requestId }, encodeAbiParameters(
      [{ type: 'uint16' }, { type: 'uint16' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }],
      [0, 0, 1, 25n, parseEther('41')],
    )),
    event(VAULT, 'RequestDone', { requestId }, '0x'),
    event(VRF, 'RandomnessFulfilled', { sequenceNumber: sequence }, encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint32' }], [ENTROPY, 500000],
    )),
    ...nftReceiptLogs.map((log) => log !== nftReceiptLogs[0] ? log : {
      ...log, topics: encodeEventTopics({
        abi: REWARD_ABI, eventName: 'Transfer', args: { from: VAULT, to: PLAYER, tokenId: ID },
      }),
    }),
  ];
  const chain = chainWithReveal({ logs, sequence, contribution: `0x${'f5'.repeat(32)}` });
  let linked = requestId;
  chain.readContract = async (request) => {
    assert.equal(request.address, SCRAP_FORGE_CONTRACT);
    assert.equal(request.functionName, 'getGameInfo');
    assert.equal(request.blockNumber, 1001n);
    assert.deepEqual(request.args, [ID]);
    return { player: PLAYER, hasEnded: true, vault: VAULT, vaultRequestId: linked };
  };
  const inspection = await inspectScrapForgeSubmission(chain, HASH, { vaultRevealHash: REVEAL_HASH });
  assert.equal(inspection.vrf_sequence_number, '777');
  assert.equal(inspection.reveal_status, undefined);
  assert.equal(inspection.vault_reveal.vrf_sequence_number, '803');
  assert.equal(inspection.vault_reveal.request_id, '24');
  assert.equal(inspection.vault_reveal.request_done_in_receipt, true);
  assert.deepEqual(inspection.vault_reveal.pulls.map(({ listing_id_or_amount }) => listing_id_or_amount), ['25']);
  assert.deepEqual(inspection.vault_reveal.nft_transfers_to_player.map(({ token_id }) => token_id), [ID.toString()]);
  await assert.rejects(inspectScrapForgeSubmission(chain, HASH, { revealHash: REVEAL_HASH }), /does not match/);
  linked = 31n;
  await assert.rejects(inspectScrapForgeSubmission(chain, HASH, { vaultRevealHash: REVEAL_HASH }), /does not prove/);
  linked = requestId;
  logs[0] = { ...logs[0], address: NFT };
  await assert.rejects(inspectScrapForgeSubmission(chain, HASH, { vaultRevealHash: REVEAL_HASH }), /does not prove/);
});

test('simulates quoted play at the quote block with the official nested fields', async () => {
  const calls = [];
  const chain = {
    getBlockNumber: async () => 111n,
    readContract: async ({ functionName }) => {
      if (functionName === 'paused') return false;
      if (functionName === 'maxForgesAllowed') return 15;
      return [parseEther('50'), parseEther('0.125'), parseEther('50.125')];
    },
    simulateContract: async (req) => { calls.push(req); },
  };
  const selection = getScrapForgeSelection({ spin: '10', split: '5' });
  await assert.rejects(simulateScrapForge(chain, selection, zeroAddress), /nonzero public/);
  const result = await simulateScrapForge(chain, selection, PLAYER);
  assert.equal(calls.length, 1);
  const [request] = calls;
  assert.equal(request.blockNumber, 111n);
  assert.equal(request.address, SCRAP_FORGE_CONTRACT);
  assert.equal(request.account, PLAYER);
  assert.equal(request.functionName, 'play');
  assert.equal(request.value, parseEther('50.125'));
  const [recipient, data] = request.args;
  assert.equal(recipient, PLAYER);
  const [tier, forges, gameId, referral, entropy] = decodeAbiParameters(
    [{ type: 'uint8' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }], data,
  );
  assert.deepEqual([tier, forges], [0, 5]);
  assert.equal(typeof gameId, 'bigint');
  assert.match(referral, /^0x[0-9a-f]{40}$/i);
  assert.match(entropy, /^0x[0-9a-f]{64}$/i);
  assert.deepEqual(result.simulation, { status: 'success', from: PLAYER, rpc_method: 'eth_call' });
});
