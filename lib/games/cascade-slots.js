/** Shared option contract for slots with an explicit bonus purchase. */
export function supportsSlotBonusBuy(gameEntry) {
  return gameEntry?.config?.gameDataOrder === 'spins-first-uint8-bonus';
}

export function validateSlotBonusOptions(gameEntry, options = {}, positionalConfig = {}) {
  if (options.bonus === undefined) return;
  if (!supportsSlotBonusBuy(gameEntry)) {
    throw new Error('--bonus requires an explicitly selected Blizzard Blitz or Gimboz of the Galaxy game.');
  }
  if (typeof options.bonus !== 'boolean') throw new Error('--bonus is a boolean flag.');
  if (options.bonus && (options.spin !== undefined || options.betSplit !== undefined
    || options.split !== undefined || positionalConfig.spins !== undefined)) {
    throw new Error(`${gameEntry.name} --bonus buys one bonus round; it cannot be combined with --split, --spin, --bet-split, or a positional count.`);
  }
}
