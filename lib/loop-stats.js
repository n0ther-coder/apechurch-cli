/**
 * Shared helpers for cumulative loop/session metrics.
 */
import { GB_POINTS_PER_APE } from './constants.js';

export function createLoopStats() {
  return {
    completedGames: 0,
    wins: 0,
    totalWageredApe: 0,
    totalPayoutApe: 0,
  };
}

export function recordLoopGame(stats, { won = false, wageredApe = 0, payoutApe = 0 } = {}) {
  stats.completedGames += 1;
  stats.wins += won ? 1 : 0;
  stats.totalWageredApe += Number(wageredApe) || 0;
  stats.totalPayoutApe += Number(payoutApe) || 0;
  return stats;
}

function formatSignedApe(amountApe) {
  const value = Number(amountApe) || 0;
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function formatPoints(points) {
  if (!Number.isFinite(points)) return '0';
  if (Number.isInteger(points)) return points.toString();
  return points.toFixed(1).replace(/\.0$/, '');
}

export function formatLoopProgress({ currentBalanceApe, startingBalanceApe, stats, nextDelayLabel }) {
  const completedGames = stats?.completedGames || 0;
  const wins = stats?.wins || 0;
  const totalWageredApe = stats?.totalWageredApe || 0;
  const totalPayoutApe = stats?.totalPayoutApe || 0;
  const balanceDeltaApe = (Number(currentBalanceApe) || 0) - (Number(startingBalanceApe) || 0);
  const winRate = completedGames > 0 ? (wins / completedGames) * 100 : 0;
  const rtp = totalWageredApe > 0 ? (totalPayoutApe / totalWageredApe) * 100 : 0;
  const points = totalWageredApe * GB_POINTS_PER_APE;
  const netResultApe = totalPayoutApe - totalWageredApe;
  const netResultLabel = netResultApe > 0 ? 'win' : netResultApe < 0 ? 'loss' : 'even';
  const pointsLine = netResultApe > 0
    ? `🧮 Points: ${formatPoints(points)}, +${formatPoints(points)} GB, +${netResultApe.toFixed(2)} APE`
    : netResultApe === 0
      ? `🧮 Points: ${formatPoints(points)}, +${formatPoints(points)} GB`
      : `🧮 Points: ${formatPoints(points)}, ${(points / Math.abs(netResultApe)).toFixed(1)} GB/APE`;

  return [
    `💰 Balance: ${Number(currentBalanceApe).toFixed(2)} APE (${formatSignedApe(balanceDeltaApe)})`,
    `✌️  Win rate: ${winRate.toFixed(1)}% (${wins}/${completedGames})`,
    `🎲 RTP: ${rtp.toFixed(1)}% (payout ${totalPayoutApe.toFixed(2)}  wagered ${totalWageredApe.toFixed(2)}  ${netResultLabel} ${Math.abs(netResultApe).toFixed(2)})`,
    pointsLine,
    `⏳ Next game in ${nextDelayLabel}`,
  ].join('\n');
}
