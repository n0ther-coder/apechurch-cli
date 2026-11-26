import { decodeAbiParameters, decodeEventLog, decodeFunctionData, formatEther, parseAbi, parseEther, zeroAddress } from 'viem';
import { GAME_CONTRACT_ABI, SCRAP_FORGE_CONTRACT } from '../constants.js';

export const SCRAP_FORGE_GAME = Object.freeze({
  key: 'scrap-forge',
  name: 'Scrap Forge',
  aliases: Object.freeze(['scrapforge', 'forge']),
  slug: 'hv-mtl-scrapyard/forge',
  type: 'slots',
  description: 'Material awards and AMP Vault capsules. CLI support is read-only.',
  contract: SCRAP_FORGE_CONTRACT,
  abiVerified: false,
  readOnly: true,
});

export const SCRAP_FORGE_BNF = Object.freeze([
  '<forge-game> ::= "scrap-forge" | "scrapforge" | "forge"',
  '<forge-command> ::= "game" <forge-game> [ <forge-action> ] [ "--json" ]',
  '<forge-action> ::= "--limits" | "--transaction" <hash> [ "--reveal" <hash> [ "--trace" ] ] | "--paytable" [ <forge-selection> ]',
  '<forge-selection> ::= <forge-stake> [ "--split" <count> ] [ "--amount" <wager> ] | "--amount" <wager> "--split" <count>',
  '<forge-stake> ::= ( "--spin" | "--bet-split" ) <ape-per-forge>',
  '<ape-per-forge> ::= "10" | "50" | "100" | "500" | "1000"',
  '<count> ::= <integer> ; 1–15 at 10/50/100 APE, 1–8 at 500, 1–4 at 1000',
  '<wager> ::= <integer> ; exact base wager in APE, equal to stake × count',
  '<hash> ::= "0x" <hex-digit>{64} ; ApeChain transaction hash',
]);

export const SCRAP_FORGE_TIERS = Object.freeze([
  { stake: 10, maxCount: 15, capsuleClass: 'standard', capsules: 1 },
  { stake: 50, maxCount: 15, capsuleClass: 'standard', capsules: 5 },
  { stake: 100, maxCount: 15, capsuleClass: 'standard', capsules: 10 },
  { stake: 500, maxCount: 8, capsuleClass: 'premium', capsules: 5 },
  { stake: 1000, maxCount: 4, capsuleClass: 'premium', capsules: 10 },
].map(Object.freeze));

export const SCRAP_FORGE_MATERIALS = Object.freeze([
  ['Cast Iron', '0.2'],
  ['Steel', '0.5'],
  ['Zinc', '1'],
  ['Lead', '1.5'],
  ['Aluminum', '2'],
  ['Stainless Steel', '4'],
  ['Brass', '10'],
  ['Copper', '25'],
  ['Tungsten Carbide', '50'],
].map(Object.freeze));

export const SCRAP_FORGE_RULE_SOURCE = 'official_game_ui';
export const SCRAP_FORGE_COPPER_NOTE = 'Copper is 25× in the output table; the rules example implies 10×. On-chain multiplier unverified.';

export function getScrapForgeLimits() {
  return {
    game: SCRAP_FORGE_GAME.key,
    source: SCRAP_FORGE_RULE_SOURCE,
    observed_date: '2026-11-26',
    minimum_round_wager_ape: 10,
    maximum_round_wager_ape: 4000,
    tiers: SCRAP_FORGE_TIERS.map(({ stake, maxCount, capsuleClass, capsules }) => ({
      wager_per_forge_ape: stake,
      min_forges: 1,
      max_forges: maxCount,
      max_round_wager_ape: stake * maxCount,
      capsule_class: capsuleClass,
      capsules_per_amp: capsules,
    })),
  };
}

function parseInteger(value, label) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return Number(text);
}

