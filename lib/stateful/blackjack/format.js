import { formatEther } from 'viem';

export function formatBlackjackStake(amount) {
  const value = typeof amount === 'bigint'
    ? Number(formatEther(amount))
    : Number(amount);

  if (!Number.isFinite(value)) {
    return '0';
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(4).replace(/\.?0+$/, '');
}
