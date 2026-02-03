export const GAME_REGISTRY = [
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
