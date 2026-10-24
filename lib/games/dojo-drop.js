/**
 * Dojo Drop read adapter. The public frontend's ABI is corroborated by live
 * getters; Solidity source is unverified. Monetary results come from the
 * contract, including bonus drops, chest multiplication and integer rounding.
 */
import { formatEther, parseAbi, parseEther } from 'viem';
import { DOJO_DROP_CONTRACT } from '../constants.js';

export const DOJO_DROP_ABI = parseAbi([
  'function getGameInfo(uint256 gameId) view returns ((address player, uint256 betAmount, uint8 numSpins, uint8 nextSpinIndex, uint256[] spinPayouts, uint8[] bonusTriggerSpinIndexes, uint8[] clearedColumnMasks, uint16 capHitMask, uint256 totalPayout, bool hasRNGReturned, bool hasEnded, uint256 timestamp, uint256[] rngResults))',
  'function getSpinDetails(uint256 gameId, uint8 startSpinIndex, uint8 endSpinIndex) view returns ((uint8[30] wallTiers, uint8[15] baseSymbols, bool bonusTriggered, uint8[60] bonusSymbols, uint32 brokenAfterBase, uint32[4] brokenAfterFreeSpin, uint8 clearedColumns, uint8[5] chestMultipliers, uint256 totalXUncapped, uint256 totalX, uint256 spinPayout)[] details)',
  'function getGameConfig() view returns (uint8[6] durabilities, uint256[6] payoutsX, uint16 blockUpgradeBp, uint16 baseEmptyBp, uint16[7] baseWeights, uint16 bonusEmptyBp, uint16[7] bonusWeights, uint8[] chestValues, uint8[] chestPercents, uint256 maxWinXUnits)',
]);

export const DOJO_DROP_MULTIPLIER_SCALE = 10000n;
export const DOJO_DROP_MIN_BET_PER_SPIN_WEI = parseEther('2.5');
export const DOJO_DROP_SYMBOLS = Object.freeze([
  'Katana', 'Flame Blade', 'Void Blade', 'Ice Blade',
  'Lucky Cat', 'Spirit Gem', 'Burger',
]);
export const DOJO_DROP_BLOCKS = Object.freeze([
  'Bamboo', 'Burger Crate', 'Cherry Blossom', 'Stone Frog', 'Temple', 'Golden Dragon',
]);

export function parseDojoDropSpins(value) {
  const text = String(value ?? '').trim();
  const parsed = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 15) {
    throw new Error('Dojo Drop split must be an integer between 1 and 15.');
  }
  return parsed;
}

export function validateDojoDropWager(wagerWei, spins) {
  const count = parseDojoDropSpins(spins);
  const minimum = DOJO_DROP_MIN_BET_PER_SPIN_WEI * BigInt(count);
  if (typeof wagerWei !== 'bigint' || wagerWei < minimum || wagerWei >= (1n << 256n)) {
    throw new Error(`Dojo Drop requires at least 2.5 APE per spin (${formatEther(minimum)} APE total for ${count} spins).`);
  }
  return count;
}

/** JSON conversion preserves every monetary integer as a decimal string. */
function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item));
}

export async function readDojoDropReplay(publicClient, {
  gameId,
  blockNumber,
  contractAddress = DOJO_DROP_CONTRACT,
} = {}) {
  const snapshotBlock = blockNumber ?? await publicClient.getBlockNumber();
  const read = (functionName, args = []) => publicClient.readContract({
    address: contractAddress, abi: DOJO_DROP_ABI, functionName, args, blockNumber: snapshotBlock,
  });
  const [info, gameConfig] = await Promise.all([
    read('getGameInfo', [BigInt(gameId)]),
    read('getGameConfig'),
  ]);
  const result = {
    details_source: 'onchain_getSpinDetails',
    details_block_number: snapshotBlock.toString(),
    game_config_source: 'snapshot_block_getGameConfig',
    num_spins: Number(info.numSpins),
    next_spin_index: Number(info.nextSpinIndex),
    has_rng_returned: Boolean(info.hasRNGReturned),
    has_ended: Boolean(info.hasEnded),
    bet_amount_wei: info.betAmount.toString(),
    total_payout_wei: info.totalPayout.toString(),
    spin_payouts_wei: info.spinPayouts.map(String),
    bonus_trigger_spin_indexes: Array.from(info.bonusTriggerSpinIndexes, Number),
    cleared_column_masks: Array.from(info.clearedColumnMasks, Number),
    cap_hit_mask: Number(info.capHitMask),
    game_config: toJson({
      durabilities: gameConfig[0], payoutsX: gameConfig[1],
      blockUpgradeBp: gameConfig[2], baseEmptyBp: gameConfig[3],
      baseWeights: gameConfig[4], bonusEmptyBp: gameConfig[5],
      bonusWeights: gameConfig[6], chestValues: gameConfig[7],
      chestPercents: gameConfig[8], maxWinXUnits: gameConfig[9],
      multiplierScale: DOJO_DROP_MULTIPLIER_SCALE,
    }),
    spin_details: [],
  };
  if (!info.hasRNGReturned || !info.hasEnded) return result;

  const count = parseDojoDropSpins(info.numSpins);
  const details = await read('getSpinDetails', [BigInt(gameId), 0, count]);
  if (details.length !== count || info.spinPayouts.length !== count
    || details.some((spin, index) => spin.spinPayout !== info.spinPayouts[index])
    || info.spinPayouts.reduce((sum, payout) => sum + payout, 0n) !== info.totalPayout) {
    throw new Error('Dojo Drop spin details do not match the settled game payout.');
  }
  result.spin_details = toJson(details);
  return result;
}

/** Optional enrichment; the shared executor retains authoritative settlement. */
export async function fetchDojoDropSettledResult({ publicClient, contractAddress, gameId }) {
  return readDojoDropReplay(publicClient, { contractAddress, gameId });
}
