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
          config: { range: 50 },
          variant_key: 'ape-strong:range:50',
          variant_label: 'Range 50',
          rtp_game: 'ape-strong',
          rtp_config: { range: 50 },
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
          config: { bet: 'RED' },
          variant_key: 'roulette:bet-type:red-black',
          variant_label: 'Red/Black',
          rtp_game: 'roulette',
          rtp_config: { bet: 'RED' },
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
  const optionEnv = options.env || {};
  const env = {
    ...process.env,
    ...optionEnv,
    HOME: optionEnv.HOME || NO_WALLET_HOME,
    FORCE_COLOR: '0',
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
      assert.ok(stdout.includes('scoreboard [address]'), 'Should mention the scoreboard command');
    });

    it('commands does not advertise wAPE transfers', () => {
      const { stdout } = cli('commands');
      assert.ok(!stdout.includes('send wAPE') && !stdout.includes('send WAPE'), 'Should not list wAPE as transferable');
    });

    it('blackjack --help keeps --human hidden and documents generic auto-play', () => {
      const { stdout } = cli('blackjack --help');
      assert.ok(stdout.includes('--auto [mode]'), 'Should still show auto option');
      assert.ok(stdout.includes('--side <ape>'), 'Should show player side bet option');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should show take-profit stop option');
      assert.ok(stdout.includes('--target-x <x>'), 'Should show single-game multiplier stop option');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should show single-game payout stop option');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should show single-game loss stop option');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should show drawdown recovery stop option');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should show profit giveback stop option');
      assert.ok(stdout.includes('Auto-play the hand'), 'Should use generic auto-play description');
      assert.ok(!stdout.includes('--human'), 'Should hide --human from standard help');
    });

    it('video-poker --help keeps --human hidden and documents generic auto-play', () => {
      const { stdout } = cli('video-poker --help');
      assert.ok(stdout.includes('--auto [mode]'), 'Should still show auto option');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should show take-profit stop option');
      assert.ok(stdout.includes('--target-x <x>'), 'Should show single-game multiplier stop option');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should show single-game payout stop option');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should show single-game loss stop option');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should show drawdown recovery stop option');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should show profit giveback stop option');
      assert.ok(stdout.includes('Auto-play the hand'), 'Should use generic auto-play description');
      assert.ok(!stdout.includes('--human'), 'Should hide --human from standard help');
    });

    it('play --help keeps --human hidden and documents loop controls', () => {
      const { stdout } = cli('play --help');
      assert.ok(stdout.includes('--loop'), 'Should still show loop option');
      assert.ok(stdout.includes('--delay <seconds>'), 'Should still show delay option');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should show take-profit stop option');
      assert.ok(stdout.includes('--target-x <x>'), 'Should show single-game multiplier stop option');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should show single-game payout stop option');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should show single-game loss stop option');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should show drawdown recovery stop option');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should show profit giveback stop option');
      assert.ok(!stdout.includes('--human'), 'Should hide --human from standard help');
    });

    it('help auto still shows advanced examples', () => {
      const { stdout } = cli('help auto');
      assert.ok(stdout.includes('--auto best'), 'Should keep best-mode examples in helper text');
      assert.ok(stdout.includes('--human'), 'Should keep humanized pacing example in helper text');
      assert.ok(stdout.includes('play roulette 10 RED --loop --human'), 'Should document humanized pacing for simple games');
    });

    it('help loop documents startup game estimates where RTP is known', () => {
      const { stdout } = cli('help loop');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should document take-profit stop');
      assert.ok(stdout.includes('--target-x <x>'), 'Should document single-game multiplier stop');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should document single-game payout stop');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should document single-game loss stop');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should document drawdown recovery stop');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should document profit giveback stop');
      assert.ok(stdout.includes('Estimate games before wallet squandering'), 'Should document wallet squandering estimate');
      assert.ok(stdout.includes('Estimate games before stop-loss'), 'Should document stop-loss estimate');
      assert.ok(stdout.includes('--human'), 'Should document humanized loop pacing');
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
      assert.ok(stdout.includes('Hi-Lo Nebula ✔︎'), 'Should list verified Hi-Lo Nebula');
      assert.ok(stdout.includes('Jungle Plinko ✔︎'), 'Should list verified Jungle Plinko');
      assert.ok(stdout.includes('Cosmic Plinko ✔︎'), 'Should list verified Cosmic Plinko');
      assert.ok(stdout.includes('Keno ✔︎'), 'Should list verified Keno');
      assert.ok(stdout.includes('Speed Keno ✔︎'), 'Should list verified Speed Keno');
      assert.ok(stdout.includes('Dino Dough ✔︎'), 'Should list verified Dino Dough');
      assert.ok(stdout.includes('Bubblegum Heist ✔︎'), 'Should list verified Bubblegum Heist');
      assert.ok(stdout.includes('Geez Diggerz ✔︎'), 'Should list verified Geez Diggerz');
      assert.ok(stdout.includes('Bear-A-Dice ✔︎'), 'Should list verified Bear-A-Dice');
      assert.ok(stdout.includes('Blocks ✔︎'), 'Should list verified Blocks');
      assert.ok(stdout.includes('Primes ✔︎'), 'Should list verified Primes');
      assert.ok(stdout.includes('Sushi Showdown ✔︎'), 'Should list verified Sushi Showdown');
      const simpleOrder = [
        'ApeStrong ✔︎',
        'Baccarat ✔︎',
        'Bear-A-Dice ✔︎',
        'Blocks ✔︎',
        'Bubblegum Heist ✔︎',
        'Cosmic Plinko ✔︎',
        'Dino Dough ✔︎',
        'Geez Diggerz ✔︎',
        'Jungle Plinko ✔︎',
        'Keno ✔︎',
        'Monkey Match ✔︎',
        'Primes ✔︎',
        'Roulette ✔︎',
        'Speed Keno ✔︎',
        'Sushi Showdown ✔︎',
      ];
      let lastIndex = stdout.indexOf('Simple Games:');
      for (const title of simpleOrder) {
        const currentIndex = stdout.indexOf(title);
        assert.ok(currentIndex > lastIndex, `${title} should appear in alphabetical order within simple games`);
        lastIndex = currentIndex;
      }

      const statefulHeaderIndex = stdout.indexOf('Stateful Games:');
      const blackjackIndex = stdout.indexOf('Blackjack ✔︎');
      const hiLoNebulaIndex = stdout.indexOf('Hi-Lo Nebula ✔︎');
      const videoPokerIndex = stdout.indexOf('Video Poker ✔︎');
      assert.ok(blackjackIndex > statefulHeaderIndex, 'Blackjack should appear in the stateful section');
      assert.ok(hiLoNebulaIndex > blackjackIndex, 'Hi-Lo Nebula should appear after Blackjack');
      assert.ok(videoPokerIndex > hiLoNebulaIndex, 'Stateful games should be ordered alphabetically');
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
      assert.ok(stdout.includes('1,000,000.00x'), 'Should include known top payouts for exact modes with fixed decimals');
      assert.ok(stdout.includes('Bet 1/5/10/25/50 APE'), 'Should group non-jackpot video poker bet tiers');
      assert.ok(stdout.includes('250.00x + 💰'), 'Should mark jackpot-aware max payouts with fixed decimals');
      assert.ok(stdout.includes('Legend:'), 'Should explain the RTP badges');
      assert.ok(stdout.includes('📄 documented'), 'Should explain documented RTP values');
      assert.ok(stdout.includes('👌 exact formula'), 'Should explain exact-formula RTP values');
    });

    it('shows the current alias set in the terminal catalog', () => {
      const { stdout } = cli('games');
      assert.ok(stdout.includes('Aliases: apestrong, strong'));
      assert.ok(stdout.includes('Aliases: bj'));
      assert.ok(stdout.includes('Aliases: hilonebula, hilo'));
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
      assert.ok('aliases' in game, 'Game should have aliases');
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
          'geez-diggerz',
          'gimboz-smash',
          'hi-lo-nebula',
          'jungle-plinko',
          'keno',
          'monkey-match',
          'primes',
          'roulette',
          'speed-keno',
          'sushi-showdown',
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
      assert.ok(stdout.includes('Simple: ape-strong | baccarat | bear-dice | blocks | bubblegum-heist | cosmic-plinko | dino-dough | geez-diggerz | gimboz-smash | jungle-plinko | keno | monkey-match | primes | roulette | speed-keno | sushi-showdown'));
      assert.ok(stdout.includes('Stateful: blackjack | hi-lo-nebula | video-poker'));
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
        'geez-diggerz',
        'gimboz-smash',
        'hi-lo-nebula',
        'jungle-plinko',
        'keno',
        'monkey-match',
        'primes',
        'roulette',
        'speed-keno',
        'sushi-showdown',
        'video-poker',
      ]);
    });

    it('warns that Bear-A-Dice is all-or-nothing', () => {
      const { stdout, code } = cli('game bear-dice');
      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('All-or-nothing'), 'Should describe Bear-A-Dice as all-or-nothing');
      assert.ok(stdout.includes('zeroes the payout'), 'Should explain that the first losing sum zeroes the payout');
    });

    it('accepts the current simple-game aliases in the game helper', () => {
      const jungle = cli('game jungle --json');
      const cosmic = cli('game cosmic --json');

      assert.strictEqual(JSON.parse(jungle.stdout).key, 'jungle-plinko');
      assert.strictEqual(JSON.parse(cosmic.stdout).key, 'cosmic-plinko');
    });

    it('accepts the current simple-game aliases in play mode', () => {
      const smash = cli('play smash 10 --range 1-50');
      const jungle = cli('play jungle 10 0 10');

      assert.notStrictEqual(smash.code, 0);
      assert.notStrictEqual(jungle.code, 0);
      assert.ok(smash.stdout.includes('No wallet found'));
      assert.ok(jungle.stdout.includes('No wallet found'));
    });

    it('rejects removed simple-game aliases', () => {
      const diggerz = cli('game diggerz');
      const speedk = cli('play speedk 10');

      assert.ok(diggerz.stdout.includes('Unknown game'));
      assert.ok(speedk.stdout.includes('Unknown game'));
    });

    it('exposes ABI verification metadata in JSON for verified games', () => {
      const { stdout } = cli('game cosmic-plinko --json');
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

    it('exposes ABI verification metadata for verified Geez Diggerz', () => {
      const { stdout } = cli('game geez-diggerz --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Geez Diggerz ✔︎');
    });

    it('exposes ABI verification metadata for verified Gimboz Smash', () => {
      const { stdout } = cli('game gimboz-smash --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Gimboz Smash ✔︎');
      assert.deepStrictEqual(data.aliases, ['gimbozsmash', 'smash']);
    });

    it('rejects unsupported Gimboz Smash ranges without crashing', () => {
      const { stdout, code } = cli('play gimboz-smash 10 --range 1-96');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('Invalid range: total covered numbers must be between 1 and 95.'));
      assert.ok(!stdout.includes('No wallet found'));
      assert.ok(!stdout.includes('file:///'));
      assert.ok(!stdout.includes('Node.js v'));
    });

    it('rejects conflicting Gimboz Smash range and out-range input without crashing', () => {
      const { stdout, code } = cli('play gimboz-smash 10 --range 1-50 --out-range 45-50');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('Invalid Gimboz Smash config: choose either --range or --out-range, not both.'));
      assert.ok(!stdout.includes('No wallet found'));
      assert.ok(!stdout.includes('file:///'));
      assert.ok(!stdout.includes('Node.js v'));
    });

    it('rejects unsupported Gimboz Smash outside ranges without crashing', () => {
      const { stdout, code } = cli('play gimboz-smash 10 --out-range 50-50');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('Invalid out-range: excluded coverage must be between 5 and 95 numbers'));
      assert.ok(!stdout.includes('No wallet found'));
      assert.ok(!stdout.includes('file:///'));
      assert.ok(!stdout.includes('Node.js v'));
    });

    it('accepts valid Gimboz Smash outside ranges without tripping config conflicts', () => {
      const { stdout, code } = cli('play gimboz-smash 10 --out-range 50-56');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('No wallet found'));
      assert.ok(!stdout.includes('Invalid Gimboz Smash config'));
      assert.ok(!stdout.includes('file:///'));
      assert.ok(!stdout.includes('Node.js v'));
    });

    it('exposes ABI verification metadata for verified Sushi Showdown', () => {
      const { stdout } = cli('game sushi-showdown --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Sushi Showdown ✔︎');
      assert.deepStrictEqual(data.aliases, ['sushishowdown', 'sushi']);
    });

    it('exposes ABI verification metadata for verified stateful video poker', () => {
      const { stdout } = cli('game video-poker --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Video Poker ✔︎');
      assert.deepStrictEqual(data.aliases, ['vp']);
    });

    it('exposes ABI verification metadata for verified Hi-Lo Nebula', () => {
      const { stdout } = cli('game hi-lo-nebula --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Hi-Lo Nebula ✔︎');
      assert.deepStrictEqual(data.aliases, ['hilonebula', 'hilo']);
    });

    it('shows the payout table through the current hi-lo alias', () => {
      const { stdout } = cli('hilo payouts');
      assert.ok(stdout.includes('Same'));
      assert.ok(stdout.includes('12.5000x'));
    });

    it('shows the payout table through the canonical hi-lo command', () => {
      const { stdout } = cli('hi-lo-nebula payouts');
      assert.ok(stdout.includes('Same'));
      assert.ok(stdout.includes('12.5000x'));
    });

    it('documents Hi-Lo Nebula loop controls in command help', () => {
      const { stdout, code } = cli('hi-lo-nebula --help');
      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('--loop'), 'Should expose loop mode in hi-lo help');
      assert.ok(stdout.includes('--max-games <count>'), 'Should expose max-games in hi-lo help');
      assert.ok(stdout.includes('--bet-strategy <name>'), 'Should expose betting strategies in hi-lo help');
    });

    it('accepts the current stateful aliases', () => {
      const hilo = cli('game hilonebula --json');
      const vp = cli('vp 10');
      const bj = cli('bj 10');

      assert.strictEqual(JSON.parse(hilo.stdout).key, 'hi-lo-nebula');
      assert.notStrictEqual(vp.code, 0);
      assert.notStrictEqual(bj.code, 0);
      assert.ok(vp.stdout.includes('No wallet found'));
      assert.ok(bj.stdout.includes('No wallet found'));
    });

    it('rejects removed stateful aliases', () => {
      const hiLo = cli('hi-lo payouts');
      const nebula = cli('game nebula');
      const gimbozPoker = cli('gimboz-poker 10');

      assert.notStrictEqual(hiLo.code, 0);
      assert.notStrictEqual(nebula.code, 0);
      assert.notStrictEqual(gimbozPoker.code, 0);
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
      assert.deepStrictEqual(data.aliases, ['bj']);
    });

    it('exposes ABI verification metadata for verified Bear-A-Dice', () => {
      const { stdout } = cli('game bear-dice --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Bear-A-Dice ✔︎');
      assert.deepStrictEqual(data.aliases, ['bear', 'dice']);
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
      assert.strictEqual(data.stats.average_gp_per_ape, 1);
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

    it('--json --scoreboard appends the derived scoreboard payload', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --json --scoreboard', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const data = JSON.parse(stdout);

      assert.ok(data.scoreboard, 'Should include scoreboard data');
      assert.ok(Array.isArray(data.scoreboard.highest_multipliers), 'Should include highest multipliers');
      assert.ok(Array.isArray(data.scoreboard.biggest_payouts), 'Should include biggest payouts');
      assert.strictEqual(data.scoreboard.highest_multipliers[0].game_title, 'Roulette');
      assert.strictEqual(data.scoreboard.biggest_payouts[0].game_title, 'Roulette');
    });

    it('--scoreboard keeps URLs hidden in the terminal report unless --url is passed', () => {
      setupHistoryFixtureHome();
      const { stdout: withoutUrls } = cli('history --scoreboard', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const { stdout: withUrls } = cli('history --scoreboard --url', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(!withoutUrls.includes('https://www.ape.church/games/'), 'Should hide game URLs by default');
      assert.ok(withUrls.includes('https://www.ape.church/games/'), 'Should show game URLs when --url is passed');
    });

    it('--scoreboard renders Game Stats net profit with two decimals', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --scoreboard', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes('-5.11 APE'), 'Should show ApeStrong net profit with two decimals');
      assert.ok(stdout.includes('+1.99 APE'), 'Should show Roulette net profit with two decimals');
      assert.ok(!stdout.includes('-5.1100 APE'), 'Should no longer show four-decimal net profit values');
      assert.ok(!stdout.includes('+1.9900 APE'), 'Should no longer show four-decimal positive net profit values');
    });

    it('shows GP earned in the human-readable history output', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes('🧮 5 GP'));
      assert.ok(stdout.includes('🧮 2 GP'));
      assert.ok(stdout.includes('Average GP Ratio: 1 GP/APE'));
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
      assert.ok(stdout.includes('--scoreboard'), 'Should expose the scoreboard toggle in help');
      assert.ok(stdout.includes('--url'), 'Should expose the scoreboard URL toggle in help');
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

  describe('scoreboard command', () => {
    it('renders the cached scoreboards from local history', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('scoreboard', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes('Scoreboard'), 'Should render the scoreboard section');
      assert.ok(stdout.includes('Highest Multipliers'), 'Should render the highest multipliers table');
      assert.ok(stdout.includes('Biggest Payouts'), 'Should render the biggest payouts table');
      assert.ok(!stdout.includes('https://www.ape.church/games/'), 'Should hide game URLs by default');
    });

    it('--url shows game links in the terminal scoreboard tables', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('scoreboard --url', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes('https://www.ape.church/games/'), 'Should show game URLs when requested');
    });

    it('--json returns scoreboard metadata and rankings', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('scoreboard --json', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const data = JSON.parse(stdout);

      assert.strictEqual(data.wallet, HISTORY_FIXTURE_WALLET.toLowerCase());
      assert.ok(typeof data.scoreboard_file === 'string' && data.scoreboard_file.endsWith('_score.json'));
      assert.ok(Array.isArray(data.highest_multipliers), 'Should include highest multipliers');
      assert.ok(Array.isArray(data.biggest_payouts), 'Should include biggest payouts');
      assert.strictEqual(data.highest_multipliers[0].game_title, 'Roulette');
      assert.strictEqual(data.biggest_payouts[0].game_title, 'Roulette');
    });

    it('--list shows wallets with cached scoreboards or derivable history', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('scoreboard --list', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes(HISTORY_FIXTURE_WALLET.toLowerCase()), 'Should list scoreboard wallets');
    });

    it('--help documents the --url toggle', () => {
      const { stdout } = cli('scoreboard --help');
      assert.ok(stdout.includes('--url'), 'Should expose the URL toggle in help');
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
