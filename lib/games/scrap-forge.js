import { decodeAbiParameters, decodeEventLog, decodeFunctionData, encodeAbiParameters, formatEther, getAddress, isAddress, parseAbi, parseEther, zeroAddress } from 'viem';
import { GAME_CONTRACT_ABI, SCRAP_FORGE_CONTRACT } from '../constants.js';
import { getValidRefAddress, randomBytes32, randomUint256 } from '../utils.js';

export const SCRAP_FORGE_TIERS = Object.freeze([
  { stake: 10, maxCount: 15, capsuleClass: 'standard', capsules: 1 },
  { stake: 50, maxCount: 15, capsuleClass: 'standard', capsules: 5 },
  { stake: 100, maxCount: 15, capsuleClass: 'standard', capsules: 10 },
  { stake: 500, maxCount: 8, capsuleClass: 'premium', capsules: 5 },
  { stake: 1000, maxCount: 4, capsuleClass: 'premium', capsules: 10 },
].map(Object.freeze));

export const SCRAP_FORGE_GAME = Object.freeze({
  key: 'scrap-forge',
  name: 'Scrap Forge',
  aliases: Object.freeze(['scrapforge', 'forge']),
  slug: 'hv-mtl-scrapyard/forge',
  type: 'slots',
  description: 'Forge at five fixed stakes for material awards and AMP Vault capsules.',
  contract: SCRAP_FORGE_CONTRACT,
  abiVerified: false,
  explicitSelectionOnly: true,
  config: Object.freeze({
    spins: Object.freeze({
      min: 1,
      max: Math.max(...SCRAP_FORGE_TIERS.map(({ maxCount }) => maxCount)),
      default: 1,
      cliName: 'split',
      cliAliases: Object.freeze(['forges']),
      cliRange: `Counts by stake per forge. ${SCRAP_FORGE_TIERS.map(({ stake, maxCount }) => `1–${maxCount} at ${stake} APE`).join(', ')}.`,
      cliDefault: '1 with a per-forge stake alone, or with a total wager alone in play or bet. With both, the count is total wager ÷ stake per forge',
      description: 'Number of paid forges in one round. A total wager is divided equally across them. With --bet, the total wager is stake per forge × count before fees. The stake and count must match an allowed combination exactly.',
    }),
    betSplit: Object.freeze({ cliName: 'bet-split', cliAliases: Object.freeze(['bet']),
      description: 'Set the stake per forge to 10, 50, 100, 500, or 1000 APE. The base wager equals stake × count.' }),
    spin: Object.freeze({ cliName: 'spin', deprecated: true, description: 'Deprecated alias for --bet-split. Use only one of the two names.' }),
  }),
  vrf: Object.freeze({ type: 'scrap-forge' }),
});

