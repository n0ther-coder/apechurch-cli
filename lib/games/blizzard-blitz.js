/** Public frontend ABI corroborated by live reads and eth_call, not verified Solidity. */
import { formatEther, parseAbi, parseEther } from 'viem';
import { BLIZZARD_BLITZ_CONTRACT } from '../constants.js';

export const BLIZZARD_BLITZ_ABI = parseAbi([
  'function getGameInfo(uint256 gameId) view returns ((address player, uint256 betAmount, uint8 numSpins, uint256[] reelIndexes, uint256[] bonusReelIndexes, uint8[] bonusTriggerSpinIndexes, uint256 totalPayout, bool hasRNGReturned, bool hasEnded, uint256 timestamp, bool isBonusBuy))',
  'function MAX_SPINS() view returns (uint256)',
  'function MIN_BET_AMOUNT_PER_SPIN() view returns (uint256)',
  'function MIN_BONUS_BUY_AMOUNT() view returns (uint256)',
  'function BONUS_BUY_COST_MULTIPLIER() view returns (uint256)',
  'function BONUS_SPINS() view returns (uint256)',
  'function getReel(uint8 reel) view returns (uint8[])',
  'function getBonusReel(uint8 reel) view returns (uint8[])',
]);

export function parseBlizzardBlitzSpins(value) {
  const token = String(value ?? '').trim();
  const count = Number(token);
  if (!/^\d+$/.test(token) || !Number.isSafeInteger(count) || count < 1 || count > 20) {
    throw new Error('Blizzard Blitz split must be an integer between 1 and 20.');
  }
  return count;
}

export function validateBlizzardBlitzOptions(gameEntry, options = {}, positionalConfig = {}) {
  if (options.bonus === undefined) return;
  if (gameEntry?.key !== 'blizzard-blitz') {
    throw new Error('--bonus requires an explicitly selected Blizzard Blitz game.');
  }
  if (typeof options.bonus !== 'boolean') throw new Error('--bonus is a boolean flag.');
  if (options.bonus && (options.spin !== undefined || options.split !== undefined || positionalConfig.spins !== undefined)) {
    throw new Error('Blizzard Blitz --bonus buys one bonus round; it cannot be combined with --split, --spin, or a positional count.');
  }
}

export function validateBlizzardBlitzWager(wagerWei, spins, bonus = false) {
  if (typeof bonus !== 'boolean') throw new Error('Blizzard Blitz bonus must be boolean.');
  const count = parseBlizzardBlitzSpins(spins);
  if (bonus && count !== 1) throw new Error('Blizzard Blitz bonus buy requires exactly one round.');
  const minimum = bonus ? parseEther('100') : parseEther('2.5') * BigInt(count);
  if (typeof wagerWei !== 'bigint' || wagerWei < minimum || wagerWei >= (1n << 256n)) {
    throw new Error(bonus ? 'Blizzard Blitz bonus buy requires at least 100 APE.'
      : `Blizzard Blitz requires at least 2.5 APE per spin (${formatEther(minimum)} APE total for ${count} spins).`);
  }
  return count;
}

/** Retain exact contract integers and offsets; do not fabricate cascade outcomes. */
export async function readBlizzardBlitzReplay(publicClient, {
  gameId, blockNumber, contractAddress = BLIZZARD_BLITZ_CONTRACT,
} = {}) {
  const snapshotBlock = blockNumber ?? await publicClient.getBlockNumber();
  const info = await publicClient.readContract({
    address: contractAddress, abi: BLIZZARD_BLITZ_ABI,
    functionName: 'getGameInfo', args: [BigInt(gameId)], blockNumber: snapshotBlock,
  });
  const count = parseBlizzardBlitzSpins(info.numSpins);
  if (info.hasEnded && info.hasRNGReturned && (
    info.reelIndexes.length !== count * 5
    || info.bonusReelIndexes.length !== info.bonusTriggerSpinIndexes.length * 25
    || info.bonusTriggerSpinIndexes.some(index => index >= count)
  )) throw new Error('Blizzard Blitz settled reel offsets do not match the spin counts.');
  return {
    details_source: 'onchain_getGameInfo', details_block_number: snapshotBlock.toString(),
    num_spins: count, is_bonus_buy: info.isBonusBuy,
    has_rng_returned: info.hasRNGReturned, has_ended: info.hasEnded,
    bet_amount_wei: info.betAmount.toString(), total_payout_wei: info.totalPayout.toString(),
    reel_indexes: info.reelIndexes.map(String), bonus_reel_indexes: info.bonusReelIndexes.map(String),
    bonus_trigger_spin_indexes: Array.from(info.bonusTriggerSpinIndexes, Number),
  };
}

export async function fetchBlizzardBlitzSettledResult({ publicClient, contractAddress, gameId }) {
  return readBlizzardBlitzReplay(publicClient, { contractAddress, gameId });
}
