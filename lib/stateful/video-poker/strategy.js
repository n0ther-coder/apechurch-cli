/**
 * Video Poker Optimal Strategy (9/6 Jacks or Better)
 * 
 * Priority-ranked strategy table. Check from top to bottom,
 * hold the first pattern that matches.
 */

// High cards are J, Q, K, A (ranks 11, 12, 13, 1)
const HIGH_CARDS = [1, 11, 12, 13];

/**
 * Analyze a hand and return the optimal hold decision
 * @param {Array} cards - Array of 5 card objects with { rank, suit }
 * @returns {{ hold: boolean[], reason: string, priority: number }}
 */
export function getOptimalHold(cards) {
  // Try each strategy in priority order
  const strategies = [
    checkRoyalFlush,           // 1
    checkStraightFlush,        // 2
    checkFourOfAKind,          // 3
    checkFourToRoyal,          // 4
    checkFullHouse,            // 5
    checkFlush,                // 6
    checkStraight,             // 7
    checkThreeOfAKind,         // 8
    checkFourToStraightFlush,  // 9
    checkTwoPair,              // 10
    checkHighPair,             // 11
    checkThreeToRoyal,         // 12
    checkFourToFlush,          // 13
    checkTJQKUnsuited,         // 14
    checkLowPair,              // 15
    checkFourToOpenStraight,   // 16
    checkTwoSuitedHighCards,   // 17
    checkThreeToStraightFlush, // 18
    checkFourToInsideStraightHighCards, // 19
    checkJQKUnsuited,          // 20
    checkQKorJKUnsuited,       // 21
    checkTQorTJSuited,         // 22
    checkTKorTASuited,         // 23
    checkSingleHighCard,       // 24
    discardAll,                // 25
  ];

  for (let i = 0; i < strategies.length; i++) {
    const result = strategies[i](cards);
    if (result) {
      return {
        hold: result.hold,
        reason: result.reason,
        priority: i + 1,
      };
    }
  }

  // Should never reach here, but fallback to discard all
  return {
    hold: [true, true, true, true, true],
    reason: 'Discard all',
    priority: 25,
  };
}

/**
 * Convert hold array to cardsToRedraw array (inverted)
 * hold[i] = true means KEEP card i
 * cardsToRedraw[i] = true means DISCARD card i
 */