export const SCRAP_FORGE_BNF = Object.freeze([
  '<forge-game> ::= "scrap-forge" | "scrapforge" | "forge"',
  '<forge-play> ::= "play" ( <forge-game> | "--game" <forge-game> ) [ <wager> [ <count> ] ] <forge-wager-option>* ( <forge-stateless-option> | <play-shared-option> )*',
  '<forge-bet> ::= "bet" "--game" <forge-game> <forge-wager-option>+ <forge-stateless-option>*',
  '<forge-wager-option> ::= "--amount" <wager> | <forge-count-option> | <forge-stake>',
  '<forge-stateless-option> ::= "--timeout" <integer> | "--x-gameId" <uint256> | "--x-ref" <address> | "--x-userRandomWord" <hash> | "--gp-ape" <points> | "--resilient" | "--no-resilient"',
  '<forge-command> ::= "game" <forge-name> [ <forge-action> ] [ "--json" ]',
  '<forge-name> ::= <forge-game> | <game-display-name> | <game-prefix> ; must resolve to Scrap Forge',
  '<forge-action> ::= "--limits" | "--quote" <forge-selection> [ "--simulate-from" <address> ] | "--round" <uint256> | "--transaction" <hash> [ "--reveal" <hash> [ "--trace" ] ] [ "--vault-reveal" <hash> ] | "--paytable" [ <forge-selection> ]',
  '<forge-selection> ::= <forge-stake> [ <forge-count-option> ] [ "--amount" <wager> ] | "--amount" <wager> <forge-count-option>',
  '<forge-stake> ::= ( "--bet" | "--bet-split" | "--spin" ) <ape-per-forge> ; --spin is deprecated',
  '<forge-count-option> ::= ( "--forges" | "--split" ) <count>',
  '<ape-per-forge> ::= "10" | "50" | "100" | "500" | "1000"',
  '<count> ::= <integer> ; 1–15 at 10/50/100 APE, 1–8 at 500, 1–4 at 1000',
  '<wager> ::= <integer> ; exact base wager in APE, equal to stake × count',
  '; An explicit count divides the base wager equally. With a total wager and stake, an omitted count is inferred as total ÷ stake.',
  '; A stake alone implies one forge. In play or bet, a total wager alone also implies one forge.',
  '; Live play requires a total wager or an explicit stake. All supplied amounts and counts must agree.',
  '; Supply only one named option for the stake and one for the count.',
  '; AMP is automatic. No bonus buy or risk setting. Loops use a fixed round wager with the flat strategy and stop on pending settlement.',
  '<hash> ::= "0x" <hex-digit>{64} ; ApeChain transaction hash',
  '<uint256> ::= <integer> ; unsigned decimal round ID smaller than 2^256',
  '<address> ::= "0x" <hex-digit>{40} ; nonzero public sender address',
]);

export const SCRAP_FORGE_MATERIALS = Object.freeze([
  ['Cast Iron', '0.2', 370835],
  ['Steel', '0.5', 289164],
  ['Zinc', '1', 142001],
  ['Lead', '1.5', 93400],
  ['Aluminum', '2', 59000],
  ['Stainless Steel', '4', 25600],
  ['Brass', '10', 7500],
  ['Copper', '25', 1930],
  ['Tungsten Carbide', '50', 570],
].map(Object.freeze));

export const SCRAP_FORGE_RULE_SOURCE = 'official_game_ui';
export const SCRAP_FORGE_WEIGHT_DENOMINATOR = 1000000;
export const SCRAP_FORGE_AMP_WEIGHT = 10000;
export const SCRAP_FORGE_LENS = '0x93dbEEE1E93dA2f1BEf8FFeF00F7bc8410e0656d';

export const SCRAP_FORGE_VIEW_ABI = parseAbi([
  'function getPlayValue(uint8 tier, uint8 forges) view returns (uint256 totalBet, uint256 vrfFee, uint256 value)',
  'function maxForgesAllowed(uint8 tier) view returns (uint8)',
  'function paused() view returns (bool)',
  'function getGameInfo(uint256 gameId) view returns ((address player, uint8 tier, uint8 forges, uint256 betAmount, uint8[] bucketIndexes, uint256 totalPayout, uint256 metalPayout, uint256 capsuleSpend, address vault, uint256 vaultRequestId, bool owed, bool hasEnded, uint256 timestamp) info)',
  'function getVaultPulls(uint256 gameId) view returns (address vault, uint256 requestId, uint8 status, uint16 totalPulls, uint16 drawn, (uint8 forgeIndex, uint8 kind, uint8 delivery, uint8 capsule, uint256 listingId, uint256 amountOrValue)[] pulls)',
]);

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

export function normalizeScrapForgeWagerAliases({ amount, split, forges, spin, betSplit, bet }) {
  if (bet !== undefined && (betSplit !== undefined || spin !== undefined)) {
    throw new Error('Use only one of --bet, --bet-split, and --spin for Scrap Forge.');
  }
  if (spin !== undefined && betSplit !== undefined) {
    throw new Error('Use either --spin or --bet-split for Scrap Forge.');
  }
  if (forges !== undefined && split !== undefined) {
    throw new Error('Use either --forges or --split for Scrap Forge.');
  }
  return { amount, split: forges ?? split, spin, betSplit: bet ?? betSplit };
}

