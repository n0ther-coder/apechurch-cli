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
  '<forge-action> ::= "--limits" | "--transaction" <hash> | "--paytable" [ <forge-selection> ]',
  '<forge-selection> ::= <forge-stake> [ "--split" <count> ] [ "--amount" <wager> ] | "--amount" <wager> "--split" <count>',
  '<forge-stake> ::= ( "--spin" | "--bet-split" ) <ape-per-forge>',
  '<ape-per-forge> ::= "10" | "50" | "100" | "500" | "1000"',
  '<count> ::= <integer> ; 1–15 at 10/50/100 APE, 1–8 at 500, 1–4 at 1000',
  '<wager> ::= <integer> ; exact base wager in APE, equal to stake × count',
  '<hash> ::= "0x" <hex-digit>{64} ; ApeChain submission transaction',
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
const SUBMISSION_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event RandomnessRequested(uint64 indexed sequenceNumber, address indexed requester, bytes32 userContribution, uint64 segmentIndex, uint64 blockNumber, uint32 callbackGasLimit)',
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

export function validateScrapForgeTransactionHash(hash) {
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('--transaction requires a 32-byte hexadecimal transaction hash.');
}

export async function inspectScrapForgeSubmission(publicClient, hash) {
  validateScrapForgeTransactionHash(hash);
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
  if (tx.blockNumber == null) return output;

  const receipt = await publicClient.getTransactionReceipt({ hash });
  const gas = receipt.gasUsed * receipt.effectiveGasPrice;
  Object.assign(output, {
    block_number: receipt.blockNumber.toString(),
    submission_status: receipt.status === 'success' ? 'accepted' : 'reverted',
    gas_fee_wei: gas.toString(),
    gas_fee_ape: formatEther(gas),
  });
  if (receipt.status !== 'success') return output;

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
  return output;
}
