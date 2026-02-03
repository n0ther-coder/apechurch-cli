export const GAME_REGISTRY = [
  {
    key: 'keno',
    name: 'Keno',
    slug: 'keno',
    type: 'keno',
    description: 'Pick 1-10 numbers from 1-40. More picks = riskier but bigger payouts. Hit 10/10 for up to 1,000,000x!',
    contract: '0xc936D6691737afe5240975622f0597fA2d122FAd',
    aliases: ['k'],
    config: {
      picks: {
        min: 1,
        max: 10,
        default: 5,
        description: 'How many numbers to pick (1-10). More picks = higher risk/reward.',
      },
      numbers: {
        description: 'Which numbers to bet on (1-40). If not specified, random picks are used.',
        examples: ['1,7,13,25,40', '5,10,15,20,25,30,35,40', 'random'],
      },
    },
    vrf: {
      type: 'static',
    },
  },
  {
    key: 'ape-strong',
    name: 'ApeStrong',
    slug: 'ape-strong',
    type: 'apestrong',
    description: 'Pick your odds! Choose a range (5-95) — roll under to win. Higher range = more likely to win, lower payout.',
    contract: '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600',
    aliases: ['strong', 'dice', 'limbo'],
    config: {
      range: {
        min: 5,
        max: 95,
        default: 50,
        description: 'Win probability (%). Roll under this number to win. Lower = riskier, bigger payout.',
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
  {
    key: 'baccarat',
    name: 'Baccarat',
    slug: 'baccarat',
    type: 'baccarat',
    description: 'Classic baccarat. Bet on Player (2x), Banker (1.95x), or Tie (9x).',
    contract: '0xB08C669dc0419151bA4e4920E80128802dB5497b',
    aliases: ['bacc'],
    config: {
      bet: {
        description: 'What to bet on: PLAYER, BANKER, TIE. For combined bets, specify amounts explicitly.',
        examples: ['PLAYER', 'BANKER', 'TIE', '140 BANKER 10 TIE', '180 PLAYER 20 TIE'],
      },
    },
    multipliers: {
      player: 2.0,
      banker: 1.95,
      tie: 9.0,
    },
    vrf: {
      type: 'static',
    },
  },
  {
    key: 'roulette',
    name: 'Roulette',
    slug: 'roulette',
    type: 'roulette',
    description: 'Classic roulette with American layout (0, 00, 1-36). Bet on numbers, colors, or sections.',
    contract: '0x1f48A104C1808eb4107f3999999D36aeafEC56d5',
    aliases: ['rl'],
    config: {
      bet: {
        description: 'What to bet on. Numbers (0-36, 00), colors (RED, BLACK), parity (ODD, EVEN), sections, etc.',
        examples: ['RED', 'BLACK', '17', '0', '00', 'RED,BLACK', 'FIRST_THIRD', 'ODD'],
      },
    },
    // Bet type mappings (user input → on-chain value)
    betTypes: {
      '0': 1,           // Zero
      '00': 38,         // Double Zero
      // Numbers 1-36 map to 2-37 (handled dynamically)
      'FIRST_THIRD': 39,
      'SECOND_THIRD': 40,
      'THIRD_THIRD': 41,
      'FIRST_COL': 42,
      'FIRST_COLUMN': 42,
      'SECOND_COL': 43,
      'SECOND_COLUMN': 43,
      'THIRD_COL': 44,
      'THIRD_COLUMN': 44,
      'FIRST_HALF': 45,
      'SECOND_HALF': 46,
      'EVEN': 47,
      'ODD': 48,
      'BLACK': 49,
      'RED': 50,
    },
    multipliers: {
      number: 36.9,      // Single number (including 0, 00)
      color: 2.05,       // RED, BLACK
      parity: 2.05,      // ODD, EVEN
      half: 2.05,        // FIRST_HALF, SECOND_HALF
      third: 3.075,      // FIRST_THIRD, SECOND_THIRD, THIRD_THIRD
      column: 3.075,     // FIRST_COL, SECOND_COL, THIRD_COL
    },
    vrf: {
      type: 'static',    // Uses getVRFFee() with no args
    },
  },
  {
    key: 'jungle-plinko',
    name: 'Jungle Plinko',
    slug: 'jungle-plinko',
    type: 'plinko',
    description: 'Drop balls through pegs into multiplier buckets. Higher modes = bigger risk & reward.',
    contract: '0x88683B2F9E765E5b1eC2745178354C70A03531Ce',
    aliases: ['plinko'],
    config: {
      mode: { 
        min: 0, 
        max: 4, 
        default: 2,
        description: 'Risk level - higher = more volatile multipliers',
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
      },
    },
    vrf: {
      type: 'plinko',
      baseGas: 289000,
      perUnitGas: 11000,
    },
  },
  {
    key: 'dino-dough',
    name: 'Dino Dough',
    slug: 'dino-dough',
    type: 'slots',
    description: 'Dinosaur-themed slot machine. Spin for matching symbols and multipliers.',
    contract: '0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB',
    aliases: ['dino', 'slots'],
    config: {
      spins: { 
        min: 1, 
        max: 15, 
        default: 10,
        description: 'Number of spins per bet. Wager is split across all spins. More spins = smoother variance.',
      },
    },
    vrf: {
      type: 'slots',
    },
  },
  {
    key: 'bubblegum-heist',
    name: 'Bubblegum Heist',
    slug: 'bubblegum-heist',
    type: 'slots',
    description: 'Candy-themed slot machine. Spin for sweet multipliers and jackpots.',
    contract: '0xB5Da735118e848130B92994Ee16377dB2AE31a4c',
    aliases: ['bubblegum', 'heist'],
    config: {
      spins: { 
        min: 1, 
        max: 15, 
        default: 10,
        description: 'Number of spins per bet. Wager is split across all spins. More spins = smoother variance.',
      },
    },
    vrf: {
      type: 'slots',
    },
  },
];

const GAME_INDEX = new Map();

for (const game of GAME_REGISTRY) {
  GAME_INDEX.set(game.key, game);
  if (Array.isArray(game.aliases)) {
    for (const alias of game.aliases) {
      GAME_INDEX.set(alias, game);
    }
  }
}

export function resolveGame(input) {
  if (!input) return null;
  const key = String(input).toLowerCase();
  return GAME_INDEX.get(key) || null;
}

export function listGames() {
  return GAME_REGISTRY.map((game) => game.key);
}