function selectScrapForgeWager({ amount: rawAmount, split: rawCount, spin, betSplit }) {
  const rawStake = spin ?? betSplit;
  if ([rawStake, rawCount, rawAmount].every((value) => value === undefined)) return null;

  const amount = rawAmount === undefined ? undefined : parseInteger(rawAmount, '--amount');
  const count = rawCount === undefined ? undefined : parseInteger(rawCount, 'Forge count');
  if (rawStake === undefined && (amount === undefined || count === undefined)) {
    throw new Error('Specify --bet or supply both --amount and --forges.');
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
    throw new Error('--amount must equal the stake per forge multiplied by the number of forges.');
  }
  return {
    wager_per_forge_ape: stake,
    forges,
    round_wager_ape: wager,
    capsule_class: tier.capsuleClass,
    capsules_per_amp: tier.capsules,
  };
}

export function getScrapForgeSelection(options) {
  return selectScrapForgeWager(normalizeScrapForgeWagerAliases(options));
}

export function getScrapForgePlaySelection(options) {
  const { amount, split, spin, betSplit } = normalizeScrapForgeWagerAliases(options);
  const selection = selectScrapForgeWager({
    amount: amount === undefined ? undefined : String(amount).trim().replace(/\.0+$/, ''),
    split: split ?? (spin === undefined && betSplit === undefined && amount !== undefined ? 1 : undefined),
    spin,
    betSplit,
  });
  if (!selection) throw new Error('Specify an exact Scrap Forge wager with --amount or --bet.');
  return selection;
}

function getScrapForgeReplayUrl(id) {
  return `https://www.ape.church/games/${SCRAP_FORGE_GAME.slug}?id=${id}`;
}

function apeAmount(value) {
  return { wei: value.toString(), ape: formatEther(value) };
}

export function parseScrapForgeRoundId(value) {
  if (!/^\d{1,78}$/.test(String(value)) || BigInt(value) >= 2n ** 256n) {
    throw new Error('--round requires an unsigned decimal uint256 round ID.');
  }
  return BigInt(value);
}

export async function quoteScrapForge(publicClient, selection) {
  if (!selection) throw new Error('--quote requires an exact Scrap Forge wager selection.');
  const tier = SCRAP_FORGE_TIERS.findIndex(({ stake }) => stake === selection.wager_per_forge_ape);
  const blockNumber = await publicClient.getBlockNumber();
  const read = { abi: SCRAP_FORGE_VIEW_ABI, blockNumber };
  const [maxForges, paused] = await Promise.all([
    publicClient.readContract({ ...read, address: SCRAP_FORGE_LENS, functionName: 'maxForgesAllowed', args: [tier] }),
    publicClient.readContract({ ...read, address: SCRAP_FORGE_CONTRACT, functionName: 'paused' }),
  ]);
  if (paused) throw new Error('Scrap Forge is paused at the quote block.');
  if (selection.forges > maxForges) throw new Error(`The live limit for this stake is ${maxForges} forge(s).`);
  const [wager, vrfFee, value] = await publicClient.readContract({
    ...read, address: SCRAP_FORGE_LENS, functionName: 'getPlayValue', args: [tier, selection.forges],
  });
  if (wager !== parseEther(String(selection.round_wager_ape)) || value !== wager + vrfFee) {
    throw new Error('Scrap Forge lens quote did not reconcile with the selected wager and VRF fee.');
  }
  return {
    game: SCRAP_FORGE_GAME.key,
    block_number: blockNumber.toString(),
    tier,
    forges: selection.forges,
    max_forges_at_block: maxForges,
    wager: apeAmount(wager),
    vrf_fee: apeAmount(vrfFee),
    transaction_value: apeAmount(value),
    gas_fee: null,
  };
}

export function parseScrapForgeSimulationSender(value) {
  if (!isAddress(value) || value.toLowerCase() === zeroAddress) {
    throw new Error('--simulate-from requires a nonzero public ApeChain address.');
  }
  return getAddress(value);
}

