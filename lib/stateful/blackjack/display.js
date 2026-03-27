/**
 * Blackjack Display Module
 * Handles rendering game state in various formats
 */
import { formatEther } from 'viem';
import {
  renderCard,
  renderCards,
  cardToString,
  boxContent,
  formatApe,
  colors,
  colorize,
  RANKS,
  SUITS,
} from '../display.js';
import {
  GameState,
  GameStateNames,
  HandStatus,
  Action,
} from './constants.js';
import {
  getActiveHand,
  formatActionLabel,
  formatActionUnavailable,
  calculateNetResult,
} from './state.js';
import { formatBlackjackStake } from './format.js';

/**
 * Render game state based on display mode
 */
export function renderGame(state, actions, opts = {}) {
  const mode = opts.displayMode || 'full';
  
  switch (mode) {
    case 'json':
      return renderGameJson(state, actions);
    case 'simple':
      return renderGameSimple(state, actions, opts);
    case 'full':
    default:
      return renderGameFull(state, actions, opts);
  }
}

/**
 * Full display with clean card format
 */
function renderGameFull(state, actions, opts = {}) {
  const lines = [];
  const width = 55;
  const title = opts.gameLabel ? `BLACKJACK  ${opts.gameLabel}` : 'BLACKJACK';
  
  // Dealer section
  lines.push('');
  const dealerCards = state.dealerHand.cards;
  const dealerFaceDown = state.gameState !== GameState.HAND_COMPLETE && 
                         state.gameState !== GameState.DEALER_TURN &&
                         dealerCards.length > 1 ? [1] : [];
  
  if (dealerCards.length > 0) {
    const cardsStr = renderCardsInline(dealerCards, dealerFaceDown);
    
    // Show dealer value if no face-down card
    if (dealerFaceDown.length === 0) {
      const valueStr = formatHandValue(state.dealerHand);
      lines.push(`  DEALER:  ${cardsStr}  ${valueStr}`);
    } else {
      lines.push(`  DEALER:  ${cardsStr}`);
    }
  }
  
  lines.push('');
  
  // Player hands
  const numHands = state.playerHands[1].bet > 0n ? 2 : 1;
  
  for (let i = 0; i < numHands; i++) {
    const hand = state.playerHands[i];
    if (hand.cards.length === 0) continue;
    
    const isActive = i === state.activeHandIndex && state.isPlayerTurn;
    const label = numHands > 1 
      ? `HAND ${i + 1}${isActive ? ' ◄' : ''}`
      : 'YOU';
    
    const cardsStr = renderCardsInline(hand.cards, []);
    const valueStr = formatHandValue(hand);
    const betStr = `(${formatBlackjackStake(hand.bet)} APE)`;
    
    lines.push(`  ${label}:  ${cardsStr}  ${valueStr}  ${betStr}`);
  }
  
  lines.push('');

  lines.push(`  Main Bet: ${formatBlackjackStake(state.initialBet)} APE`);
  const sideBetLines = formatSideBetLines(state);
  if (sideBetLines.length > 0) {
    lines.push(...sideBetLines);
    lines.push('');
  }
  
  // Insurance/Side bets info
  if (state.insuranceBet.hasBet) {
    lines.push(`  Insurance: ${formatBlackjackStake(state.insuranceBet.bet)} APE`);
    lines.push('');
  }
  
  // Game result if complete
  if (state.isComplete) {
    const result = calculateNetResult(state);
    lines.push('  ─────────────────────────────────────');
    if (result.won) {
      lines.push(`  🎉 YOU WIN! +${formatApe(result.net)} APE`);
    } else if (result.push) {
      lines.push(`  🤝 PUSH - Bet returned`);
    } else {
      lines.push(`  💀 DEALER WINS - ${formatApe(-result.net)} APE`);
    }
    lines.push(`  Total Payout: ${formatApe(result.payout)} APE`);
    lines.push('');
  }
  
  // Actions menu
  if (actions.length > 0 && !state.isComplete) {
    lines.push('  ─────────────────────────────────────');
    lines.push('  Available Actions:');
    actions.forEach((a, idx) => {
      const num = idx + 1;
      const label = formatActionLabel(a, true);
      const unavail = formatActionUnavailable(a);
      
      if (a.canAfford) {
        lines.push(`    [${num}] ${label}`);
      } else {
        lines.push(`    [${num}] ${label} — ${unavail}`);
      }
    });
    lines.push('');
  }
  
  // Waiting indicator
  if (state.awaitingRandomNumber) {
    lines.push('  ⏳ Waiting for cards...');
    lines.push('');
  }
  
  // Build box
  const boxed = boxContent(lines, title, width);
  return boxed.join('\n');
}

