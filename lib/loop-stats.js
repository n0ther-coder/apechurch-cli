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
    totalFeesPaidApe: 0,
  };
}

export function recordLoopGame(stats, {
  won = false,
  wageredApe = 0,
  payoutApe = 0,
  feesPaidApe = 0,
} = {}) {
  stats.completedGames += 1;
  stats.wins += won ? 1 : 0;
  stats.totalWageredApe += Number(wageredApe) || 0;
  stats.totalPayoutApe += Number(payoutApe) || 0;
  stats.totalFeesPaidApe += Number(feesPaidApe) || 0;
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

function formatWinRateLine({ wins, completedGames, winRate }) {
  return `✌️  Win rate: ${winRate.toFixed(1)}% (${wins}/${completedGames})`;
}

function formatRtpLine({ rtp, totalPayoutApe, totalWageredApe, netResultLabel, netResultApe }) {
  return `🎲 RTP: ${rtp.toFixed(1)}% (payout ${totalPayoutApe.toFixed(2)}  wagered ${totalWageredApe.toFixed(2)}  ${netResultLabel} ${Math.abs(netResultApe).toFixed(2)})`;
}

function formatPointsLine({ points, netResultApe }) {
  if (netResultApe > 0) {
    return `🧮 Points: ${formatPoints(points)} (+${formatPoints(points)} GB, +${netResultApe.toFixed(2)} APE)`;
  }
  if (netResultApe === 0) {
    return `🧮 Points: ${formatPoints(points)} (+${formatPoints(points)} GB)`;
  }
  return `🧮 Points: ${formatPoints(points)} (${(points / Math.abs(netResultApe)).toFixed(1)} GB/APE)`;
}

function getDerivedStats(stats = {}) {
  const completedGames = stats?.completedGames || 0;
  const wins = stats?.wins || 0;
  const totalWageredApe = stats?.totalWageredApe || 0;
  const totalPayoutApe = stats?.totalPayoutApe || 0;
  const totalFeesPaidApe = stats?.totalFeesPaidApe || 0;
  const winRate = completedGames > 0 ? (wins / completedGames) * 100 : 0;
  const rtp = totalWageredApe > 0 ? (totalPayoutApe / totalWageredApe) * 100 : 0;
  const points = totalWageredApe * GB_POINTS_PER_APE;
  const netResultApe = totalPayoutApe - totalWageredApe;
  const netResultLabel = netResultApe > 0 ? 'win' : netResultApe < 0 ? 'loss' : 'even';

  return {
    completedGames,
    wins,
    totalWageredApe,
    totalPayoutApe,
    totalFeesPaidApe,
    winRate,
    rtp,
    points,
    netResultApe,
    netResultLabel,
  };
}

export function formatLoopProgress({ currentBalanceApe, startingBalanceApe, stats, nextDelayLabel }) {
  const {
    completedGames,
    wins,
    totalWageredApe,
    totalPayoutApe,
    winRate,
    rtp,
    points,
    netResultApe,
    netResultLabel,
  } = getDerivedStats(stats);
  const balanceDeltaApe = (Number(currentBalanceApe) || 0) - (Number(startingBalanceApe) || 0);
  const lines = [
    `⚖️  Balance: ${Number(currentBalanceApe).toFixed(2)} APE (${formatSignedApe(balanceDeltaApe)})`,
    formatWinRateLine({ wins, completedGames, winRate }),
    formatRtpLine({ rtp, totalPayoutApe, totalWageredApe, netResultLabel, netResultApe }),
    formatPointsLine({ points, netResultApe }),
  ];

  if (nextDelayLabel) {
    lines.push(`⏳ Next game in ${nextDelayLabel}`);
  }

  return lines.join('\n');
}

export function formatSessionStats({ gamesPlayed, startingBalanceApe, endingBalanceApe, stats } = {}) {
  const startingBalance = Number(startingBalanceApe) || 0;
  const endingBalance = Number(endingBalanceApe) || 0;
  const netResult = endingBalance - startingBalance;
  const sign = netResult >= 0 ? '+' : '';
  const {
    completedGames,
    wins,
    totalFeesPaidApe,
    winRate,
    rtp,
    points,
    totalPayoutApe,
    totalWageredApe,
    netResultApe,
    netResultLabel,
  } = getDerivedStats(stats);
  const displayedGames = Number.isFinite(gamesPlayed) ? gamesPlayed : completedGames;
  const netResultPrefix = netResult > 0 ? '🎉 ' : netResult < 0 ? '💀 ' : '🤝 ';
  const balanceComparator = endingBalance > startingBalance ? '>' : endingBalance < startingBalance ? '<' : '=';

  return [
    '🏁 Session Stats:',
    `   🎰 Games: ${displayedGames}`,
    `   💸 Fees paid: ${totalFeesPaidApe.toFixed(2)} APE`,
    `   ${netResultPrefix}Net result: ${sign}${netResult.toFixed(2)} APE (⚖️  end ${endingBalance.toFixed(2)} ${balanceComparator} start ${startingBalance.toFixed(2)})`,
    `   ${formatWinRateLine({ wins, completedGames, winRate })}`,
    `   ${formatRtpLine({ rtp, totalPayoutApe, totalWageredApe, netResultLabel, netResultApe })}`,
    `   ${formatPointsLine({ points, netResultApe })}`,
  ].join('\n');
}
