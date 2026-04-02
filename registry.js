/**
 * @fileoverview Game Registry for Ape Church CLI
 *
 * Central registry of all supported games with:
 * - Contract addresses
 * - Game configuration (parameters, limits)
 * - VRF (Verifiable Random Function) settings
 * - Aliases for easy CLI access
 * - Multiplier/payout information
 *
 * Adding a New Game:
 * 1. Add entry to GAME_REGISTRY array
 * 2. Implement game handler in lib/games/<type>.js
 * 3. Register handler in lib/games/index.js
 * 4. See docs/ADDING_GAMES.md for the full guide
 *
 * @module registry
 */
import {
  APESTRONG_CONTRACT,
  BACCARAT_CONTRACT,
  BEAR_DICE_CONTRACT,
  BLACKJACK_CONTRACT,
  BUBBLEGUM_HEIST_CONTRACT,
  COSMIC_PLINKO_CONTRACT,
  DINO_DOUGH_CONTRACT,
  JUNGLE_PLINKO_CONTRACT,
  KENO_CONTRACT,
  MONKEY_MATCH_CONTRACT,
  PRIMES_CONTRACT,
  ROULETTE_CONTRACT,
  SPEED_KENO_CONTRACT,
  VIDEO_POKER_CONTRACT,
} from './lib/constants.js';

// ============================================================================
// GAME REGISTRY
// ============================================================================

/**
 * Master list of all supported games
 *
 * Each game entry contains:
 * - key: Unique identifier (used in CLI and storage)
 * - name: Human-readable name
 * - slug: URL-safe identifier (matches ape.church URLs)
 * - type: Game type for handler routing (plinko, slots, roulette, etc.)
 * - description: User-facing description
 * - contract: On-chain contract address
 * - aliases: Alternative names for CLI (e.g., 'jungle' → 'jungle-plinko')
 * - abiVerified: Whether the verified on-chain ABI/paytable logic has been checked locally
 * - config: Game-specific parameters and their limits
 * - vrf: VRF fee calculation settings
 * - multipliers: Payout multipliers (where applicable)
 *
 * @type {Array<Object>}
 */
