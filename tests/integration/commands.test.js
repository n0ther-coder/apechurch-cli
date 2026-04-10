/**
 * Integration Tests: CLI Commands
 * 
 * Tests CLI commands that don't modify state significantly.
 * Safe to run anytime.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const NO_WALLET_HOME = path.join(__dirname, '../tmp-no-wallet-home');
const HISTORY_FIXTURE_HOME = path.join(__dirname, '../tmp-history-home');
const HISTORY_FIXTURE_WALLET = '0x1111111111111111111111111111111111111111';

function setupNoWalletHome() {
  fs.rmSync(NO_WALLET_HOME, { recursive: true, force: true });
  fs.mkdirSync(NO_WALLET_HOME, { recursive: true });
}

function setupHistoryFixtureHome() {
  const apechurchDir = path.join(HISTORY_FIXTURE_HOME, '.apechurch-cli');
  const historyDir = path.join(apechurchDir, 'history');
  const gamesDir = path.join(apechurchDir, 'games');
  fs.rmSync(HISTORY_FIXTURE_HOME, { recursive: true, force: true });
  fs.mkdirSync(historyDir, { recursive: true });
  fs.mkdirSync(gamesDir, { recursive: true });

  fs.writeFileSync(
    path.join(apechurchDir, 'wallet.json'),
    JSON.stringify({ address: HISTORY_FIXTURE_WALLET }, null, 2)
  );
  fs.writeFileSync(
    path.join(gamesDir, `${HISTORY_FIXTURE_WALLET.toLowerCase()}_games.json`),
    JSON.stringify({ 'video-poker': ['11', '12'] }, null, 2)
  );
  fs.writeFileSync(
    path.join(historyDir, `${HISTORY_FIXTURE_WALLET.toLowerCase()}_history.json`),
    JSON.stringify({
      version: 1,
      wallet: HISTORY_FIXTURE_WALLET.toLowerCase(),
      chain_id: 33139,
      last_synced_block: 1,
      last_download_on: '2026-04-02T00:00:00.000Z',
      games: [
        {
          contract: '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600',
          gameId: '1',
          timestamp: 1710000000,
          game: 'ApeStrong',
          game_key: 'ape-strong',
          wager_wei: '5000000000000000000',
          payout_wei: '0',
          contract_fee_wei: '100000000000000000',
          gas_fee_wei: '10000000000000000',
          settled: true,
          gp_received_raw: '5',
          wape_received_wei: '5000000000000000000',
          last_sync_on: '2026-04-02T00:00:00.000Z',
          chain_timestamp: 1710000000,
        },
        {
          contract: '0x1f48A104C1808eb4107f3999999D36aeafEC56d5',
          gameId: '2',
          timestamp: 1710000100,
          game: 'Roulette',
          game_key: 'roulette',
          wager_wei: '2000000000000000000',
          payout_wei: '4000000000000000000',
          contract_fee_wei: '0',
          gas_fee_wei: '10000000000000000',
          settled: true,
          gp_received_raw: '2',
          wape_received_wei: '2000000000000000000',
          last_sync_on: '2026-04-02T00:00:00.000Z',
          chain_timestamp: 1710000100,
        },
      ],
    }, null, 2)
  );
}

function stripVersionBanner(output) {
  return String(output || '').replace(/^apechurch-cli v[^\n]*\n+/, '');
}

/**
 * Run CLI command and return output
 */
function cli(args, options = {}) {
  const env = {
    ...process.env,
    HOME: NO_WALLET_HOME,
    ...(options.env || {}),
  };
  const execOptions = {
    ...options,
    env,
  };

  try {
    const result = execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      encoding: 'utf8',
      timeout: options.timeout || 30000,
      ...execOptions,
    });
    return { stdout: stripVersionBanner(result), stderr: '', code: 0 };
  } catch (error) {
    return {
      stdout: stripVersionBanner(error.stdout || ''),
      stderr: stripVersionBanner(error.stderr || ''),
      code: error.status || 1,
    };
  }
}

