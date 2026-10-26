/** Public frontend interface corroborated by RPC; Solidity is not verified. */
import { formatEther, parseAbi, parseEther } from 'viem';
import { GIMBOZ_GALAXY_CONTRACT } from '../constants.js';

export const GIMBOZ_GALAXY_ABI = parseAbi([
  'function getGameInfo(uint256 gameId) view returns ((address player, uint256 betAmount, uint8 numSpins, uint256[] reelIndexes, uint256[] bonusReelIndexes, uint8[] bonusTriggerSpinIndexes, uint8[] bonusSpinCounts, uint256 totalPayout, bool hasRNGReturned, bool hasEnded, uint256 timestamp, bool isBonusBuy))',
  'function MAX_SPINS() view returns (uint256)',
  'function MIN_BET_AMOUNT_PER_SPIN() view returns (uint256)',
  'function MIN_BONUS_BUY_AMOUNT() view returns (uint256)',
  'function BONUS_BUY_COST_MULTIPLIER() view returns (uint256)',
  'function MAX_CASCADE_DEPTH() view returns (uint8)',
  'function PAYOUT_DENOM() view returns (uint256)',
  'function symbolPayouts(uint8 symbol, uint8 count) view returns (uint256)',
  'function getReel(uint8 reel) view returns (uint8[])',
  'function getBonusReel(uint8 reel) view returns (uint8[])',
]);

export function parseGimbozGalaxySpins(value) {
  const token = String(value ?? '').trim();
  const count = Number(token);
  if (!/^\d+$/.test(token) || !Number.isSafeInteger(count) || count < 1 || count > 10) {
    throw new Error('Gimboz of the Galaxy split must be an integer between 1 and 10.');
  }
  return count;
}

export function validateGimbozGalaxyWager(wagerWei, spins, bonus = false) {
  if (typeof bonus !== 'boolean') throw new Error('Gimboz of the Galaxy bonus must be boolean.');
  const count = parseGimbozGalaxySpins(spins);
  if (bonus && count !== 1) throw new Error('Gimboz of the Galaxy bonus buy requires exactly one round.');
  const minimum = bonus ? parseEther('100') : parseEther('3') * BigInt(count);
  if (typeof wagerWei !== 'bigint' || wagerWei < minimum || wagerWei >= (1n << 256n)) {
    throw new Error(bonus ? 'Gimboz of the Galaxy bonus buy requires at least 100 APE.'
      : `Gimboz of the Galaxy requires at least 3 APE per spin (${formatEther(minimum)} APE total for ${count} spins).`);
  }
  return count;
}

/** Keep contract offsets and free-spin counts, without inventing outcome boards. */
export async function readGimbozGalaxyReplay(publicClient, {
  gameId, blockNumber, contractAddress = GIMBOZ_GALAXY_CONTRACT,
} = {}) {
  const snapshotBlock = blockNumber ?? await publicClient.getBlockNumber();
  const info = await publicClient.readContract({
    address: contractAddress, abi: GIMBOZ_GALAXY_ABI,
    functionName: 'getGameInfo', args: [BigInt(gameId)], blockNumber: snapshotBlock,
  });
  const count = parseGimbozGalaxySpins(info.numSpins);
  if (info.hasEnded && info.hasRNGReturned && (
    info.reelIndexes.length !== count * 6
    || info.bonusSpinCounts.length !== info.bonusTriggerSpinIndexes.length
    || info.bonusReelIndexes.length !== info.bonusSpinCounts.reduce((sum, spins) => sum + Number(spins) * 8, 0)
    || info.bonusSpinCounts.some(spins => spins !== 3 && spins !== 6)
    || info.bonusTriggerSpinIndexes.some((index, i, indexes) => index >= count || (i > 0 && index <= indexes[i - 1]))
    || (info.isBonusBuy && (count !== 1 || info.bonusTriggerSpinIndexes.length !== 1 || info.bonusTriggerSpinIndexes[0] !== 0))
  )) throw new Error('Gimboz of the Galaxy settled reel offsets do not match the spin counts.');
  return {
    details_source: 'onchain_getGameInfo', details_block_number: snapshotBlock.toString(),
    num_spins: count, is_bonus_buy: info.isBonusBuy,
    has_rng_returned: info.hasRNGReturned, has_ended: info.hasEnded,
    bet_amount_wei: info.betAmount.toString(), total_payout_wei: info.totalPayout.toString(),
    reel_indexes: info.reelIndexes.map(String), bonus_reel_indexes: info.bonusReelIndexes.map(String),
    bonus_trigger_spin_indexes: Array.from(info.bonusTriggerSpinIndexes, Number),
    bonus_spin_counts: Array.from(info.bonusSpinCounts, Number),
  };
}

export async function fetchGimbozGalaxySettledResult({ publicClient, contractAddress, gameId }) {
  return readGimbozGalaxyReplay(publicClient, { contractAddress, gameId });
}
