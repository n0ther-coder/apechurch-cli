/**
 * @fileoverview Bankroll Fraction Betting Strategy
 *
 * Bets a fixed fraction of the remaining session bankroll. The bankroll is
 * supplied by loop controls, either directly through --bankroll/--max-loss or
 * derived from --stop-loss and the starting balance.
 *
 * @module lib/strategies/bankroll-fraction
 */

export default {
  name: 'bankroll-fraction',
  description: 'Bet a fixed fraction of the remaining bankroll',
  requiresBankroll: true,
  requiresNoBaseBet: true,

  init(baseBet, opts = {}) {
    const fraction = Number(opts.fraction);
    return {
      fraction,
      currentBet: 0,
      bankrollRemainingApe: null,
    };
  },

  nextBet(state, lastResult, opts = {}) {
    const bankrollRemainingApe = Number(opts.bankrollRemainingApe);
    const fraction = Number(state.fraction);
    const bet = Number.isFinite(bankrollRemainingApe) && bankrollRemainingApe > 0
      ? bankrollRemainingApe * fraction
      : 0;

    return {
      bet,
      state: {
        ...state,
        currentBet: bet,
        bankrollRemainingApe,
      },
    };
  },
};