/**
 * Simple text display (no ASCII art)
 */
function renderGameSimple(state, actions, opts = {}) {
  const lines = [];

  if (opts.gameLabel) {
    lines.push(`BLACKJACK  ${opts.gameLabel}`);
    lines.push('');
  }
  
  // Dealer
  const dealerCards = state.dealerHand.cards;
  const showAll = state.gameState === GameState.HAND_COMPLETE || 
                  state.gameState === GameState.DEALER_TURN;
  
  if (dealerCards.length > 0) {
    const cardStrs = dealerCards.map((c, i) => {
      if (!showAll && i === 1) return '[??]';
      return c.display;
    });
    const dealerLine = `DEALER: ${cardStrs.join(' ')}`;
    const valueStr = showAll ? ` = ${state.dealerHand.handValue}` : '';
    lines.push(dealerLine + valueStr);
  }
  
  lines.push('');
  
  // Player hands
  const numHands = state.playerHands[1].bet > 0n ? 2 : 1;
  
  for (let i = 0; i < numHands; i++) {
    const hand = state.playerHands[i];
    if (hand.cards.length === 0) continue;
    
    const isActive = i === state.activeHandIndex && state.isPlayerTurn;
    const label = numHands > 1 ? `HAND ${i + 1}` : 'YOU';
    const marker = isActive ? ' ◄' : '';
    
    const cardStrs = hand.cards.map(c => c.display);
    const valueStr = formatHandValue(hand);
    const betStr = `(${formatBlackjackStake(hand.bet)} APE)`;
    
    lines.push(`${label}${marker}: ${cardStrs.join(' ')} ${valueStr} ${betStr}`);
  }
  
  // Result
  const sideBetLines = formatSideBetLines(state);
  if (sideBetLines.length > 0) {
    lines.push('');
    lines.push(`Main Bet: ${formatBlackjackStake(state.initialBet)} APE`);
    lines.push(...sideBetLines);
  }

  if (state.isComplete) {
    const result = calculateNetResult(state);
    lines.push('');
    if (result.won) {
      lines.push(`RESULT: WIN +${formatApe(result.net)} APE`);
    } else if (result.push) {
      lines.push(`RESULT: PUSH`);
    } else {
      lines.push(`RESULT: LOSE ${formatApe(-result.net)} APE`);
    }
  }
  
  // Actions
  if (actions.length > 0 && !state.isComplete) {
    lines.push('');
    lines.push('Actions: ' + actions.map((a, i) => `[${i+1}]${a.label}`).join(' '));
  }
  
  // Waiting
  if (state.awaitingRandomNumber) {
    lines.push('');
    lines.push('Waiting for cards...');
  }
  
  return lines.join('\n');
}

/**
 * JSON output for agents
 */