export const GAME_REGISTRY = [
  // ===========================================================================
  // KENO - Pick numbers, match draws
  // ===========================================================================
  {
    key: 'keno',
    name: 'Keno',
    slug: 'keno',
    type: 'keno',
    description: 'Pick 1-10 numbers from 1-40. More picks = riskier but bigger payouts. Hit 10/10 for up to 1,000,000x!',
    contract: KENO_CONTRACT,
    aliases: ['k'],
    config: {
      picks: {
        min: 1,
        max: 10,
        default: 5,
        description: 'How many numbers to pick (1-10). More picks = higher risk/reward.',
        bnf: [
          '<picks> ::= <integer>',
          '; semantic constraint: 1 <= value <= 10',
        ],
      },
      numbers: {
        description: 'Which numbers to bet on (1-40). If not specified, random picks are used.',
        bnf: [
          '<numbers> ::= "random" | <keno-number> ( "," <keno-number> )*',
          '<keno-number> ::= <integer>',
          '; semantic constraint: 1 <= value <= 40',
        ],
        examples: ['1,7,13,25,40', '5,10,15,20,25,30,35,40', 'random'],
      },
    },
    vrf: {
      type: 'static', // Uses getVRFFee() with no args
    },
  },

  // ===========================================================================
  // APESTRONG - Pick-your-odds dice game
  // ===========================================================================
  {
    key: 'ape-strong',
    name: 'ApeStrong',
    slug: 'ape-strong',
    type: 'apestrong',
    description: 'Pick your odds! Choose a range (5-95) — roll under to win. Higher range = more likely to win, lower payout.',
    contract: APESTRONG_CONTRACT,
    aliases: ['strong', 'dice', 'limbo'],
    config: {
      range: {
        min: 5,
        max: 95,
        default: 50,
        description: 'Win probability (%). Roll under this number to win. Lower = riskier, bigger payout.',
        bnf: [
          '<range> ::= <integer>',
          '; semantic constraint: 5 <= value <= 95',
        ],
        examples: [
          { value: 50, payout: '1.95x', winChance: '50%' },
          { value: 25, payout: '3.9x', winChance: '25%' },
          { value: 75, payout: '1.3x', winChance: '75%' },
          { value: 5, payout: '19.5x', winChance: '5%' },
          { value: 95, payout: '1.025x', winChance: '95%' },
        ],
      },
    },
    vrf: {
      type: 'static',
    },
  },

  // ===========================================================================
  // BACCARAT - Classic casino game
  // ===========================================================================
  {
    key: 'baccarat',
    name: 'Baccarat',
    slug: 'baccarat',
    type: 'baccarat',
    description: 'Classic baccarat. Bet on Player (2x), Banker (1.95x), or Tie (9x).',
    contract: BACCARAT_CONTRACT,
    aliases: ['bacc'],
    config: {
      bet: {
        description: 'What to bet on: PLAYER, BANKER, TIE. For combined bets, specify amounts explicitly.',
        bnf: [
          '<bet> ::= "PLAYER" | "BANKER" | "TIE" | <combo-bet>',
          '<combo-bet> ::= <ape> <side-bet> <ape> "TIE"',
          '<side-bet> ::= "PLAYER" | "BANKER"',
        ],
        examples: ['PLAYER', 'BANKER', 'TIE', '140 BANKER 10 TIE', '180 PLAYER 20 TIE'],
      },
    },
    // Payout multipliers (includes house edge)
    multipliers: {
      player: 2.0,    // Even money
      banker: 1.95,   // 5% commission on banker wins
      tie: 9.0,       // High payout but rare (~9.5% probability)
    },
    vrf: {
      type: 'static',
    },
  },

  // ===========================================================================
  // ROULETTE - American roulette with 0 and 00
  // ===========================================================================
  {
    key: 'roulette',
    name: 'Roulette',
    slug: 'roulette',
    type: 'roulette',
    description: 'Classic roulette with American layout (0, 00, 1-36). Bet on numbers, colors, or sections.',
    contract: ROULETTE_CONTRACT,
    aliases: ['rl'],
    config: {
      bet: {
        description: 'What to bet on. Numbers (0-36, 00), colors (RED, BLACK), parity (ODD, EVEN), sections, etc.',
        bnf: [
          '<bet-list> ::= <roulette-bet> ( "," <roulette-bet> )*',
          '<roulette-bet> ::= "0" | "00" | <roulette-number> | "RED" | "BLACK" | "ODD" | "EVEN" | "FIRST_HALF" | "SECOND_HALF" | "FIRST_THIRD" | "SECOND_THIRD" | "THIRD_THIRD" | "FIRST_COL" | "SECOND_COL" | "THIRD_COL"',
          '<roulette-number> ::= <integer>',
          '; semantic constraint: 1 <= value <= 36',
        ],
        examples: ['RED', 'BLACK', '17', '0', '00', 'RED,BLACK', 'FIRST_THIRD', 'ODD'],
      },
    },
    /**
     * Bet type mappings: user input → on-chain bet type value
     *
     * The contract uses numeric bet types:
     * - 1 = Zero (0)
     * - 2-37 = Numbers 1-36
     * - 38 = Double Zero (00)
     * - 39-50 = Outside bets (thirds, columns, colors, etc.)
     */
    betTypes: {
      '0': 1,                // Zero
      '00': 38,              // Double Zero (American roulette)
      // Numbers 1-36 map to 2-37 (handled dynamically in encoder)
      'FIRST_THIRD': 39,     // 1-12
      'SECOND_THIRD': 40,    // 13-24
      'THIRD_THIRD': 41,     // 25-36
      'FIRST_COL': 42,       // Column 1 (1,4,7,10,...)
      'FIRST_COLUMN': 42,
      'SECOND_COL': 43,      // Column 2 (2,5,8,11,...)
      'SECOND_COLUMN': 43,
      'THIRD_COL': 44,       // Column 3 (3,6,9,12,...)
      'THIRD_COLUMN': 44,
      'FIRST_HALF': 45,      // 1-18
      'SECOND_HALF': 46,     // 19-36
      'EVEN': 47,
      'ODD': 48,
      'BLACK': 49,
      'RED': 50,
    },
    // Approximate multipliers (with house edge)
    multipliers: {
      number: 36.9,   // Single number (including 0, 00) - true odds would be 38:1
      color: 2.05,    // RED, BLACK
      parity: 2.05,   // ODD, EVEN
      half: 2.05,     // FIRST_HALF, SECOND_HALF
      third: 3.075,   // FIRST_THIRD, SECOND_THIRD, THIRD_THIRD
      column: 3.075,  // FIRST_COL, SECOND_COL, THIRD_COL
    },
    vrf: {
      type: 'static',
    },
  },

  // ===========================================================================
  // JUNGLE PLINKO - Ball-drop game with multiplier buckets
  // ===========================================================================
  {
    key: 'jungle-plinko',
    name: 'Jungle Plinko',
    slug: 'jungle-plinko',
    type: 'plinko',
    description: 'Drop balls through pegs into multiplier buckets. Higher modes = bigger risk & reward.',
    contract: JUNGLE_PLINKO_CONTRACT,
    abiVerified: true,
    aliases: ['jungle'],
    config: {
      mode: {
        min: 0,
        max: 4,
        default: 2,
        description: 'Risk level - higher = more volatile multipliers',
        bnf: [
          '<mode> ::= <integer>',
          '; semantic constraint: 0 <= value <= 4',
        ],
        options: [
          { value: 0, label: 'Safe', desc: 'Tight multiplier range, consistent returns' },
          { value: 1, label: 'Low', desc: 'Slightly wider range, small upside' },
          { value: 2, label: 'Medium', desc: 'Balanced risk/reward (recommended)' },
          { value: 3, label: 'High', desc: 'Wide multiplier swings, big potential' },
          { value: 4, label: 'Extreme', desc: 'Max volatility, moonshot multipliers' },
        ],
      },
      balls: {
        min: 1,
        max: 100,
        default: 50,
        description: 'Number of balls to drop. Wager is split across all balls. More balls = smoother variance.',
        bnf: [
          '<balls> ::= <integer>',
          '; semantic constraint: 1 <= value <= 100',
        ],
      },
    },
    /**
     * VRF fee calculation for Plinko
     *
     * Plinko needs more gas per ball (each ball = additional randomness).
     * Formula: getVRFFee(baseGas + balls * perUnitGas)
     */
    vrf: {
      type: 'plinko',
      baseGas: 289000,    // Base gas for transaction
      perUnitGas: 11000,  // Additional gas per ball
    },
  },

  // ===========================================================================
  // COSMIC PLINKO - Biased-ball plinko with static VRF fee
  // ===========================================================================
  {
    key: 'cosmic-plinko',
    name: 'Cosmic Plinko',
    slug: 'cosmic-plinko',
    type: 'plinko',
    description: 'Drop balls through pegs into asymmetric multiplier buckets. Higher modes = bigger volatility and top-end payouts.',
    contract: COSMIC_PLINKO_CONTRACT,
    abiVerified: true,
    aliases: ['cosmic'],
    config: {
      mode: {
        min: 0,
        max: 2,
        default: 1,
        description: 'Risk level - higher = more volatile multipliers',
        bnf: [
          '<mode> ::= <integer>',
          '; semantic constraint: 0 <= value <= 2',
        ],
        options: [
          { value: 0, label: 'Low', desc: 'Most stable Cosmic board, top payout 50x' },
          { value: 1, label: 'Modest', desc: 'Mid-volatility Cosmic board, top payout 100x' },
          { value: 2, label: 'High', desc: 'Highest volatility Cosmic board, top payout 250x' },
        ],
      },
      balls: {
        min: 1,
        max: 30,
        default: 10,
        description: 'Number of balls to drop. Wager is split across all balls. More balls = smoother variance.',
        bnf: [
          '<balls> ::= <integer>',
          '; semantic constraint: 1 <= value <= 30',
        ],
      },
    },
    vrf: {
      type: 'static',
    },
  },

  // ===========================================================================
  // DINO DOUGH - Dinosaur-themed slot machine
  // ===========================================================================
  {
    key: 'dino-dough',
    name: 'Dino Dough',
    slug: 'dino-dough',
    type: 'slots',
    description: 'Dinosaur-themed slot machine. Spin for matching symbols and multipliers.',
    contract: DINO_DOUGH_CONTRACT,
    aliases: ['dino', 'slots'],
    config: {
      spins: {
        min: 1,
        max: 15,
        default: 10,
        description: 'Number of spins per bet. Wager is split across all spins. More spins = smoother variance.',
        bnf: [
          '<spins> ::= <integer>',
          '; semantic constraint: 1 <= value <= 15',
        ],
      },
    },
    vrf: {
      type: 'slots', // Uses getVRFFee() with no args
    },
  },

  // ===========================================================================
  // BUBBLEGUM HEIST - Candy-themed slot machine
  // ===========================================================================
  {
    key: 'bubblegum-heist',
    name: 'Bubblegum Heist',
    slug: 'bubblegum-heist',
    type: 'slots',
    description: 'Candy-themed slot machine. Spin for sweet multipliers and jackpots.',
    contract: BUBBLEGUM_HEIST_CONTRACT,
    aliases: ['bubblegum', 'heist'],
    config: {
      spins: {
        min: 1,
        max: 15,
        default: 10,
        description: 'Number of spins per bet. Wager is split across all spins. More spins = smoother variance.',
        bnf: [
          '<spins> ::= <integer>',
          '; semantic constraint: 1 <= value <= 15',
        ],
      },
    },
    vrf: {
      type: 'slots',
    },
  },

  // ===========================================================================
  // SPEED KENO - Fast batched keno variant
  // ===========================================================================
  {
    key: 'speed-keno',
    name: 'Speed Keno',
    slug: 'speed-keno',
    type: 'speedkeno',
    description: 'Fast keno with batching! Pick 1-5 numbers from 1-20. Batch up to 20 games. Hit 5/5 for 2000x!',
    contract: SPEED_KENO_CONTRACT,
    aliases: ['sk', 'speedk'],
    config: {
      picks: {
        min: 1,
        max: 5,
        default: 3,
        description: 'How many numbers to pick (1-5). More picks = higher risk/reward.',
        bnf: [
          '<picks> ::= <integer>',
          '; semantic constraint: 1 <= value <= 5',
        ],
      },
      numbers: {
        description: 'Which numbers to bet on (1-20). If not specified, random picks are used.',
        bnf: [
          '<numbers> ::= "random" | <speed-keno-number> ( "," <speed-keno-number> )*',
          '<speed-keno-number> ::= <integer>',
          '; semantic constraint: 1 <= value <= 20',
        ],
        examples: ['1,7,13', '5,10,15,18,20', 'random'],
      },
      games: {
        min: 1,
        max: 20,
        default: 5,
        description: 'Number of games to batch (1-20). Wager is split across all games.',
        bnf: [
          '<games> ::= <integer>',
          '; semantic constraint: 1 <= value <= 20',
        ],
      },
    },
    // Perfect match multipliers
    multipliers: {
      '5/5': 2000,
      '4/4': 100,
      '3/3': 20,
      '2/2': 4,
      '1/1': 2,
    },
    /**
     * VRF fee calculation for Speed Keno
     *
     * More games = more randomness needed
     * Formula: getVRFFee(baseGas + games * perUnitGas)
     */
    vrf: {
      type: 'speedkeno',
      baseGas: 325000,
      perUnitGas: 55000,
    },
  },

  // ===========================================================================
  // MONKEY MATCH - Poker hands from barrels
  // ===========================================================================
  {
    key: 'monkey-match',
    name: 'Monkey Match',
    slug: 'monkey-match',
    type: 'monkeymatch',
    description: 'Monkeys pop from 5 barrels — form poker hands! Five of a Kind = 50x. Low Risk has 6 monkeys, Normal has 7.',
    contract: MONKEY_MATCH_CONTRACT,
    aliases: ['monkey', 'mm'],
    config: {
      mode: {
        min: 1,
        max: 2,
        default: 1,
        description: 'Risk level. 1=Low Risk (6 monkeys, easier matches), 2=Normal Risk (7 monkeys, better mid payouts).',
        bnf: [
          '<mode> ::= <integer>',
          '; semantic constraint: value ∈ {1, 2}',
        ],
        options: [
          { value: 1, label: 'Low Risk', desc: '6 monkey types — easier to match' },
          { value: 2, label: 'Normal Risk', desc: '7 monkey types — better mid-tier payouts' },
        ],
      },
    },
    vrf: {
      type: 'static',
    },
  },

  // ===========================================================================
  // BEAR-A-DICE - Avoid unlucky dice rolls
  // ===========================================================================
  {
    key: 'bear-dice',
    name: 'Bear-A-Dice',
    slug: 'bear-dice',
    type: 'beardice',
    description: 'Roll 2 dice up to 5 times. Avoid unlucky numbers! Easy mode: dodge 7s. Higher modes = more danger.',
    contract: BEAR_DICE_CONTRACT,
    aliases: ['bear', 'dice', 'bd'],
    config: {
      difficulty: {
        min: 0,
        max: 4,
        default: 0,
        description: 'Difficulty level. Higher = more losing numbers. Stick to 0 for auto-play!',
        bnf: [
          '<difficulty> ::= <integer>',
          '; semantic constraint: 0 <= value <= 4',
        ],
        options: [
          { value: 0, label: 'Easy', desc: 'Lose on 7 — safest mode' },
          { value: 1, label: 'Normal', desc: 'Lose on 6,7,8 — risky' },
          { value: 2, label: 'Hard', desc: 'Lose on 5,6,7,8,9 — very risky!' },
          { value: 3, label: 'Extreme', desc: 'Lose on 4,5,6,7,8,9,10 — brutal' },
          { value: 4, label: 'Master', desc: 'Lose on 3-11 — only 2 or 12 wins!' },
        ],
      },
      rolls: {
        min: 1,
        max: 5,
        default: 1,
        description: 'Number of dice rolls (1-5). More rolls = higher payout but more chances to lose.',
        bnf: [
          '<rolls> ::= <integer>',
          '; semantic constraint: 1 <= value <= 5',
          '; additional contract constraint: if difficulty >= 3 then rolls <= 3',
        ],
      },
    },
    /**
     * VRF fee calculation for Bear-A-Dice
     *
     * More rolls = more randomness
     */
    vrf: {
      type: 'beardice',
      baseGas: 500000,
      perUnitGas: 100000,
    },
  },

  // ===========================================================================
  // PRIMES - Prime-or-zero number game
  // ===========================================================================
  {
    key: 'primes',
    name: 'Primes',
    slug: 'primes',
    type: 'primes',
    description: 'Roll 1-4 digits with leading zeros. Prime numbers pay the base multiplier; zero is the fixed top-payout case.',
    contract: PRIMES_CONTRACT,
    abiVerified: true,
    aliases: ['prime'],
    config: {
      difficulty: {
        min: 0,
        max: 3,
        default: 0,
        description: 'Difficulty level. Higher modes expand the number space, lower the hit rate, and raise the fixed zero payout.',
        bnf: [
          '<difficulty> ::= <integer>',
          '; semantic constraint: 0 <= value <= 3',
        ],
        options: [
          { value: 0, label: 'Easy', desc: '1 digit, 50% total hit rate, zero pays 2.2x' },
          { value: 1, label: 'Medium', desc: '2 digits, 26% total hit rate, zero pays 10.5x' },
          { value: 2, label: 'Hard', desc: '3 digits, 16.9% total hit rate, zero pays 56x' },
          { value: 3, label: 'Extreme', desc: '4 digits, 12.3% total hit rate, zero pays 500x' },
        ],
      },
      runs: {
        min: 1,
        max: 20,
        default: 10,
        description: 'Number of runs to batch. The wager is split evenly across all runs.',
        bnf: [
          '<runs> ::= <integer>',
          '; semantic constraint: 1 <= value <= 20',
        ],
      },
    },
    vrf: {
      type: 'primes',
      baseGas: 520000,
      perUnitGas: 80000,
    },
  },
];