export function getScrapForgeSelection(options) {
  if (options.spin !== undefined && options.betSplit !== undefined) {
    throw new Error('Use either --spin or --bet-split for Scrap Forge.');
  }
  const rawStake = options.spin ?? options.betSplit;
  const rawCount = options.split;
  const rawAmount = options.amount;
  if ([rawStake, rawCount, rawAmount].every((value) => value === undefined)) return null;

  const amount = rawAmount === undefined ? undefined : parseInteger(rawAmount, '--amount');
  const count = rawCount === undefined ? undefined : parseInteger(rawCount, '--split');
  if (rawStake === undefined && (amount === undefined || count === undefined)) {
    throw new Error('Specify --spin or --bet-split, or specify both --amount and --split.');
  }
  const stake = rawStake === undefined ? amount / count : parseInteger(rawStake, 'Stake per forge');
  const tier = SCRAP_FORGE_TIERS.find((candidate) => candidate.stake === stake);
  if (!tier) throw new Error('Scrap Forge stake per forge must be 10, 50, 100, 500, or 1000 APE.');

  const forges = count ?? (amount === undefined ? 1 : amount / stake);
  if (!Number.isInteger(forges) || forges < 1 || forges > tier.maxCount) {
    throw new Error(`${stake} APE per forge requires an exact count from 1 to ${tier.maxCount}.`);
  }
  const wager = stake * forges;
  if (amount !== undefined && wager !== amount) {
    throw new Error('--amount must equal the stake per forge multiplied by --split.');
  }
  return {
    wager_per_forge_ape: stake,
    forges,
    round_wager_ape: wager,
    capsule_class: tier.capsuleClass,
    capsules_per_amp: tier.capsules,
  };
}

const CVOL_TOKEN = '0xb90636359a683fcd9bc2f54623b5c52e48604f08';
const APE_VRF = '0xe892d2576bcf131e1d4a6a31e1921bb27f8f91f2';
const SCRAPYARD_VRF_WRAPPER = '0xa35500b5c420066d6315da0bec29246efe3660ad';
const CLAIM_MANAGER = '0xd2a5c5f58bdbed24ef919d9dfb312ca84e7b31dd';
const SUBMISSION_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event RandomnessRequested(uint64 indexed sequenceNumber, address indexed requester, bytes32 userContribution, uint64 segmentIndex, uint64 blockNumber, uint32 callbackGasLimit)',
]);
const REVEAL_ABI = parseAbi([
  'function reveal(uint64 sequenceNumber, bytes32 userContribution, bytes32 revelation)',
]);
const NFT_TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
]);
// The sample calldata proves the word positions, without proving the Solidity
// types or the meaning of the first word for other configurations.
const GAME_DATA_WORDS = Array.from({ length: 5 }, () => ({ type: 'bytes32' }));

function findSubmissionEvent(logs, address, eventName, match) {
  const matches = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== address) continue;
    let args;
    try {
      ({ args } = decodeEventLog({ abi: SUBMISSION_ABI, eventName, topics: log.topics, data: log.data }));
    } catch { continue; }
    if (match(args)) matches.push(args);
  }
  return matches.length === 1 ? matches[0] : null;
}

export function validateScrapForgeTransactionHash(hash, option = '--transaction') {
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error(`${option} requires a 32-byte hexadecimal transaction hash.`);
}

function findNftTransfers(logs, player) {
  const transfers = [];
  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: NFT_TRANSFER_ABI, topics: log.topics, data: log.data });
    } catch { continue; }
    const { eventName, args } = decoded;
    if (args.to.toLowerCase() !== player) continue;
    const base = { contract: log.address, from: args.from, log_index: log.logIndex };
    if (eventName === 'Transfer') {
      // ERC-20 Transfer shares the signature but uses data for the amount.
      if (log.topics.length !== 4 || log.data !== '0x') continue;
      transfers.push({ ...base, standard: 'ERC721', token_id: args.tokenId.toString(), quantity: '1' });
    } else {
      const ids = eventName === 'TransferBatch' ? args.ids : [args.id];
      const values = eventName === 'TransferBatch' ? args.values : [args.value];
      if (ids.length !== values.length) continue;
      for (const [index, id] of ids.entries()) {
        transfers.push({ ...base, standard: 'ERC1155', token_id: id.toString(), quantity: values[index].toString() });
      }
    }
  }
  return transfers;
}

