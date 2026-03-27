import { Action } from './constants.js';

export function formatBlackjackProgressLabel(baseGameLabel, stepLabel) {
  if (!baseGameLabel) {
    return null;
  }

  if (!stepLabel) {
    return baseGameLabel;
  }

  return `${baseGameLabel}  ${stepLabel}`;
}

export function advanceBlackjackProgress(selectedAction, hitCounts = [0, 0], handIndex = 0) {
  const nextHitCounts = Array.isArray(hitCounts) ? hitCounts.slice(0, 2) : [0, 0];
  while (nextHitCounts.length < 2) {
    nextHitCounts.push(0);
  }

  const normalizedHandIndex = handIndex === 1 ? 1 : 0;

  if (!selectedAction) {
    return {
      hitCounts: nextHitCounts,
      stepLabel: null,
    };
  }

  if (selectedAction.action === Action.HIT) {
    nextHitCounts[normalizedHandIndex] += 1;
    return {
      hitCounts: nextHitCounts,
      stepLabel: `Hit ${nextHitCounts[normalizedHandIndex]}`,
    };
  }

  return {
    hitCounts: nextHitCounts,
    stepLabel: selectedAction.label || null,
  };
}