export function holdToRedraw(hold) {
  return hold.map(h => !h);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isHighCard(rank) {
  return HIGH_CARDS.includes(rank);
}

function countRanks(cards) {
  const counts = {};
  for (const card of cards) {
    counts[card.rank] = (counts[card.rank] || 0) + 1;
  }
  return counts;
}

function countSuits(cards) {
  const counts = {};
  for (const card of cards) {
    counts[card.suit] = (counts[card.suit] || 0) + 1;
  }
  return counts;
}

function getMaxSuitCount(cards) {
  const counts = countSuits(cards);
  return Math.max(...Object.values(counts));
}

function getSuitWithCount(cards, count) {
  const counts = countSuits(cards);
  for (const [suit, c] of Object.entries(counts)) {
    if (c >= count) return parseInt(suit);
  }
  return null;
}

function getRankCounts(cards) {
  const counts = countRanks(cards);
  return Object.values(counts).sort((a, b) => b - a);
}

function getCardsWithRankCount(cards, count) {
  const counts = countRanks(cards);
  const targetRanks = Object.entries(counts)
    .filter(([_, c]) => c === count)
    .map(([r, _]) => parseInt(r));
  return cards.filter(c => targetRanks.includes(c.rank));
}

function getCardsWithSuit(cards, suit) {
  return cards.filter(c => c.suit === suit);
}

function holdIndices(cards, indices) {
  const hold = [false, false, false, false, false];
  for (const i of indices) {
    hold[i] = true;
  }
  return hold;
}

function holdCards(cards, toHold) {
  return cards.map((c, i) => toHold.some(h => h.rank === c.rank && h.suit === c.suit));
}

// Check if ranks form a straight (accounting for Ace-low and Ace-high)
function isStraightRanks(ranks) {
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  if (sorted.length !== 5) return false;
  
  // Check normal straight
  if (sorted[4] - sorted[0] === 4) return true;
  
  // Check Ace-low straight (A-2-3-4-5)
  if (sorted.join(',') === '1,2,3,4,5') return true;
  
  // Check Ace-high straight (10-J-Q-K-A)
  if (sorted.join(',') === '1,10,11,12,13') return true;
  
  return false;
}

// Check if ranks could form a straight with n cards
function isPartialStraight(ranks, needed) {
  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  if (unique.length < (5 - needed)) return false;
  
  // Generate all possible 5-card straight windows
  const windows = [
    [1, 2, 3, 4, 5],
    [2, 3, 4, 5, 6],
    [3, 4, 5, 6, 7],
    [4, 5, 6, 7, 8],
    [5, 6, 7, 8, 9],
    [6, 7, 8, 9, 10],
    [7, 8, 9, 10, 11],
    [8, 9, 10, 11, 12],
    [9, 10, 11, 12, 13],
    [10, 11, 12, 13, 1], // Royal
  ];
  
  for (const window of windows) {
    const matches = unique.filter(r => window.includes(r));
    if (matches.length >= (5 - needed)) {
      return { window, matches };
    }
  }
  return null;
}

// Check for open-ended straight draw (can complete on either end)
function isOpenEndedStraightDraw(ranks) {
  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  if (unique.length !== 4) return false;
  
  // Must be 4 consecutive cards, not including A
  if (unique[3] - unique[0] === 3 && !unique.includes(1)) {
    // And not at the edges (can't be 2-3-4-5 or 10-J-Q-K)
    if (unique[0] >= 2 && unique[3] <= 12) {
      return true;
    }
  }
  return false;
}

// Check for inside straight draw (needs middle card)
function isInsideStraightDraw(ranks) {
  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  if (unique.length !== 4) return false;
  
  // 4 cards with one gap
  const gaps = [];
  for (let i = 1; i < unique.length; i++) {
    gaps.push(unique[i] - unique[i-1]);
  }
  
  // One gap of 2, rest are 1s
  const gapOf2 = gaps.filter(g => g === 2).length;
  const gapOf1 = gaps.filter(g => g === 1).length;
  
  if (gapOf2 === 1 && gapOf1 === 2) return true;
  
  // Also check A-high inside straights
  if (unique.includes(1) && unique.includes(13)) {
    // Check for A-J-Q-K or A-10-Q-K etc
    const normalized = unique.map(r => r === 1 ? 14 : r).sort((a, b) => a - b);
    if (normalized[3] - normalized[0] === 4) return true;
  }
  
  return false;
}

// ============================================================================
// STRATEGY CHECKS (in priority order)
// ============================================================================

// 1. Royal Flush (hold all)
function checkRoyalFlush(cards) {
  const suits = countSuits(cards);
  const sameSuit = Object.values(suits).some(c => c === 5);
  if (!sameSuit) return null;
  
  const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
  if (ranks.join(',') === '1,10,11,12,13') {
    return { hold: [true, true, true, true, true], reason: 'Royal Flush' };
  }
  return null;
}

// 2. Straight Flush (hold all)
function checkStraightFlush(cards) {
  const suits = countSuits(cards);
  const sameSuit = Object.values(suits).some(c => c === 5);
  if (!sameSuit) return null;
  
  const ranks = cards.map(c => c.rank);
  if (isStraightRanks(ranks)) {
    return { hold: [true, true, true, true, true], reason: 'Straight Flush' };
  }
  return null;
}

// 3. Four of a Kind (hold all)
function checkFourOfAKind(cards) {
  const counts = getRankCounts(cards);
  if (counts[0] === 4) {
    return { hold: [true, true, true, true, true], reason: 'Four of a Kind' };
  }
  return null;
}

// 4. Four to Royal Flush
function checkFourToRoyal(cards) {
  const royalRanks = [1, 10, 11, 12, 13];
  
  for (let suit = 0; suit < 4; suit++) {
    const suited = cards.filter(c => c.suit === suit && royalRanks.includes(c.rank));
    if (suited.length === 4) {
      const hold = holdCards(cards, suited);
      return { hold, reason: '4 to Royal Flush' };
    }
  }
  return null;
}

// 5. Full House (hold all)
function checkFullHouse(cards) {
  const counts = getRankCounts(cards);
  if (counts[0] === 3 && counts[1] === 2) {
    return { hold: [true, true, true, true, true], reason: 'Full House' };
  }
  return null;
}

// 6. Flush (hold all)
function checkFlush(cards) {
  if (getMaxSuitCount(cards) === 5) {
    return { hold: [true, true, true, true, true], reason: 'Flush' };
  }
  return null;
}

// 7. Straight (hold all)
function checkStraight(cards) {
  const ranks = cards.map(c => c.rank);
  if (isStraightRanks(ranks)) {
    return { hold: [true, true, true, true, true], reason: 'Straight' };
  }
  return null;
}

// 8. Three of a Kind
function checkThreeOfAKind(cards) {
  const counts = getRankCounts(cards);
  if (counts[0] === 3) {
    const trips = getCardsWithRankCount(cards, 3);
    const hold = holdCards(cards, trips);
    return { hold, reason: 'Three of a Kind' };
  }
  return null;
}

// 9. Four to Straight Flush
function checkFourToStraightFlush(cards) {
  for (let suit = 0; suit < 4; suit++) {
    const suited = getCardsWithSuit(cards, suit);
    if (suited.length >= 4) {
      const ranks = suited.map(c => c.rank);
      const partial = isPartialStraight(ranks, 1);
      if (partial) {
        // Find the 4 cards that form the draw
        const drawCards = suited.filter(c => partial.matches.includes(c.rank)).slice(0, 4);
        if (drawCards.length === 4) {
          const hold = holdCards(cards, drawCards);
          return { hold, reason: '4 to Straight Flush' };
        }
      }
    }
  }
  return null;
}

// 10. Two Pair
function checkTwoPair(cards) {
  const counts = getRankCounts(cards);
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = getCardsWithRankCount(cards, 2);
    const hold = holdCards(cards, pairs);
    return { hold, reason: 'Two Pair' };
  }
  return null;
}