function findObservedCash(trace, player) {
  const forge = SCRAP_FORGE_CONTRACT.toLowerCase();
  const pending = [{ frame: trace, inForge: false, inClaim: false }];
  let observed = 0n;
  let sawForge = false;
  while (pending.length > 0) {
    const { frame, inForge, inClaim } = pending.pop();
    if (frame.error) continue;
    const from = frame.from?.toLowerCase();
    const to = frame.to?.toLowerCase();
    const call = frame.type?.toUpperCase() === 'CALL';
    if (call && to === forge) sawForge = true;
    const forgeCall = inForge || (call && to === forge);
    const claimCall = inClaim || (inForge && call && from === forge && to === CLAIM_MANAGER);
    if (call && to === player && ((inForge && from === forge) || (inClaim && from === CLAIM_MANAGER))) {
      if (!/^0x[0-9a-f]+$/i.test(frame.value ?? '0x0')) throw new Error('Unrecognized call trace value.');
      observed += BigInt(frame.value ?? '0x0');
    }
    for (const child of frame.calls ?? []) pending.push({ frame: child, inForge: forgeCall, inClaim: claimCall });
  }
  return sawForge ? observed : null;
}

async function inspectScrapForgeReveal(publicClient, output, submissionReceipt, { revealHash, trace }, { vrf, entropy, player }) {
  if (!vrf) throw new Error('Submission has no unique Scrap Forge VRF request to match to a reveal.');
  const tx = await publicClient.getTransaction({ hash: revealHash });
  if (tx.to?.toLowerCase() !== APE_VRF) throw new Error('Reveal transaction does not target the observed ApeVRF provider.');
  const { args: [sequence, contribution] } = decodeFunctionData({ abi: REVEAL_ABI, data: tx.input });
  if (sequence !== vrf.sequenceNumber || contribution.toLowerCase() !== entropy.toLowerCase()) {
    throw new Error('Reveal sequence or contribution does not match the submission.');
  }
  Object.assign(output, { reveal_transaction_hash: revealHash, reveal_status: 'pending' });
  if (tx.blockNumber == null) return;
  const receipt = await publicClient.getTransactionReceipt({ hash: revealHash });
  if (receipt.blockNumber < submissionReceipt.blockNumber || (
    receipt.blockNumber === submissionReceipt.blockNumber && !(receipt.transactionIndex > submissionReceipt.transactionIndex)
  )) {
    throw new Error('Reveal must follow its matching submission.');
  }
  output.reveal_block_number = receipt.blockNumber.toString();
  output.reveal_status = receipt.status === 'success' ? 'confirmed' : 'reverted';
  if (receipt.status !== 'success') return;

  output.reveal_nft_transfers_to_player = findNftTransfers(receipt.logs, player);
  if (!trace) return;
  try {
    const calls = await publicClient.request({
      method: 'debug_traceTransaction',
      params: [revealHash, { tracer: 'callTracer' }],
    });
    if (calls?.to?.toLowerCase() !== APE_VRF || calls?.input?.toLowerCase() !== tx.input.toLowerCase() || calls.error) {
      throw new Error('Trace does not match the successful reveal.');
    }
    const value = findObservedCash(calls, player);
    if (value === null) {
      output.trace_status = 'no_successful_forge_call';
      return;
    }
    Object.assign(output, {
      trace_status: 'observed',
      ape_received_via_forge_paths_wei: value.toString(),
      ape_received_via_forge_paths: formatEther(value),
    });
  } catch {
    output.trace_status = 'unavailable';
  }
}

