export const GAME_REGISTRY = [
  {
    key: 'jungle-plinko',
    name: 'Jungle Plinko',
    slug: 'jungle-plinko',
    type: 'plinko',
    contract: '0x88683B2F9E765E5b1eC2745178354C70A03531Ce',
    aliases: ['plinko'],
    config: {
      mode: { min: 0, max: 4, default: 0 },
      balls: { min: 1, max: 100, default: 50 },
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
    contract: '0x9ebb4Df257B971582BAf096b62CA41DE7723F3CB',
    aliases: ['dino'],
    config: {
      spins: { min: 1, max: 15, default: 10 },
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
    contract: '0xB5Da735118e848130B92994Ee16377dB2AE31a4c',
    aliases: ['bubblegum'],
    config: {
      spins: { min: 1, max: 15, default: 10 },
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