// ============================================================================
// GAME INDEX (Fast Lookup)
// ============================================================================

export const ABI_VERIFIED_SYMBOL = '✔︎';

const SUPPLEMENTAL_DISPLAY_GAMES = Object.freeze([
  Object.freeze({
    key: 'blackjack',
    name: 'Blackjack',
    contract: BLACKJACK_CONTRACT,
    abiVerified: false,
    aliases: ['bj'],
  }),
  Object.freeze({
    key: 'video-poker',
    name: 'Video Poker',
    contract: VIDEO_POKER_CONTRACT,
    abiVerified: true,
    aliases: ['vp', 'gimboz-poker', 'gimboz poker', 'Video Poker', 'Gimboz Poker'],
  }),
]);

function normalizeGameLookupInput(input) {
  return String(input || '')
    .replace(/\s*✔︎$/, '')
    .trim()
    .toLowerCase();
}

export function stripAbiVerifiedSymbol(name) {
  return String(name || '').replace(/\s*✔︎$/, '').trim();
}

export function formatGameDisplayName(name, abiVerified = false) {
  const baseName = String(name || '').trim();
  if (!baseName) return '';
  if (!abiVerified) {
    return baseName;
  }

  const normalizedBaseName = stripAbiVerifiedSymbol(baseName);
  return `${normalizedBaseName} ${ABI_VERIFIED_SYMBOL}`;
}

