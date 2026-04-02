/**
 * Shared helpers for cumulative loop/session metrics.
 */
import { GB_POINTS_PER_APE } from './constants.js';
import { formatRtpDetails, formatRtpTripletLine, resolveConfiguredGameVariant } from './rtp.js';
import { theme } from './theme.js';

function createLoopStatsBucket() {
  return {
    completedGames: 0,
    wins: 0,
    totalWageredApe: 0,
    totalPayoutApe: 0,
    totalFeesPaidApe: 0,
  };
}

export function createLoopStats() {
  return {
    ...createLoopStatsBucket(),
    byVariant: {},
  };
}

export function recordLoopGame(stats, {
  won = false,
  wageredApe = 0,
  payoutApe = 0,
  feesPaidApe = 0,
  rtpGame = null,
  rtpConfig = null,
} = {}) {
  stats.completedGames += 1;
  stats.wins += won ? 1 : 0;
  stats.totalWageredApe += Number(wageredApe) || 0;
  stats.totalPayoutApe += Number(payoutApe) || 0;
  stats.totalFeesPaidApe += Number(feesPaidApe) || 0;

  const variant = resolveConfiguredGameVariant({ game: rtpGame, config: rtpConfig });
  if (variant.variantKey) {
    stats.byVariant ||= {};
    stats.byVariant[variant.variantKey] ||= createLoopStatsBucket();
    const bucket = stats.byVariant[variant.variantKey];
    bucket.completedGames += 1;
    bucket.wins += won ? 1 : 0;
    bucket.totalWageredApe += Number(wageredApe) || 0;
    bucket.totalPayoutApe += Number(payoutApe) || 0;
    bucket.totalFeesPaidApe += Number(feesPaidApe) || 0;
  }

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
  return `✌️  Win rate: ${winRate.toFixed(2)}% (${wins}/${completedGames})`;
}

function formatRtpLine({ rtpGame, rtpConfig = null, rtp, totalPayoutApe, totalWageredApe, netResultApe }) {
  return `${formatRtpTripletLine({ game: rtpGame, config: rtpConfig, currentRtp: rtp })} ${formatRtpDetails({
    totalPayoutApe,
    totalWageredApe,
    netResultApe,
  })}`;
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
  };
}

function getScopedLoopStats(stats, { rtpGame = null, rtpConfig = null } = {}) {
  const variant = resolveConfiguredGameVariant({ game: rtpGame, config: rtpConfig });
  if (!variant.variantKey) {
    return stats;
  }

  const bucket = stats?.byVariant?.[variant.variantKey];
  return bucket || stats;
}

export function formatLoopProgress({ currentBalanceApe, startingBalanceApe, stats, nextDelayLabel, rtpGame = null, rtpConfig = null }) {
  const {
    completedGames,
    wins,
    winRate,
    points,
    netResultApe,
  } = getDerivedStats(stats);
  const scopedRtpStats = getDerivedStats(getScopedLoopStats(stats, { rtpGame, rtpConfig }));
  const balanceDeltaApe = (Number(currentBalanceApe) || 0) - (Number(startingBalanceApe) || 0);
  const lines = [
    `⚖️  Balance: ${Number(currentBalanceApe).toFixed(2)} APE (${formatSignedApe(balanceDeltaApe)})`,
    formatWinRateLine({ wins, completedGames, winRate }),
    formatRtpLine({
      rtpGame,
      rtpConfig,
      rtp: scopedRtpStats.rtp,
      totalPayoutApe: scopedRtpStats.totalPayoutApe,
      totalWageredApe: scopedRtpStats.totalWageredApe,
      netResultApe: scopedRtpStats.netResultApe,
    }),
    formatPointsLine({ points, netResultApe }),
  ];

  if (nextDelayLabel) {
    lines.push(`⏳ Next game in ${nextDelayLabel}`);
  }

  return lines.join('\n');
}

export function formatSessionStats({ gamesPlayed, startingBalanceApe, endingBalanceApe, stats, rtpGame = null, rtpConfig = null } = {}) {
  const startingBalance = Number(startingBalanceApe) || 0;
  const endingBalance = Number(endingBalanceApe) || 0;
  const netResult = endingBalance - startingBalance;
  const sign = netResult >= 0 ? '+' : '';
  const {
    completedGames,
    wins,
    totalFeesPaidApe,
    winRate,
    points,
    netResultApe,
  } = getDerivedStats(stats);
  const scopedRtpStats = getDerivedStats(getScopedLoopStats(stats, { rtpGame, rtpConfig }));
  const displayedGames = Number.isFinite(gamesPlayed) ? gamesPlayed : completedGames;
  const netResultPrefix = netResult > 0 ? '🎉 ' : netResult < 0 ? '💀 ' : '🤝 ';
  const balanceComparator = endingBalance > startingBalance ? '>' : endingBalance < startingBalance ? '<' : '=';

  return [
    '🏁 Session Stats:',
    `   🎰 Games: ${displayedGames}`,
    `   💸 Fees paid: ${totalFeesPaidApe.toFixed(4)} APE`,
    `   ${netResultPrefix}Net result: ${sign}${netResult.toFixed(2)} APE ${theme.dim(`(⚖️  end ${endingBalance.toFixed(2)} ${balanceComparator} start ${startingBalance.toFixed(2)})`)}`,
    `   ${formatWinRateLine({ wins, completedGames, winRate })}`,
    `   ${formatRtpLine({
      rtpGame,
      rtpConfig,
      rtp: scopedRtpStats.rtp,
      totalPayoutApe: scopedRtpStats.totalPayoutApe,
      totalWageredApe: scopedRtpStats.totalWageredApe,
      netResultApe: scopedRtpStats.netResultApe,
    })}`,
    `   ${formatPointsLine({ points, netResultApe })}`,
  ].join('\n');
}