function renderGameJson(state, actions) {
  const result = state.isComplete ? calculateNetResult(state) : null;
  
  const output = {
    gameId: state.gameId,
    state: state.gameStateName,
    awaitingRng: state.awaitingRandomNumber,
    activeHandIndex: state.activeHandIndex,
    
    dealer: {
      cards: state.dealerHand.cards.map(c => c.display),
      value: state.dealerHand.handValue,
      isSoft: state.dealerHand.isSoft,
    },
    
    playerHands: state.playerHands
      .filter(h => h.cards.length > 0)
      .map((h, i) => ({
        index: i,
        cards: h.cards.map(c => c.display),
        value: h.handValue,
        isSoft: h.isSoft,
        status: h.statusName,
        bet: formatEther(h.bet),
      })),
    
    initialBet: formatEther(state.initialBet),
    mainBet: formatEther(state.initialBet),
    totalBet: formatEther(state.totalBet),
    sideBets: {
      player: {
        bet: formatEther(state.sideBets[0].bet),
        payout: formatEther(state.sideBets[0].payout),
      },
      dealer: {
        bet: formatEther(state.sideBets[1].bet),
        payout: formatEther(state.sideBets[1].payout),
      },
    },
    
    insurance: state.insuranceBet.hasBet ? {
      bet: formatEther(state.insuranceBet.bet),
      payout: formatEther(state.insuranceBet.payout),
    } : null,
    
    availableActions: actions.map(a => ({
      action: a.action,
      key: a.key,
      cost: formatEther(a.cost),
      canAfford: a.canAfford,
    })),
    
    result: result ? {
      won: result.won,
      push: result.push,
      payout: formatEther(result.payout),
      net: formatEther(result.net),
    } : null,
  };
  
  return JSON.stringify(output, null, 2);
}

/**
 * Render cards in clean inline format
 * Returns single line: [A♠] [K♥] [10♦]
 */
function renderCardsInline(cards, faceDownIndices = []) {
  if (cards.length === 0) return '';
  
  return cards.map((card, i) => {
    if (faceDownIndices.includes(i)) {
      return '[??]';
    }
    const rank = card.rank ? RANKS[card.rank] : RANKS[(card.rawCard % 13) + 1] || '?';
    const suit = card.suit !== undefined ? SUITS[card.suit] : SUITS[Math.floor(card.rawCard / 13)] || '?';
    return `[${rank}${suit}]`;
  }).join(' ');
}

/**
 * Format hand value for display
 */
function formatHandValue(hand) {
  let str = `= ${hand.handValue}`;
  
  if (hand.isBlackjack) {
    str += ' (Blackjack!)';
  } else if (hand.isBusted) {
    str += ' (BUST)';
  } else if (hand.isSoft) {
    str += ' (soft)';
  }
  
  return str;
}

function formatSideBetLines(state) {
  const playerSide = state?.sideBets?.[0];
  const dealerSide = state?.sideBets?.[1];

  const formatLine = (label, sideBet) => {
    if (!sideBet?.hasBet) {
      return `  ${label}: none`;
    }

    const payoutSuffix = sideBet.payout > 0n
      ? ` → ${formatBlackjackStake(sideBet.payout)} APE`
      : '';
    return `  ${label}: ${formatBlackjackStake(sideBet.bet)} APE${payoutSuffix}`;
  };

  return [
    formatLine('Player Side', playerSide),
    formatLine('Dealer Side', dealerSide),
  ];
}

/**
 * Render action prompt
 */
export function renderPrompt(actions) {
  const affordableCount = actions.filter(a => a.canAfford).length;
  if (affordableCount === 0) {
    return 'No affordable actions available.';
  }
  
  const maxNum = actions.length;
  return `Enter choice (1-${maxNum}): `;
}

/**
 * Parse user input to action
 */
export function parseActionInput(input, actions) {
  const trimmed = input.trim().toLowerCase();
  
  // Try number first
  const num = parseInt(trimmed);
  if (!isNaN(num) && num >= 1 && num <= actions.length) {
    return actions[num - 1];
  }
  
  // Try action key
  const byKey = actions.find(a => a.key === trimmed);
  if (byKey) return byKey;
  
  // Try action name
  const byName = actions.find(a => a.action === trimmed);
  if (byName) return byName;
  
  return null;
}