export function getGameDisplayName(game) {
  return formatGameDisplayName(game?.name, Boolean(game?.abiVerified));
}

/**
 * Map for O(1) game lookup by key or alias
 *
 * Populated at module load time from GAME_REGISTRY.
 * Maps both primary keys and aliases to game entries.
 *
 * @type {Map<string, Object>}
 */
const GAME_INDEX = new Map();
const GAME_BY_CONTRACT = new Map();
const SUPPLEMENTAL_DISPLAY_GAME_INDEX = new Map();
const SUPPLEMENTAL_DISPLAY_GAME_BY_CONTRACT = new Map();

// Build index from registry
for (const game of GAME_REGISTRY) {
  const displayName = getGameDisplayName(game);

  // Index by primary key
  GAME_INDEX.set(normalizeGameLookupInput(game.key), game);
  GAME_INDEX.set(normalizeGameLookupInput(game.name), game);
  GAME_INDEX.set(normalizeGameLookupInput(displayName), game);
  GAME_BY_CONTRACT.set(String(game.contract).toLowerCase(), game);

  // Index by all aliases
  if (Array.isArray(game.aliases)) {
    for (const alias of game.aliases) {
      GAME_INDEX.set(normalizeGameLookupInput(alias), game);
    }
  }
}

for (const game of SUPPLEMENTAL_DISPLAY_GAMES) {
  SUPPLEMENTAL_DISPLAY_GAME_INDEX.set(normalizeGameLookupInput(game.key), game);
  SUPPLEMENTAL_DISPLAY_GAME_INDEX.set(normalizeGameLookupInput(game.name), game);
  SUPPLEMENTAL_DISPLAY_GAME_BY_CONTRACT.set(String(game.contract).toLowerCase(), game);

  if (Array.isArray(game.aliases)) {
    for (const alias of game.aliases) {
      SUPPLEMENTAL_DISPLAY_GAME_INDEX.set(normalizeGameLookupInput(alias), game);
    }
  }
}