const GAME_DATA_ABI = [{ type: 'uint8' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }];

export function encodeScrapForgeGameData({ tier, forges, gameId, sender, refAddress, userRandomWord }) {
  return encodeAbiParameters(GAME_DATA_ABI, [
    tier, forges, gameId,
    refAddress.toLowerCase() === sender.toLowerCase() ? zeroAddress : refAddress,
    userRandomWord,
  ]);
}

export async function simulateScrapForge(publicClient, selection, sender) {
  const account = parseScrapForgeSimulationSender(sender);
  const quote = await quoteScrapForge(publicClient, selection);
  const gameData = encodeScrapForgeGameData({
    ...quote, gameId: randomUint256(), sender: account,
    refAddress: getValidRefAddress(), userRandomWord: randomBytes32(),
  });
  await publicClient.simulateContract({
    account,
    address: SCRAP_FORGE_CONTRACT,
    abi: GAME_CONTRACT_ABI,
    functionName: 'play',
    args: [account, gameData],
    value: BigInt(quote.transaction_value.wei),
    blockNumber: BigInt(quote.block_number),
  });
  return { ...quote, simulation: { status: 'success', from: account, rpc_method: 'eth_call' } };
}

const VAULT_DELIVERY = ['pushed', 'claimable', 'owed', 'claimed'];

export async function readScrapForgeRound(publicClient, id, { includeOwner = false } = {}) {
  const blockNumber = await publicClient.getBlockNumber();
  const read = { abi: SCRAP_FORGE_VIEW_ABI, blockNumber, args: [id] };
  const info = await publicClient.readContract({ ...read, address: SCRAP_FORGE_CONTRACT, functionName: 'getGameInfo' });
  if (info.player.toLowerCase() === zeroAddress) {
    if (includeOwner) return null;
    throw new Error('Scrap Forge round not found.');
  }
  const buckets = info.bucketIndexes.map((bucket, index) => {
    const material = SCRAP_FORGE_MATERIALS[bucket];
    return {
      forge: index + 1,
      bucket_index: bucket,
      outcome: material?.[0] ?? (bucket === SCRAP_FORGE_MATERIALS.length ? 'AMP' : null),
    };
  });
  const round = {
    game: SCRAP_FORGE_GAME.key,
    block_number: blockNumber.toString(),
    round_id: id.toString(),
    replay_url: getScrapForgeReplayUrl(id),
    has_ended: info.hasEnded,
    vault_pulls_owed: info.owed,
    tier: info.tier,
    forges: info.forges,
    stake_per_forge: apeAmount(info.betAmount),
    wager: apeAmount(info.betAmount * BigInt(info.forges)),
    outcomes: buckets,
    reported_total_payout: apeAmount(info.totalPayout),
    metal_payout: apeAmount(info.metalPayout),
    capsule_spend: apeAmount(info.capsuleSpend),
    vault: info.vault,
    vault_request_id: info.vaultRequestId.toString(),
    vault_draw: null,
    ...(includeOwner ? { player: info.player, timestamp: Number(info.timestamp) } : {}),
  };
  if (!info.hasEnded || info.vaultRequestId === 0n) return round;
  const [vault, requestId, status, total, drawn, pulls] = await publicClient.readContract({
    ...read, address: SCRAP_FORGE_LENS, functionName: 'getVaultPulls',
  });
  if (requestId !== info.vaultRequestId || vault.toLowerCase() !== info.vault.toLowerCase()) {
    throw new Error('Scrap Forge lens did not return the Vault request linked to this round.');
  }
  round.vault_draw = {
    status_code: status,
    total_pulls: total,
    drawn,
    pulls: pulls.map((pull) => ({
      forge_index: pull.forgeIndex,
      kind_code: pull.kind,
      delivery: VAULT_DELIVERY[pull.delivery] ?? null,
      delivery_code: pull.delivery,
      capsule_code: pull.capsule,
      listing_id: pull.listingId.toString(),
      amount_or_value: apeAmount(pull.amountOrValue),
    })),
  };
  return round;
}