// 11. High Pair (JJ, QQ, KK, AA)
function checkHighPair(cards) {
  const counts = countRanks(cards);
  for (const [rank, count] of Object.entries(counts)) {
    if (count === 2 && isHighCard(parseInt(rank))) {
      const pair = cards.filter(c => c.rank === parseInt(rank));
      const hold = holdCards(cards, pair);
      return { hold, reason: 'High Pair' };
    }
  }
  return null;
}

// 12. Three to Royal Flush
function checkThreeToRoyal(cards) {
  const royalRanks = [1, 10, 11, 12, 13];
  
  for (let suit = 0; suit < 4; suit++) {
    const suited = cards.filter(c => c.suit === suit && royalRanks.includes(c.rank));
    if (suited.length === 3) {
      const hold = holdCards(cards, suited);
      return { hold, reason: '3 to Royal Flush' };
    }
  }
  return null;
}

// 13. Four to Flush
function checkFourToFlush(cards) {
  const suit = getSuitWithCount(cards, 4);
  if (suit !== null) {
    const suited = getCardsWithSuit(cards, suit);
    const hold = holdCards(cards, suited);
    return { hold, reason: '4 to Flush' };
  }
  return null;
}

// 14. TJQK unsuited
function checkTJQKUnsuited(cards) {
  const tjqk = cards.filter(c => [10, 11, 12, 13].includes(c.rank));
  if (tjqk.length === 4) {
    const suits = new Set(tjqk.map(c => c.suit));
    if (suits.size > 1) { // Unsuited
      const hold = holdCards(cards, tjqk);
      return { hold, reason: 'TJQK unsuited' };
    }
  }
  return null;
}

// 15. Low Pair (22-TT)
function checkLowPair(cards) {
  const counts = countRanks(cards);
  for (const [rank, count] of Object.entries(counts)) {
    const r = parseInt(rank);
    if (count === 2 && !isHighCard(r)) {
      const pair = cards.filter(c => c.rank === r);
      const hold = holdCards(cards, pair);
      return { hold, reason: 'Low Pair' };
    }
  }
  return null;
}

// 16. Four to Open-Ended Straight
function checkFourToOpenStraight(cards) {
  const ranks = cards.map(c => c.rank);
  
  // Try all 4-card combinations
  for (let skip = 0; skip < 5; skip++) {
    const subset = cards.filter((_, i) => i !== skip);
    const subRanks = subset.map(c => c.rank);
    if (isOpenEndedStraightDraw(subRanks)) {
      const hold = holdCards(cards, subset);
      return { hold, reason: '4 to Open Straight' };
    }
  }
  return null;
}

// 17. Two Suited High Cards
function checkTwoSuitedHighCards(cards) {
  for (let suit = 0; suit < 4; suit++) {
    const suited = cards.filter(c => c.suit === suit && isHighCard(c.rank));
    if (suited.length >= 2) {
      // Take best 2 (prefer lowest for royal potential)
      const sorted = suited.sort((a, b) => {
        // Prefer J, Q, K over A for straight potential
        const aVal = a.rank === 1 ? 14 : a.rank;
        const bVal = b.rank === 1 ? 14 : b.rank;
        return aVal - bVal;
      }).slice(0, 2);
      const hold = holdCards(cards, sorted);
      return { hold, reason: '2 Suited High Cards' };
    }
  }
  return null;
}