setupNoWalletHome();

describe('CLI Commands Integration Tests', () => {

  describe('version and help', () => {
    it('--version shows version number', () => {
      const { stdout } = cli('--version');
      assert.ok(/\d+\.\d+\.\d+/.test(stdout), 'Should show semver version');
    });

    it('--help shows usage', () => {
      const { stdout } = cli('--help');
      assert.ok(stdout.includes('Usage'), 'Should show usage');
      assert.ok(stdout.includes('Commands'), 'Should list commands');
    });

    it('play --help includes BNF grammar for structured arguments', () => {
      const { stdout } = cli('play --help');
      assert.ok(stdout.includes('Grammar (BNF)'), 'Should show a BNF appendix');
      assert.ok(stdout.includes('<points> ::= <number>'), 'Should document GP rate grammar');
      assert.ok(stdout.includes('--auto'), 'Should document explicit automatic random play');
      assert.ok(stdout.includes('<keno-numbers> ::= "random" | <keno-number> ( "," <keno-number> )*'), 'Should document Keno numbers grammar');
      assert.ok(stdout.includes('<runs> ::= <integer>'), 'Should document Primes run grammar');
      assert.ok(stdout.includes('<rolls> ::= <integer>                              ; 1 <= value <= 5'), 'Should document the verified 1-5 Bear-A-Dice roll range');
      assert.ok(!stdout.includes('<= 3 when difficulty >= 3'), 'Should not mention the removed fake Bear-A-Dice 3-roll cap');
      assert.ok(stdout.includes('--numbers 1,7,13,25,40'), 'Should document the single-token numbers form');
    });

    it('bare play now shows help instead of auto-running', () => {
      const { stdout } = cli('play');
      assert.ok(stdout.includes('Usage: apechurch-cli play'), 'Should show command help');
      assert.ok(stdout.includes('--auto'), 'Should point to the explicit auto option');
    });

    it('profile help documents set values and GP rate flags clearly', () => {
      const { stdout } = cli('profile --help');
      assert.ok(stdout.includes('profile'), 'Should still document the profile command');
      assert.ok(stdout.includes('profile set [options]'), 'Should document the set action');
      assert.ok(stdout.includes('--username <name>'), 'Should document username changes');
      assert.ok(stdout.includes('--persona <name>'), 'Should document persona values');
      assert.ok(stdout.includes('--card-display <mode>'), 'Should document card display values');
      assert.ok(stdout.includes('--gp-ape <points>'), 'Should document the wallet GP override');
      assert.ok(stdout.includes('--no-gp-ape'), 'Should document resetting to the base default');
    });

    it('profile without set rejects mutating flags', () => {
      const { stdout, code } = cli('profile --username smith');
      assert.notStrictEqual(code, 0, 'Should reject mutating flags without set');
      assert.ok(stdout.includes('profile set'), 'Should direct the user to the set action');
    });

    it('bare profile defaults to show', () => {
      const { stdout } = cli('profile');
      assert.ok(
        stdout.includes('Profile') || stdout.includes('Persona') || stdout.includes('Username'),
        'Should show the profile when no action is provided'
      );
    });

    it('commands points to the canonical reference and GP rate controls', () => {
      const { stdout } = cli('commands');
      assert.ok(stdout.includes('play') || stdout.includes('PLAY'), 'Should mention play command');
      assert.ok(stdout.includes('docs/COMMAND_REFERENCE.md'), 'Should point to the canonical command reference');
      assert.ok(stdout.includes('--gp-ape <points>'), 'Should mention GP rate overrides');
    });

    it('commands does not advertise wAPE transfers', () => {
      const { stdout } = cli('commands');
      assert.ok(!stdout.includes('send wAPE') && !stdout.includes('send WAPE'), 'Should not list wAPE as transferable');
    });

    it('blackjack --help keeps --human hidden and documents generic auto-play', () => {
      const { stdout } = cli('blackjack --help');
      assert.ok(stdout.includes('--auto [mode]'), 'Should still show auto option');
      assert.ok(stdout.includes('--side <ape>'), 'Should show player side bet option');
      assert.ok(stdout.includes('Auto-play the hand'), 'Should use generic auto-play description');
      assert.ok(!stdout.includes('--human'), 'Should hide --human from standard help');
    });

    it('video-poker --help keeps --human hidden and documents generic auto-play', () => {
      const { stdout } = cli('video-poker --help');
      assert.ok(stdout.includes('--auto [mode]'), 'Should still show auto option');
      assert.ok(stdout.includes('Auto-play the hand'), 'Should use generic auto-play description');
      assert.ok(!stdout.includes('--human'), 'Should hide --human from standard help');
    });

    it('help auto still shows advanced examples', () => {
      const { stdout } = cli('help auto');
      assert.ok(stdout.includes('--auto best'), 'Should keep best-mode examples in helper text');
      assert.ok(stdout.includes('--human'), 'Should keep humanized pacing example in helper text');
    });

    it('help loop documents startup game estimates where RTP is known', () => {
      const { stdout } = cli('help loop');
      assert.ok(stdout.includes('Estimate games before wallet squandering'), 'Should document wallet squandering estimate');
      assert.ok(stdout.includes('Estimate games before stop-loss'), 'Should document stop-loss estimate');
      assert.ok(stdout.includes('Proceed? (Y/n)'), 'Should document the confirmation prompt');
    });
  });

  describe('status command', () => {
    it('returns status information or a structured missing-wallet error', () => {
      const { stdout } = cli('status');
      assert.ok(
        stdout.includes('Address') || stdout.includes('address') || stdout.includes('No wallet found'),
        'Should show address data or an explicit missing-wallet message'
      );
    });

    it('--json returns valid JSON', () => {
      const { stdout } = cli('status --json');
      const data = JSON.parse(stdout);
      assert.ok(typeof data === 'object' && data !== null, 'Should return a JSON object');
      if ('error' in data) {
        assert.ok(String(data.error).includes('No wallet found'), 'Error should explain missing wallet');
      } else {
        assert.ok('address' in data, 'JSON should have address');
        assert.ok('balance' in data, 'JSON should have balance');
        assert.ok('can_play' in data, 'JSON should have can_play');
        assert.ok('username' in data, 'JSON should have username');
      }
    });

    it('address is valid Ethereum format when present', () => {
      const { stdout } = cli('status --json');
      const data = JSON.parse(stdout);
      if ('address' in data) {
        assert.ok(/^0x[a-fA-F0-9]{40}$/.test(data.address), 'Address should be valid');
      } else {
        assert.ok('error' in data, 'Missing-wallet response should expose an error');
      }
    });
  });

  describe('games command', () => {
    it('lists available games', () => {
      const { stdout } = cli('games');
      assert.ok(stdout.includes('Simple Games:'), 'Should separate simple games');
      assert.ok(stdout.includes('Stateful Games:'), 'Should separate stateful games');
      assert.ok(stdout.includes('ApeStrong ✔︎'), 'Should list verified ApeStrong');
      assert.ok(stdout.includes('Roulette ✔︎'), 'Should list verified Roulette');
      assert.ok(stdout.includes('Baccarat ✔︎'), 'Should list verified Baccarat');
      assert.ok(stdout.includes('Blackjack ✔︎'), 'Should list verified Blackjack');
      assert.ok(stdout.includes('Jungle Plinko ✔︎'), 'Should list verified Jungle Plinko');
      assert.ok(stdout.includes('Cosmic Plinko ✔︎'), 'Should list verified Cosmic Plinko');
      assert.ok(stdout.includes('Keno ✔︎'), 'Should list verified Keno');
      assert.ok(stdout.includes('Speed Keno ✔︎'), 'Should list verified Speed Keno');
      assert.ok(stdout.includes('Dino Dough ✔︎'), 'Should list verified Dino Dough');
      assert.ok(stdout.includes('Bubblegum Heist ✔︎'), 'Should list verified Bubblegum Heist');
      assert.ok(stdout.includes('Bear-A-Dice ✔︎'), 'Should list verified Bear-A-Dice');
      assert.ok(stdout.includes('Blocks ✔︎'), 'Should list verified Blocks');
      assert.ok(stdout.includes('Primes ✔︎'), 'Should list verified Primes');
      const simpleOrder = [
        'ApeStrong ✔︎',
        'Baccarat ✔︎',
        'Bear-A-Dice ✔︎',
        'Blocks ✔︎',
        'Bubblegum Heist ✔︎',
        'Cosmic Plinko ✔︎',
        'Dino Dough ✔︎',
        'Jungle Plinko ✔︎',
        'Keno ✔︎',
        'Monkey Match ✔︎',
        'Primes ✔︎',
        'Roulette ✔︎',
        'Speed Keno ✔︎',
      ];
      let lastIndex = stdout.indexOf('Simple Games:');
      for (const title of simpleOrder) {
        const currentIndex = stdout.indexOf(title);
        assert.ok(currentIndex > lastIndex, `${title} should appear in alphabetical order within simple games`);
        lastIndex = currentIndex;
      }

      const statefulHeaderIndex = stdout.indexOf('Stateful Games:');
      const blackjackIndex = stdout.indexOf('Blackjack ✔︎');
      const videoPokerIndex = stdout.indexOf('Video Poker ✔︎');
      assert.ok(blackjackIndex > statefulHeaderIndex, 'Blackjack should appear in the stateful section');
      assert.ok(videoPokerIndex > blackjackIndex, 'Stateful games should be ordered alphabetically');
    });

    it('--stats appends the full Game Stats catalog', () => {
      const { stdout } = cli('games --stats');
      assert.ok(stdout.includes('Available Games'), 'Should keep the game summary');
      assert.ok(stdout.includes('Game Stats'), 'Should append the Game Stats section');
      assert.ok(stdout.includes('| game'), 'Should render a stats table header');
      assert.ok(stdout.includes('max payout (x)'), 'Should render the max payout column');
      assert.ok(stdout.includes('max hit (x)'), 'Should render the max hit column');
      assert.ok(stdout.includes('Keno'), 'Should include supported games in the stats table');
      assert.ok(stdout.includes('Picks 1'), 'Should include unplayed exact modes in the catalog');
      assert.ok(stdout.includes('1,000,000x'), 'Should include known top payouts for exact modes');
      assert.ok(stdout.includes('Bet 1/5/10/25/50 APE'), 'Should group non-jackpot video poker bet tiers');
      assert.ok(stdout.includes('250x + 💰'), 'Should mark jackpot-aware max payouts');
      assert.ok(stdout.includes('Legend:'), 'Should explain the RTP badges');
      assert.ok(stdout.includes('📄 documented'), 'Should explain documented RTP values');
      assert.ok(stdout.includes('👌 exact formula'), 'Should explain exact-formula RTP values');
    });

    it('--json returns array of games', () => {
      const { stdout } = cli('games --json');
      const data = JSON.parse(stdout);
      
      assert.ok('games' in data, 'Should have games array');
      assert.ok(Array.isArray(data.games), 'Games should be array');
      assert.ok(data.games.length > 0, 'Should have at least one game');
      
      // Check game structure
      const game = data.games[0];
      assert.ok('key' in game, 'Game should have key');
      assert.ok('name' in game, 'Game should have name');
      assert.ok('type' in game, 'Game should have type');
      assert.deepStrictEqual(
        data.games.map((entry) => entry.key),
        [
          'ape-strong',
          'baccarat',
          'bear-dice',
          'blackjack',
          'blocks',
          'bubblegum-heist',
          'cosmic-plinko',
          'dino-dough',
          'jungle-plinko',
          'keno',
          'monkey-match',
          'primes',
          'roulette',
          'speed-keno',
          'video-poker',
        ],
        'Games JSON should be ordered alphabetically by game title'
      );
    });

    it('--json --stats includes the Game Stats catalog', () => {
      const { stdout } = cli('games --json --stats');
      const data = JSON.parse(stdout);

      assert.ok(Array.isArray(data.game_stats), 'Should include game_stats when requested');
      assert.ok(data.game_stats.length > 0, 'Game stats catalog should not be empty');
    });
  });

  describe('game <name> command', () => {
    it('shows details for valid game', () => {
      const { stdout } = cli('game ape-strong');
      assert.ok(stdout.includes('ApeStrong') || stdout.includes('ape-strong'), 'Should show game name');
    });

    it('shows alphabetized available games when the name is invalid', () => {
      const { stdout } = cli('game nope');
      assert.ok(stdout.includes('Simple: ape-strong | baccarat | bear-dice | blocks | bubblegum-heist | cosmic-plinko | dino-dough | jungle-plinko | keno | monkey-match | primes | roulette | speed-keno'));
      assert.ok(stdout.includes('Stateful: blackjack | video-poker'));
    });

    it('returns the full alphabetized available catalog in JSON when the name is invalid', () => {
      const { stdout } = cli('game nope --json');
      const data = JSON.parse(stdout);

      assert.deepStrictEqual(data.available, [
        'ape-strong',
        'baccarat',
        'bear-dice',
        'blackjack',
        'blocks',
        'bubblegum-heist',
        'cosmic-plinko',
        'dino-dough',
        'jungle-plinko',
        'keno',
        'monkey-match',
        'primes',
        'roulette',
        'speed-keno',
        'video-poker',
      ]);
    });

    it('warns that Bear-A-Dice is all-or-nothing', () => {
      const { stdout, code } = cli('game bear-dice');
      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('All-or-nothing'), 'Should describe Bear-A-Dice as all-or-nothing');
      assert.ok(stdout.includes('zeroes the payout'), 'Should explain that the first losing sum zeroes the payout');
    });

    it('resolves the new plinko aliases', () => {
      const jungle = cli('game jungle').stdout;
      const cosmic = cli('game cosmic').stdout;

      assert.ok(jungle.includes('Jungle Plinko ✔︎') || jungle.includes('jungle-plinko'), 'Should resolve jungle alias');
      assert.ok(cosmic.includes('Cosmic Plinko ✔︎') || cosmic.includes('cosmic-plinko'), 'Should resolve cosmic alias');
    });

    it('exposes ABI verification metadata in JSON for verified games', () => {
      const { stdout } = cli('game cosmic --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Cosmic Plinko ✔︎');
    });

    it('exposes ABI verification metadata for verified ApeStrong', () => {
      const { stdout } = cli('game ape-strong --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'ApeStrong ✔︎');
    });

    it('exposes ABI verification metadata for verified Primes', () => {
      const { stdout } = cli('game primes --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Primes ✔︎');
    });

    it('exposes ABI verification metadata for verified Blocks', () => {
      const { stdout } = cli('game blocks --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Blocks ✔︎');
    });

    it('exposes ABI verification metadata for verified Monkey Match', () => {
      const { stdout } = cli('game monkey-match --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Monkey Match ✔︎');
    });

    it('exposes ABI verification metadata for verified Keno', () => {
      const { stdout } = cli('game keno --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Keno ✔︎');
    });

    it('exposes ABI verification metadata for verified Speed Keno', () => {
      const { stdout } = cli('game speed-keno --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Speed Keno ✔︎');
    });

    it('exposes ABI verification metadata for verified Dino Dough', () => {
      const { stdout } = cli('game dino-dough --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Dino Dough ✔︎');
    });

    it('exposes ABI verification metadata for verified Bubblegum Heist', () => {
      const { stdout } = cli('game bubblegum-heist --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Bubblegum Heist ✔︎');
    });

    it('exposes ABI verification metadata for verified stateful video poker', () => {
      const { stdout } = cli('game video-poker --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Video Poker ✔︎');
    });

    it('exposes ABI verification metadata for verified Roulette', () => {
      const { stdout } = cli('game roulette --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Roulette ✔︎');
    });

    it('exposes ABI verification metadata for verified Baccarat', () => {
      const { stdout } = cli('game baccarat --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Baccarat ✔︎');
    });

    it('exposes ABI verification metadata for verified Blackjack', () => {
      const { stdout } = cli('game blackjack --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Blackjack ✔︎');
    });

    it('exposes ABI verification metadata for verified Bear-A-Dice', () => {
      const { stdout } = cli('game bear-dice --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Bear-A-Dice ✔︎');
    });

    it('shows per-parameter BNF in game helpers', () => {
      const { stdout } = cli('game keno');
      assert.ok(stdout.includes('BNF:'), 'Should show BNF in the parameter section');
      assert.ok(stdout.includes('<numbers> ::= "random" | <keno-number> ( "," <keno-number> )*'), 'Should show numbers grammar');
    });

    it('shows error for invalid game', () => {
      const { stdout, stderr, code } = cli('game nonexistent');
      const output = stdout + stderr;
      assert.ok(output.includes('not found') || output.includes('Unknown') || code !== 0, 
        'Should error for invalid game');
    });

    it('--json returns game details', () => {
      const { stdout } = cli('game roulette --json');
      const data = JSON.parse(stdout);
      
      assert.ok('name' in data || 'key' in data, 'Should have game info');
    });
  });

  describe('history command', () => {
    it('shows game history', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      // May be empty or have games
      assert.ok(
        stdout.includes('Recent') || stdout.includes('history') || stdout.includes('No games'),
        'Should show history or empty message'
      );
    });

    it('--json returns games array', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --json', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const data = JSON.parse(stdout);
      
      assert.ok('games' in data, 'Should have games key');
      assert.ok(Array.isArray(data.games), 'Games should be array');
      assert.strictEqual(data.games[0].gp_received_display, '2');
      assert.strictEqual(data.games[1].gp_received_display, '5');
    });

    it('--limit works', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --json --limit 5', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const data = JSON.parse(stdout);
      
      assert.ok(data.games.length <= 5, 'Should respect limit');
    });

    it('--all is accepted', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --json --all', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const data = JSON.parse(stdout);

      assert.ok('games' in data, 'Should have games key');
      assert.ok(Array.isArray(data.games), 'Games should be array');
    });

    it('--json --breakdown <game> filters the breakdown to one game family', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --json --breakdown ape-strong', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const data = JSON.parse(stdout);

      assert.ok(Array.isArray(data.breakdown), 'Should include a breakdown array');
      assert.strictEqual(data.breakdown.length, 1, 'Should keep only one breakdown row');
      assert.strictEqual(data.breakdown[0].game_key, 'ape-strong');
      assert.strictEqual(data.breakdown_filter.game_key, 'ape-strong');
    });

    it('shows GP earned in the human-readable history output', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes('🧮 5 GP'));
      assert.ok(stdout.includes('🧮 2 GP'));
    });

    it('shows unfinished games after recent games with resume and clear hints', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      const recentIndex = stdout.indexOf('Recent Games');
      const unfinishedIndex = stdout.indexOf('Unfinished Games');
      const statsIndex = stdout.indexOf('History Stats');

      assert.ok(recentIndex >= 0, 'Should render the Recent Games section');
      assert.ok(unfinishedIndex > recentIndex, 'Should render Unfinished Games after Recent Games');
      assert.ok(statsIndex > unfinishedIndex, 'Should render History Stats after Unfinished Games');
      assert.ok(
        stdout.includes('To resume queue: $ apechurch-cli video-poker resume [--game <id>][--auto [best] | --solver]'),
        'Should show the BNF-style video poker resume hint'
      );
      assert.ok(
        stdout.includes('To clear queue: $ apechurch-cli video-poker clear'),
        'Should show the clear-queue hint'
      );
    });

    it('--help documents --all', () => {
      const { stdout } = cli('history --help');
      assert.ok(stdout.includes('--list'), 'Should expose --list in help');
      assert.ok(stdout.includes('--all'), 'Should expose --all in help');
      assert.ok(stdout.includes('--breakdown [game]'), 'Should expose the optional breakdown game filter in help');
    });

    it('history --list shows locally cached history addresses', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --list', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      assert.ok(stdout.includes(HISTORY_FIXTURE_WALLET.toLowerCase()), 'Should list cached history wallets');
    });
  });

  describe('send command', () => {
    const validAddress = '0x1111111111111111111111111111111111111111';

    it('rejects unsupported assets before wallet lookup', () => {
      const { stdout, stderr, code } = cli(`send BTC 1 ${validAddress}`, {
        env: { ...process.env, HOME: NO_WALLET_HOME },
      });
      const output = stdout + stderr;

      assert.ok(code !== 0, 'Should fail for unsupported assets');
      assert.ok(output.includes('Unsupported asset'), 'Should reject unknown assets');
      assert.ok(!output.includes('No wallet found'), 'Should validate asset before requiring a wallet');
    });

    it('returns a contract-specific error for wAPE before wallet lookup', () => {
      const { stdout, stderr, code } = cli(`send wAPE 1 ${validAddress}`, {
        env: { ...process.env, HOME: NO_WALLET_HOME },
      });
      const output = stdout + stderr;

      assert.ok(code !== 0, 'Should fail for non-transferable wAPE');
      assert.ok(
        output.includes('wAPE: contract 0x6EA76F01Aa615112AB7de1409EFBD80a13BfCC84 does not support a transfer() function'),
        'Should explain that the wAPE contract does not support transfer()'
      );
      assert.ok(!output.includes('No wallet found'), 'Should reject wAPE before requiring a wallet');
    });
  });

  describe('house status command', () => {
    it('shows house information', () => {
      const { stdout } = cli('house status');
      assert.ok(
        stdout.includes('House') || stdout.includes('Staked') || stdout.includes('Failed to fetch house stats'),
        'Should show house info or a structured fetch failure'
      );
    });

    it('--json returns house data', () => {
      const { stdout } = cli('house status --json');
      const data = JSON.parse(stdout);

      if ('error' in data) {
        assert.ok(String(data.error).includes('Failed to fetch house stats'), 'Error should explain the fetch failure');
      } else {
        assert.ok('total_staked' in data, 'Should have total_staked');
        assert.ok('max_payout' in data, 'Should have max_payout');
      }
    });
  });

  describe('profile command', () => {
    it('shows profile information', () => {
      const { stdout } = cli('profile show');
      assert.ok(
        stdout.includes('persona') || stdout.includes('Persona') || stdout.includes('username'),
        'Should show profile info'
      );
    });
  });

  describe('error handling', () => {
    it('invalid command shows error', () => {
      const { stdout, stderr, code } = cli('invalidcommand');
      const output = stdout + stderr;
      assert.ok(output.includes('error') || output.includes('unknown') || code !== 0,
        'Should error for invalid command');
    });

    it('play without amount uses strategy default', () => {
      // Note: CLI auto-plays with strategy default bet when amount not specified
      const { stdout, code } = cli('play ape-strong --json', { timeout: 45000 });
      // Should either play successfully or show an error - both are valid
      assert.ok(stdout.length > 0, 'Should produce output');
    });
  });
});