export async function readScrapForgeSettlement(publicClient, gameId) {
  const round = await readScrapForgeRound(publicClient, gameId, { includeOwner: true });
  if (!round) return { player: null, hasEnded: false };

  const { player, timestamp, ...forgeRound } = round;
  const buyInWei = BigInt(round.wager.wei);
  const pending = { player, timestamp, buyInWei, hasEnded: false, details: { forge_round: forgeRound } };
  if (!round.has_ended || round.vault_pulls_owed || round.outcomes.length !== round.forges
    || round.forges === 0 || round.outcomes.some(({ outcome }) => outcome === null)) return pending;

  const ampIndexes = new Set(round.outcomes.filter(({ outcome }) => outcome === 'AMP').map(({ forge }) => forge - 1));
  const draw = round.vault_draw;
  let vaultCash = 0n;
  if (ampIndexes.size || draw || BigInt(round.capsule_spend.wei) > 0n) {
    const capsuleCount = SCRAP_FORGE_TIERS[round.tier]?.capsules;
    if (!draw || draw.status_code !== 4 || !ampIndexes.size || !capsuleCount
      || draw.total_pulls !== ampIndexes.size * capsuleCount || draw.drawn !== draw.total_pulls
      || draw.pulls.length !== draw.total_pulls) return pending;
    const pullsByForge = new Map();
    for (const pull of draw.pulls) {
      if (!ampIndexes.has(pull.forge_index) || ![0, 1].includes(pull.kind_code)
        || ![0, 3].includes(pull.delivery_code)) return pending;
      pullsByForge.set(pull.forge_index, (pullsByForge.get(pull.forge_index) ?? 0) + 1);
      if (pull.kind_code === 0) vaultCash += BigInt(pull.amount_or_value.wei);
    }
    if ([...ampIndexes].some((index) => pullsByForge.get(index) !== capsuleCount)) return pending;
  }

  const payoutWei = BigInt(round.metal_payout.wei) + vaultCash;
  return { ...pending, hasEnded: true, payoutWei,
    details: { ...pending.details, vault_cash_payout: apeAmount(vaultCash) } };
}

const CVOL_TOKEN = '0xb90636359a683fcd9bc2f54623b5c52e48604f08';
const APE_VRF = '0xe892d2576bcf131e1d4a6a31e1921bb27f8f91f2';
const SCRAPYARD_VRF_WRAPPER = '0xa35500b5c420066d6315da0bec29246efe3660ad';
const CLAIM_MANAGER = '0xd2a5c5f58bdbed24ef919d9dfb312ca84e7b31dd';
const SUBMISSION_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event RandomnessRequested(uint64 indexed sequenceNumber, address indexed requester, bytes32 userContribution, uint64 segmentIndex, uint64 blockNumber, uint32 callbackGasLimit)',
]);
const VAULT_REVEAL_EVENTS = parseAbi([
  'event RandomnessFulfilled(uint64 indexed sequenceNumber, bytes32 randomness, uint32 gasUsed)',
  'event RandomnessReceived(uint256 indexed requestId, uint64 vrfId)',
  'event Pulled(uint256 indexed requestId, uint16 group, uint16 index, uint8 prizeKind, uint256 listingIdOrAmount, uint256 value)',
  'event RequestDone(uint256 indexed requestId)',
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

function findReceiptEvents(logs, address, abi, eventName, match) {
  const matches = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== address) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi, topics: log.topics, data: log.data });
    } catch { continue; }
    if (decoded.eventName === eventName && match(decoded.args)) matches.push(decoded.args);
  }
  return matches;
}