// 18. Three to Straight Flush
function checkThreeToStraightFlush(cards) {
  for (let suit = 0; suit < 4; suit++) {
    const suited = getCardsWithSuit(cards, suit);
    if (suited.length >= 3) {
      const ranks = suited.map(c => c.rank);
      const partial = isPartialStraight(ranks, 2);
      if (partial) {
        const drawCards = suited.filter(c => partial.matches.includes(c.rank)).slice(0, 3);
        if (drawCards.length === 3) {
          const hold = holdCards(cards, drawCards);
          return { hold, reason: '3 to Straight Flush' };
        }
      }
    }
  }
  return null;
}

// 19. Four to Inside Straight with 3-4 High Cards
function checkFourToInsideStraightHighCards(cards) {
  for (let skip = 0; skip < 5; skip++) {
    const subset = cards.filter((_, i) => i !== skip);
    const subRanks = subset.map(c => c.rank);
    
    if (isInsideStraightDraw(subRanks)) {
      const highCount = subset.filter(c => isHighCard(c.rank)).length;
      if (highCount >= 3) {
        const hold = holdCards(cards, subset);
        return { hold, reason: '4 to Inside Straight (3+ high)' };
      }
    }
  }
  return null;
}

// 20. JQK unsuited
function checkJQKUnsuited(cards) {
  const jqk = cards.filter(c => [11, 12, 13].includes(c.rank));
  if (jqk.length === 3) {
    const suits = new Set(jqk.map(c => c.suit));
    if (suits.size > 1) {
      const hold = holdCards(cards, jqk);
      return { hold, reason: 'JQK unsuited' };
    }
  }
  return null;
}

// 21. QK or JK unsuited
function checkQKorJKUnsuited(cards) {
  const hasK = cards.find(c => c.rank === 13);
  const hasQ = cards.find(c => c.rank === 12);
  const hasJ = cards.find(c => c.rank === 11);
  
  if (hasK && hasQ && hasK.suit !== hasQ.suit) {
    const hold = holdCards(cards, [hasK, hasQ]);
    return { hold, reason: 'QK unsuited' };
  }
  if (hasK && hasJ && hasK.suit !== hasJ.suit) {
    const hold = holdCards(cards, [hasK, hasJ]);
    return { hold, reason: 'JK unsuited' };
  }
  return null;
}

// 22. TQ or TJ suited
function checkTQorTJSuited(cards) {
  for (let suit = 0; suit < 4; suit++) {
    const suited = cards.filter(c => c.suit === suit);
    const hasT = suited.find(c => c.rank === 10);
    const hasQ = suited.find(c => c.rank === 12);
    const hasJ = suited.find(c => c.rank === 11);
    
    if (hasT && hasQ) {
      const hold = holdCards(cards, [hasT, hasQ]);
      return { hold, reason: 'TQ suited' };
    }
    if (hasT && hasJ) {
      const hold = holdCards(cards, [hasT, hasJ]);
      return { hold, reason: 'TJ suited' };
    }
  }
  return null;
}

// 23. TK or TA suited
function checkTKorTASuited(cards) {
  for (let suit = 0; suit < 4; suit++) {
    const suited = cards.filter(c => c.suit === suit);
    const hasT = suited.find(c => c.rank === 10);
    const hasK = suited.find(c => c.rank === 13);
    const hasA = suited.find(c => c.rank === 1);
    
    if (hasT && hasK) {
      const hold = holdCards(cards, [hasT, hasK]);
      return { hold, reason: 'TK suited' };
    }
    if (hasT && hasA) {
      const hold = holdCards(cards, [hasT, hasA]);
      return { hold, reason: 'TA suited' };
    }
  }
  return null;
}

// 24. Single High Card
function checkSingleHighCard(cards) {
  const highCards = cards.filter(c => isHighCard(c.rank));
  if (highCards.length >= 1) {
    // Prefer J > Q > K > A (better straight potential)
    const sorted = highCards.sort((a, b) => {
      const order = { 11: 1, 12: 2, 13: 3, 1: 4 };
      return order[a.rank] - order[b.rank];
    });
    const hold = holdCards(cards, [sorted[0]]);
    return { hold, reason: 'Single High Card' };
  }
  return null;
}

// 25. Discard All
function discardAll(cards) {
  return { hold: [false, false, false, false, false], reason: 'Discard all' };
}