// ============================================================================
// LOOKUP FUNCTIONS
// ============================================================================

/**
 * Resolve a game by key or alias
 *
 * Case-insensitive lookup that works with primary keys and aliases.
 *
 * @param {string|null} input - Game key, alias, or null
 * @returns {Object|null} Game entry object, or null if not found
 *
 * @example
 * resolveGame('jungle')      // Returns jungle-plinko entry
 * resolveGame('cosmic')      // Returns cosmic-plinko entry
 * resolveGame('jungle-plinko') // Returns jungle-plinko entry
 * resolveGame('ROULETTE')    // Returns roulette entry (case-insensitive)
 * resolveGame('invalid')     // Returns null
 */
export function resolveGame(input) {
  if (!input) return null;
  const key = normalizeGameLookupInput(input);
  return GAME_INDEX.get(key) || null;
}

export function resolveGameByContract(contract) {
  if (!contract) return null;
  return GAME_BY_CONTRACT.get(String(contract).toLowerCase()) || null;
}

export function resolveGameDisplayName({ gameKey = null, contract = null, fallbackName = null } = {}) {
  const gameEntry = resolveGame(gameKey) || resolveGameByContract(contract);
  if (gameEntry) {
    return getGameDisplayName(gameEntry);
  }

  const supplementalGame = SUPPLEMENTAL_DISPLAY_GAME_BY_CONTRACT.get(String(contract || '').toLowerCase())
    || SUPPLEMENTAL_DISPLAY_GAME_INDEX.get(normalizeGameLookupInput(gameKey))
    || SUPPLEMENTAL_DISPLAY_GAME_INDEX.get(normalizeGameLookupInput(fallbackName));
  if (supplementalGame) {
    return formatGameDisplayName(supplementalGame.name, Boolean(supplementalGame.abiVerified));
  }

  const normalizedFallback = String(fallbackName || '').trim();
  return normalizedFallback || 'Unknown';
}

/**
 * List all available game keys
 *
 * Returns primary keys only (not aliases).
 * Useful for help text and validation.
 *
 * @returns {string[]} Array of game keys
 *
 * @example
 * listGames()
 * // ['keno', 'ape-strong', 'baccarat', 'roulette', 'jungle-plinko', ...]
 */
export function listGames() {
  return GAME_REGISTRY.map((game) => game.key);
}