function findSubmissionEvent(logs, address, eventName, match) {
  const matches = findReceiptEvents(logs, address, SUBMISSION_ABI, eventName, match);
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

function validateRevealOrder(receipt, submissionReceipt) {
  if (receipt.blockNumber < submissionReceipt.blockNumber || (
    receipt.blockNumber === submissionReceipt.blockNumber && !(receipt.transactionIndex > submissionReceipt.transactionIndex)
  )) {
    throw new Error('Reveal must follow its matching submission.');
  }
}

async function inspectScrapForgeVaultReveal(publicClient, submissionReceipt, vaultRevealHash, gameId, player) {
  const tx = await publicClient.getTransaction({ hash: vaultRevealHash });
  if (tx.to?.toLowerCase() !== APE_VRF) throw new Error('Vault reveal transaction does not target the observed ApeVRF provider.');
  const { args: [sequence] } = decodeFunctionData({ abi: REVEAL_ABI, data: tx.input });
  if (tx.blockNumber == null) throw new Error('Vault reveal must be mined to verify its request.');
  const receipt = await publicClient.getTransactionReceipt({ hash: vaultRevealHash });
  validateRevealOrder(receipt, submissionReceipt);
  if (receipt.status !== 'success') throw new Error('Vault reveal reverted.');

  const round = await publicClient.readContract({
    abi: SCRAP_FORGE_VIEW_ABI, address: SCRAP_FORGE_CONTRACT, functionName: 'getGameInfo',
    args: [gameId], blockNumber: receipt.blockNumber,
  });
  const vault = round.vault.toLowerCase();
  const requestId = round.vaultRequestId;
  if (round.player.toLowerCase() !== player || !round.hasEnded || vault === zeroAddress || requestId === 0n) {
    throw new Error('Scrap Forge round had no matching linked Vault request at the reveal block.');
  }
  const events = (address, eventName, match) => findReceiptEvents(receipt.logs, address, VAULT_REVEAL_EVENTS, eventName, match);
  const matchesRequest = (args) => args.requestId === requestId;
  const received = events(vault, 'RandomnessReceived', (args) => matchesRequest(args) && args.vrfId === sequence);
  const fulfilled = events(APE_VRF, 'RandomnessFulfilled', (args) => args.sequenceNumber === sequence);
  if (received.length !== 1 || fulfilled.length !== 1) {
    throw new Error('Reveal receipt does not prove the randomness fulfillment for the round’s Vault request.');
  }
  return {
    transaction_hash: vaultRevealHash,
    block_number: receipt.blockNumber.toString(),
    vault: round.vault,
    request_id: requestId.toString(),
    vrf_sequence_number: sequence.toString(),
    request_done_in_receipt: events(vault, 'RequestDone', matchesRequest).length > 0,
    pulls: events(vault, 'Pulled', matchesRequest).map((args) => ({
      group: args.group,
      index: args.index,
      prize_kind_code: args.prizeKind,
      listing_id_or_amount: args.listingIdOrAmount.toString(),
      reported_value: apeAmount(args.value),
    })),
    nft_transfers_to_player: findNftTransfers(receipt.logs, player)
      .filter((transfer) => transfer.from.toLowerCase() === vault),
  };
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
  validateRevealOrder(receipt, submissionReceipt);
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

export async function inspectScrapForgeSubmission(publicClient, hash, { revealHash, vaultRevealHash, trace = false } = {}) {
  validateScrapForgeTransactionHash(hash);
  if (revealHash !== undefined) validateScrapForgeTransactionHash(revealHash, '--reveal');
  if (vaultRevealHash !== undefined) validateScrapForgeTransactionHash(vaultRevealHash, '--vault-reveal');
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
    replay_url: getScrapForgeReplayUrl(gameId),
    payload_first_word: firstWord,
    transaction_value_wei: tx.value.toString(),
  };
  if (tx.blockNumber == null) {
    if (revealHash || vaultRevealHash) throw new Error('A pending submission has no mined VRF request to match to a reveal.');
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
    if (revealHash || vaultRevealHash) throw new Error('A reverted submission has no VRF request to match to a reveal.');
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
  if (vaultRevealHash) {
    output.vault_reveal = await inspectScrapForgeVaultReveal(publicClient, receipt, vaultRevealHash, BigInt(idWord), player.toLowerCase());
  }
  return output;
}