export async function inspectScrapForgeSubmission(publicClient, hash, { revealHash, trace = false } = {}) {
  validateScrapForgeTransactionHash(hash);
  if (revealHash !== undefined) validateScrapForgeTransactionHash(revealHash, '--reveal');
  if (trace && !revealHash) throw new Error('--trace requires --reveal.');
  const tx = await publicClient.getTransaction({ hash });
  if (tx.to?.toLowerCase() !== SCRAP_FORGE_CONTRACT.toLowerCase()) {
    throw new Error('Transaction does not target the Scrap Forge deployment.');
  }
  const { functionName, args } = decodeFunctionData({ abi: GAME_CONTRACT_ABI, data: tx.input });
  if (functionName !== 'play') throw new Error('Transaction is not a Scrap Forge play submission.');
  const [player, gameData] = args;
  if (gameData.length !== 2 + 5 * 64) throw new Error('Unrecognized Scrap Forge play payload size.');
  const [firstWord, countWord, idWord, , entropy] = decodeAbiParameters(GAME_DATA_WORDS, gameData);
  const gameId = BigInt(idWord).toString();
  const output = {
    transaction_hash: hash,
    submission_status: 'pending',
    settlement_status: 'unknown',
    round_id: gameId,
    replay_url: `https://www.ape.church/games/${SCRAP_FORGE_GAME.slug}?id=${gameId}`,
    payload_first_word: firstWord,
    transaction_value_wei: tx.value.toString(),
  };
  if (tx.blockNumber == null) {
    if (revealHash) throw new Error('A pending submission has no mined VRF request to match to a reveal.');
    return output;
  }

  const receipt = await publicClient.getTransactionReceipt({ hash });
  const gas = receipt.gasUsed * receipt.effectiveGasPrice;
  Object.assign(output, {
    block_number: receipt.blockNumber.toString(),
    submission_status: receipt.status === 'success' ? 'accepted' : 'reverted',
    gas_fee_wei: gas.toString(),
    gas_fee_ape: formatEther(gas),
  });
  if (receipt.status !== 'success') {
    if (revealHash) throw new Error('A reverted submission has no VRF request to match to a reveal.');
    return output;
  }

  const vrf = findSubmissionEvent(receipt.logs, APE_VRF, 'RandomnessRequested', (args) => (
    args.requester.toLowerCase() === SCRAPYARD_VRF_WRAPPER && args.userContribution === entropy
  ));
  if (vrf) {
    output.vrf_sequence_number = vrf.sequenceNumber.toString();
    output.vrf_callback_gas_limit = vrf.callbackGasLimit;
  }
  const mint = findSubmissionEvent(receipt.logs, CVOL_TOKEN, 'Transfer', (args) => (
    args.from === zeroAddress && args.to.toLowerCase() === player.toLowerCase()
  ));
  const count = BigInt(countWord);
  const tier = SCRAP_FORGE_TIERS.find(({ stake, maxCount }) => (
    mint && count >= 1n && count <= BigInt(maxCount) && mint.value === parseEther(String(stake)) * count
  ));
  if (tier && tx.value >= mint.value) {
    const additionalValue = tx.value - mint.value;
    Object.assign(output, {
      wager_basis: 'cvol_mint_and_observed_payload',
      wager_per_forge_ape: tier.stake,
      forges: Number(count),
      round_wager_wei: mint.value.toString(),
      round_wager_ape: formatEther(mint.value),
      value_above_wager_wei: additionalValue.toString(),
      value_above_wager_ape: formatEther(additionalValue),
      submitted_cost_wei: (tx.value + gas).toString(),
      submitted_cost_ape: formatEther(tx.value + gas),
    });
  }
  if (revealHash) {
    await inspectScrapForgeReveal(publicClient, output, receipt, { revealHash, trace }, {
      vrf, entropy, player: player.toLowerCase(),
    });
  }
  return output;
}
