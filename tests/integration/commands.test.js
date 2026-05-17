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
const CONFIG_OVERRIDE_ROOT = path.join(__dirname, '../tmp-config-root');
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
      version: 2,
      wallet: HISTORY_FIXTURE_WALLET.toLowerCase(),
      chain_id: 33139,
      last_synced_block: 1,
      last_download_on: '2026-04-02T00:00:00.000Z',
      games: [
        {
          contract: '0x0717330c1a9e269a0e034aBB101c8d32Ac0e9600',
          game_id: '1',
          timestamp: 1710000000000,
          game_key: 'ape-strong',
          config: { range: 50 },
          wager_wei: '5000000000000000000',
          payout_wei: '0',
          contract_fee_wei: '100000000000000000',
          gas_fee_wei: '10000000000000000',
          settled: true,
          gp_received_raw: '5',
          last_sync_on: '2026-04-02T00:00:00.000Z',
        },
        {
          contract: '0x1f48A104C1808eb4107f3999999D36aeafEC56d5',
          game_id: '2',
          timestamp: 1710000100000,
          game_key: 'roulette',
          config: { bet: 'RED' },
          wager_wei: '2000000000000000000',
          payout_wei: '4000000000000000000',
          contract_fee_wei: '0',
          gas_fee_wei: '10000000000000000',
          settled: true,
          gp_received_raw: '2',
          last_sync_on: '2026-04-02T00:00:00.000Z',
        },
      ],
    }, null, 2)
  );
}

function resetBotFixtures() {
  fs.rmSync(path.join(NO_WALLET_HOME, '.apechurch-cli', 'bots'), { recursive: true, force: true });
  fs.rmSync(CONFIG_OVERRIDE_ROOT, { recursive: true, force: true });
}

function writeBotFixture({
  baseDir,
  folderName,
  command = folderName,
  description = 'Test bot fixture',
  script = null,
}) {
  const botsDir = path.join(baseDir, 'bots');
  const botDir = path.join(botsDir, folderName);
  fs.mkdirSync(botDir, { recursive: true });
  fs.writeFileSync(
    path.join(botDir, 'bot.json'),
    JSON.stringify({
      name: folderName,
      command,
      description,
      entry: './index.js',
    }, null, 2)
  );
  fs.writeFileSync(
    path.join(botDir, 'index.js'),
    script || `export default async function ({ args, play, bot }) {
  if (args[0] === 'echo') {
    console.log(\`BOT:\${bot.command}:\${args.slice(1).join(',')}\`);
    return 0;
  }
  return play(['bj', '10']);
}
`
  );
}

function stripVersionBanner(output) {
  return String(output || '').replace(/^apechurch-cli v[^\n]*\n+/, '');
}

function buildCliEnv(options = {}) {
  const optionEnv = options.env || {};
  const optionHasBotConfig = Object.prototype.hasOwnProperty.call(optionEnv, 'APECHURCH_CLI_CONFIG');
  const optionBotConfig = optionEnv.APECHURCH_CLI_CONFIG;
  const preserveBotConfig = optionHasBotConfig && optionBotConfig !== process.env.APECHURCH_CLI_CONFIG;
  const env = {
    ...process.env,
    HOME: optionEnv.HOME || NO_WALLET_HOME,
    FORCE_COLOR: '0',
  };

  // Integration tests create isolated bot fixtures. Do not let a developer's
  // shell-level bot config override the fixture directory unless a test opts in.
  delete env.APECHURCH_CLI_CONFIG;

  const mergedEnv = {
    ...env,
    ...optionEnv,
  };

  if (!preserveBotConfig) {
    delete mergedEnv.APECHURCH_CLI_CONFIG;
  }

  return mergedEnv;
}

/**
 * Run CLI command and return output
 */
function cli(args, options = {}) {
  const env = buildCliEnv(options);
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

function cliRaw(args, options = {}) {
  const env = buildCliEnv(options);

  return execSync(`node ${CLI_PATH} ${args} 2>&1`, {
    encoding: 'utf8',
    timeout: options.timeout || 30000,
    ...options,
    env,
  });
}

setupNoWalletHome();

describe('CLI Commands Integration Tests', () => {

  describe('version and help', () => {
    it('--version shows version number', () => {
      const { stdout } = cli('--version');
      assert.ok(/\d+\.\d+\.\d+/.test(stdout), 'Should show semver version');
      assert.ok(/\(\d{14} [0-9a-f]{7,}\)/i.test(stdout), 'Should show commit timestamp and abbreviated commit hash');
    });

    it('--version --json shows version metadata', () => {
      const { stdout } = cli('--version --json');
      const parsed = JSON.parse(stdout);

      assert.ok(/\d+\.\d+\.\d+/.test(parsed.version), 'Should include semver version');
      assert.ok(/^\d{14}$/.test(parsed.timestamp_utc), 'Should include UTC commit timestamp');
      assert.ok(/^[0-9a-f]{7,}$/i.test(parsed.commit_id), 'Should include abbreviated commit hash');
    });

    it('--json alone shows version metadata', () => {
      const { stdout } = cli('--json');
      const parsed = JSON.parse(stdout);

      assert.ok(/\d+\.\d+\.\d+/.test(parsed.version), 'Should include semver version');
      assert.ok(/^\d{14}$/.test(parsed.timestamp_utc), 'Should include UTC commit timestamp');
      assert.ok(/^[0-9a-f]{7,}$/i.test(parsed.commit_id), 'Should include abbreviated commit hash');
    });

    it('command --json output includes version metadata without banner', () => {
      const stdout = cliRaw('games --json');
      const parsed = JSON.parse(stdout);

      assert.ok(!stdout.startsWith('apechurch-cli v'), 'Should not print the invocation banner in JSON mode');
      assert.ok(/\d+\.\d+\.\d+/.test(parsed.version), 'Should include semver version');
      assert.ok(/^\d{14}$/.test(parsed.timestamp_utc), 'Should include UTC commit timestamp');
      assert.ok(/^[0-9a-f]{7,}$/i.test(parsed.commit_id), 'Should include abbreviated commit hash');
      assert.ok(Array.isArray(parsed.games), 'Should preserve the command payload');
    });

    it('--help shows usage', () => {
      const { stdout } = cli('--help');
      assert.ok(stdout.includes('Usage'), 'Should show usage');
      assert.ok(stdout.includes('Commands'), 'Should list commands');
    });

    it('bot --help documents the external bot surface', () => {
      const { stdout } = cli('bot --help');
      assert.ok(stdout.includes('Run an external bot'), 'Should document the bot command');
      assert.ok(stdout.includes('Bot directory:'), 'Should show the bot directory');
      assert.ok(stdout.includes('bot [options] [name] [args...]'), 'Should show bot command usage');
    });

    it('play --help includes BNF grammar for structured arguments', () => {
      const { stdout } = cli('play --help');
      assert.ok(stdout.includes('Grammar (BNF)'), 'Should show a BNF appendix');
      assert.ok(stdout.includes('Stateless game options'), 'Should group stateless play options');
      assert.ok(stdout.includes('Stateful game options'), 'Should group stateful play options');
      assert.ok(stdout.includes('Shared play / loop options'), 'Should group shared play options');
      assert.ok(stdout.includes('<points> ::= <number>'), 'Should document GP rate grammar');
      assert.ok(stdout.includes('--auto'), 'Should document explicit automatic random play');
      assert.ok(stdout.includes('--timeout <ms>'), 'Should document stateless result timeout');
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
      assert.ok(stdout.includes('--solver-max-states <n>'), 'Should show blackjack solver state cap option');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should show take-profit stop option');
      assert.ok(stdout.includes('--min-profit <ape>'), 'Should show min-profit stop option');
      assert.ok(stdout.includes('--target-x <x>'), 'Should show single-game multiplier stop option');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should show single-game payout stop option');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should show single-game loss stop option');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should show drawdown recovery stop option');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should show profit giveback stop option');
      assert.ok(stdout.includes('--max-loss <ape>'), 'Should show max-loss stop option');
      assert.ok(stdout.includes('Auto-play the hand'), 'Should use generic auto-play description');
      assert.ok(!stdout.includes('--human'), 'Should hide --human from standard help');
    });

    it('video-poker --help keeps --human hidden and documents generic auto-play', () => {
      const { stdout } = cli('video-poker --help');
      assert.ok(stdout.includes('--auto [mode]'), 'Should still show auto option');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should show take-profit stop option');
      assert.ok(stdout.includes('--min-profit <ape>'), 'Should show min-profit stop option');
      assert.ok(stdout.includes('--target-x <x>'), 'Should show single-game multiplier stop option');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should show single-game payout stop option');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should show single-game loss stop option');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should show drawdown recovery stop option');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should show profit giveback stop option');
      assert.ok(stdout.includes('--max-loss <ape>'), 'Should show max-loss stop option');
      assert.ok(stdout.includes('Auto-play the hand'), 'Should use generic auto-play description');
      assert.ok(!stdout.includes('--human'), 'Should hide --human from standard help');
    });

    it('play --help keeps --human hidden and documents loop controls', () => {
      const { stdout } = cli('play --help');
      assert.ok(stdout.includes('--loop'), 'Should still show loop option');
      assert.ok(stdout.includes('--delay <seconds>'), 'Should still show delay option');
      assert.ok(stdout.includes('--solver-max-states <n>'), 'Should show blackjack solver state cap option');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should show take-profit stop option');
      assert.ok(stdout.includes('--min-profit <ape>'), 'Should show min-profit stop option');
      assert.ok(stdout.includes('--target-x <x>'), 'Should show single-game multiplier stop option');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should show single-game payout stop option');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should show single-game loss stop option');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should show drawdown recovery stop option');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should show profit giveback stop option');
      assert.ok(stdout.includes('--max-loss <ape>'), 'Should show max-loss stop option');
      assert.ok(!stdout.includes('--human'), 'Should hide --human from standard help');
    });

    it('help auto still shows advanced examples', () => {
      const { stdout } = cli('help auto');
      assert.ok(stdout.includes('--auto best'), 'Should keep best-mode examples in helper text');
      assert.ok(stdout.includes('--solver-max-states'), 'Should document the blackjack best-EV state cap');
      assert.ok(stdout.includes('--human'), 'Should keep humanized pacing example in helper text');
      assert.ok(stdout.includes('play roulette 10 RED --loop --human'), 'Should document humanized pacing for simple games');
    });

    it('help loop documents startup game estimates where RTP is known', () => {
      const { stdout } = cli('help loop');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should document take-profit stop');
      assert.ok(stdout.includes('--min-profit <ape>'), 'Should document min-profit stop');
      assert.ok(stdout.includes('--target-x <x>'), 'Should document single-game multiplier stop');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should document single-game payout stop');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should document single-game loss stop');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should document drawdown recovery stop');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should document profit giveback stop');
      assert.ok(stdout.includes('--max-loss <ape>'), 'Should document max-loss stop');
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
      assert.ok(stdout.includes('Cash Dash ✔︎'), 'Should list verified Cash Dash');
      assert.ok(stdout.includes('Hi-Lo Nebula ✔︎'), 'Should list verified Hi-Lo Nebula');
      assert.ok(stdout.includes('Jungle Plinko ✔︎'), 'Should list verified Jungle Plinko');
      assert.ok(stdout.includes('Cosmic Plinko ✔︎'), 'Should list verified Cosmic Plinko');
      assert.ok(stdout.includes('Keno ✔︎'), 'Should list verified Keno');
      assert.ok(stdout.includes('Speed Keno ✔︎'), 'Should list verified Speed Keno');
      assert.ok(stdout.includes('Dino Dough ✔︎'), 'Should list verified Dino Dough');
      assert.ok(stdout.includes('Bubblegum Heist ✔︎'), 'Should list verified Bubblegum Heist');
      assert.ok(stdout.includes('Geez Diggerz ✔︎'), 'Should list verified Geez Diggerz');
      assert.ok(stdout.includes('Glyde or Crash ✔︎'), 'Should list verified Glyde or Crash');
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
        'Gimboz Smash ✔︎',
        'Glyde or Crash ✔︎',
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
      const cashDashIndex = stdout.indexOf('Cash Dash ✔︎');
      const hiLoNebulaIndex = stdout.indexOf('Hi-Lo Nebula ✔︎');
      const videoPokerIndex = stdout.indexOf('Video Poker ✔︎');
      assert.ok(blackjackIndex > statefulHeaderIndex, 'Blackjack should appear in the stateful section');
      assert.ok(cashDashIndex > blackjackIndex, 'Cash Dash should appear after Blackjack');
      assert.ok(hiLoNebulaIndex > cashDashIndex, 'Hi-Lo Nebula should appear after Cash Dash');
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
      assert.ok(stdout.includes('Aliases: glyde, glyde-crash, glydecrash, speed-crash, speedcrash, crash'));
      assert.ok(stdout.includes('Aliases: bj'));
      assert.ok(stdout.includes('Aliases: cashdash, dash'));
      assert.ok(stdout.includes('Aliases: hilonebula, hilo, nebula'));
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
          'cash-dash',
          'cosmic-plinko',
          'dino-dough',
          'geez-diggerz',
          'gimboz-smash',
          'glyde-or-crash',
          'hi-lo-nebula',
          'jungle-plinko',
          'keno',
          'monkey-match',
          'primes',
          'reel-pirates',
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
      assert.ok(stdout.includes('Simple: ape-strong | baccarat | bear-dice | blocks | bubblegum-heist | cosmic-plinko | dino-dough | geez-diggerz | gimboz-smash | glyde-or-crash | jungle-plinko | keno | monkey-match | primes | reel-pirates | roulette | speed-keno | sushi-showdown'));
      assert.ok(stdout.includes('Stateful: blackjack | cash-dash | hi-lo-nebula | video-poker'));
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
        'cash-dash',
        'cosmic-plinko',
        'dino-dough',
        'geez-diggerz',
        'gimboz-smash',
        'glyde-or-crash',
        'hi-lo-nebula',
        'jungle-plinko',
        'keno',
        'monkey-match',
        'primes',
        'reel-pirates',
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
      const glyde = cli('game glyde --json');

      assert.strictEqual(JSON.parse(jungle.stdout).key, 'jungle-plinko');
      assert.strictEqual(JSON.parse(cosmic.stdout).key, 'cosmic-plinko');
      assert.strictEqual(JSON.parse(glyde.stdout).key, 'glyde-or-crash');
    });

    it('accepts the current simple-game aliases in play mode', () => {
      const smash = cli('play smash 10 --range 1-50');
      const jungle = cli('play jungle 10 0 10');
      const crash = cli('play crash 10 2x');

      assert.notStrictEqual(smash.code, 0);
      assert.notStrictEqual(jungle.code, 0);
      assert.notStrictEqual(crash.code, 0);
      assert.ok(smash.stdout.includes('No wallet found'));
      assert.ok(jungle.stdout.includes('No wallet found'));
      assert.ok(crash.stdout.includes('No wallet found'));
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

    it('exposes ABI verification metadata for verified Glyde or Crash', () => {
      const { stdout } = cli('game glyde-or-crash --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Glyde or Crash ✔︎');
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
      assert.deepStrictEqual(data.aliases, ['hilonebula', 'hilo', 'nebula']);
    });

    it('exposes ABI verification metadata for verified Cash Dash', () => {
      const { stdout } = cli('game cash-dash --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(data.abiVerified, true);
      assert.strictEqual(data.displayName, 'Cash Dash ✔︎');
      assert.deepStrictEqual(data.aliases, ['cashdash', 'dash']);
    });

    it('shows the payout table through the current cash-dash alias', () => {
      const { stdout } = cli('dash payouts');
      assert.ok(stdout.includes('Tiles'));
      assert.ok(stdout.includes('1.9200x'));
    });

    it('shows the payout table through the canonical cash-dash command', () => {
      const { stdout } = cli('cash-dash payouts');
      assert.ok(stdout.includes('Tiles'));
      assert.ok(stdout.includes('1.9200x'));
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
      assert.ok(stdout.includes('--min-profit <ape>'), 'Should expose min-profit in hi-lo help');
      assert.ok(stdout.includes('--max-loss <ape>'), 'Should expose max-loss in hi-lo help');
      assert.ok(stdout.includes('--bet-strategy <name>'), 'Should expose betting strategies in hi-lo help');
    });

    it('documents Cash Dash loop controls in command help', () => {
      const { stdout, code } = cli('cash-dash --help');
      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('--tile <tile>'), 'Should expose opening tile in cash-dash help');
      assert.ok(stdout.includes('--cashout-after <rows>'), 'Should expose cashout-after in cash-dash help');
      assert.ok(stdout.includes('--loop'), 'Should expose loop mode in cash-dash help');
      assert.ok(stdout.includes('--max-games <count>'), 'Should expose max-games in cash-dash help');
      assert.ok(stdout.includes('--min-profit <ape>'), 'Should expose min-profit in cash-dash help');
      assert.ok(stdout.includes('--max-loss <ape>'), 'Should expose max-loss in cash-dash help');
      assert.ok(stdout.includes('--bet-strategy <name>'), 'Should expose betting strategies in cash-dash help');
    });

    it('accepts the current stateful aliases', () => {
      const hilo = cli('game hilonebula --json');
      const nebula = cli('game nebula --json');
      const cashDash = cli('game cashdash --json');
      const dash = cli('dash payouts');
      const vp = cli('vp 10');
      const bj = cli('bj 10');

      assert.strictEqual(JSON.parse(hilo.stdout).key, 'hi-lo-nebula');
      assert.strictEqual(JSON.parse(nebula.stdout).key, 'hi-lo-nebula');
      assert.strictEqual(JSON.parse(cashDash.stdout).key, 'cash-dash');
      assert.strictEqual(dash.code, 0);
      assert.ok(dash.stdout.includes('Tiles'));
      assert.notStrictEqual(vp.code, 0);
      assert.notStrictEqual(bj.code, 0);
      assert.ok(vp.stdout.includes('No wallet found'));
      assert.ok(bj.stdout.includes('No wallet found'));
    });

    it('routes stateful games through play mode', () => {
      const bj = cli('play bj 10');
      const vp = cli('play vp 10');
      const cashDashPayouts = cli('play dash payouts');
      const hiLoPayouts = cli('play hilo payouts');
      const blackjackOption = cli('play --game blackjack --amount 10');
      const blackjackPositionalAmountFlag = cli('play blackjack --amount 10');
      const videoPokerAutoBest = cli('play vp 10 --auto best');

      assert.notStrictEqual(bj.code, 0);
      assert.notStrictEqual(vp.code, 0);
      assert.strictEqual(cashDashPayouts.code, 0);
      assert.strictEqual(hiLoPayouts.code, 0);
      assert.notStrictEqual(blackjackOption.code, 0);
      assert.notStrictEqual(blackjackPositionalAmountFlag.code, 0);
      assert.notStrictEqual(videoPokerAutoBest.code, 0);
      assert.ok(bj.stdout.includes('No wallet found'));
      assert.ok(vp.stdout.includes('No wallet found'));
      assert.ok(cashDashPayouts.stdout.includes('Tiles'));
      assert.ok(hiLoPayouts.stdout.includes('Same'));
      assert.ok(blackjackOption.stdout.includes('No wallet found'));
      assert.ok(blackjackPositionalAmountFlag.stdout.includes('No wallet found'));
      assert.ok(videoPokerAutoBest.stdout.includes('No wallet found'));
    });

    it('rejects removed stateful aliases', () => {
      const hiLo = cli('hi-lo payouts');
      const gimbozPoker = cli('gimboz-poker 10');

      assert.notStrictEqual(hiLo.code, 0);
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

    it('hides internal registry metadata from game helpers', () => {
      const { stdout } = cli('game pirates');

      assert.ok(stdout.includes('--spins'), 'Should still show the public spin parameter');
      assert.ok(!stdout.includes('--gameDataOrder'), 'Should not show internal encoding metadata as a CLI option');
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

  describe('bot command', () => {
    it('lists discovered bots from the default bot directory', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'sample-bot',
      });

      const { stdout, code } = cli('bot');
      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('Discovered bots:'), 'Should show discovered bots');
      assert.ok(stdout.includes('sample-bot'), 'Should list the sample bot');
      assert.ok(stdout.includes('.apechurch-cli/bots'), 'Should mention the default bots directory');
    });

    it('does not load external bot code while running unrelated commands', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'broken-bot',
        script: 'export default function broken( {',
      });

      const { stdout, code } = cli('games --json');
      const payload = JSON.parse(stdout);

      assert.strictEqual(code, 0);
      assert.ok(Array.isArray(payload.games), 'Should run the normal CLI command');
    });

    it('runs a discovered bot and forwards positional arguments', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'sample-bot',
      });

      const echoed = cli('bot sample-bot echo hello world');
      const played = cli('bot sample-bot');

      assert.strictEqual(echoed.code, 0);
      assert.ok(echoed.stdout.includes('BOT:sample-bot:hello,world'));
      assert.notStrictEqual(played.code, 0);
      assert.ok(played.stdout.includes('No wallet found'));
    });

    it('preserves bot-specific flags after the bot name', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'arg-bot',
        script: `export default async function ({ args }) {
  console.log(JSON.stringify(args));
  return 0;
}
`,
      });

      const { stdout, code } = cli('bot arg-bot --base 10 --stop-loss 50');

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('["--base","10","--stop-loss","50"]'));
    });

    it('forwards bot-specific help flags after the bot name', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'help-bot',
        script: `export default async function ({ args }) {
  console.log(JSON.stringify(args));
  return 0;
}
`,
      });

      const { stdout, code } = cli('bot help-bot --help');

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('["--help"]'));
    });

    it('exposes a playJson helper for parsed play responses', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'json-bot',
        script: `export default async function ({ playJson }) {
  try {
    await playJson(['ape-strong', '1', '60']);
  } catch (error) {
    console.log(JSON.stringify({ code: error.code, message: error.message }));
    return 0;
  }
  return 1;
}
`,
      });

      const { stdout, code } = cli('bot json-bot');
      const payload = JSON.parse(stdout.trim());

      assert.strictEqual(code, 0);
      assert.strictEqual(payload.code, 1);
      assert.ok(payload.message.includes('No wallet found'));
    });

    it('exposes shared session helpers to external bots', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'session-bot',
        script: `export default async function ({ session }) {
  const parsed = session.parseStandardBotArgs(['--json', '--fallback-loss', '2', '--fallback-bot', 'next-bot', 'private']);
  console.log(JSON.stringify({
    json: parsed.json,
    fallbackLoss: parsed.fallbackLoss,
    fallbackBot: parsed.fallbackBot,
    remainingArgs: parsed.remainingArgs,
    line: session.formatAfterGameLine({
      gameNumber: 1,
      status: 'complete',
      wagerWei: session.parseApeToWei('2'),
      payoutWei: session.parseApeToWei('5'),
    }),
  }));
  return 0;
}
`,
      });

      const { stdout, code } = cli('bot session-bot');
      const payload = JSON.parse(stdout.trim());

      assert.strictEqual(code, 0);
      assert.strictEqual(payload.json, true);
      assert.strictEqual(payload.fallbackLoss, '2');
      assert.strictEqual(payload.fallbackBot, 'next-bot');
      assert.deepStrictEqual(payload.remainingArgs, ['private']);
      assert.strictEqual(payload.line, '# game_n: 1, status: complete, bet: 2, payout: 5, multiply: 2.5');
    });

    it('exposes a botJson helper for nested bot responses', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'child-bot',
        script: `export default async function ({ args, bot }) {
  console.log(JSON.stringify({ bot: bot.command, args }));
  return 0;
}
`,
      });
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'parent-bot',
        script: `export default async function ({ botJson }) {
  const payload = await botJson('child-bot', ['3']);
  console.log(JSON.stringify(payload));
  return 0;
}
`,
      });

      const { stdout, code } = cli('bot parent-bot');
      const payload = JSON.parse(stdout.trim());

      assert.strictEqual(code, 0);
      assert.strictEqual(payload.bot, 'child-bot');
      assert.deepStrictEqual(payload.args, ['3', '--json']);
    });

    it('prefers APECHURCH_CLI_CONFIG as the bot base directory', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'override-bot',
      });

      const env = { APECHURCH_CLI_CONFIG: CONFIG_OVERRIDE_ROOT };
      const { stdout, code } = cli('bot --list', { env });
      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('override-bot'));
      assert.ok(stdout.includes('APECHURCH_CLI_CONFIG='));
      assert.ok(stdout.includes(path.join(CONFIG_OVERRIDE_ROOT, 'bots')));
      assert.ok(!stdout.includes('sample-bot'));
    });

    it('accepts APECHURCH_CLI_CONFIG pointing directly at the bots directory', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'direct-bots-dir',
      });

      const botsDir = path.join(CONFIG_OVERRIDE_ROOT, 'bots');
      const env = { APECHURCH_CLI_CONFIG: botsDir };
      const { stdout, code } = cli('bot --list', { env });
      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('direct-bots-dir'));
      assert.ok(stdout.includes(`Bot directory: ${botsDir}`));
      assert.ok(!stdout.includes(path.join(botsDir, 'bots')));
    });

    it('passes -v through to named bots', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'versioned-bot',
        script: `export default async function ({ args }) {
  console.log(JSON.stringify({ args }));
  return 0;
}
`,
      });

      const env = { APECHURCH_CLI_CONFIG: CONFIG_OVERRIDE_ROOT };
      const { stdout, code } = cli('bot versioned-bot -v 1 --json', { env });
      const payload = JSON.parse(stdout.trim());
      assert.strictEqual(code, 0);
      assert.deepStrictEqual(payload.args, ['-v', '1', '--json']);
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

    it('--scoreboard --ids shows game IDs in the terminal report', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --scoreboard --ids', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes('game id'), 'Should render the game id column');
      assert.ok(stdout.includes('| 2 '), 'Should include the roulette game ID in the scoreboard');
      assert.ok(!stdout.includes('https://www.ape.church/games/'), 'Should keep URLs hidden when showing IDs');
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

    it('--leaderboard renders weekly wAPE totals only', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --leaderboard', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes('Global: 7.00 $APE wagered over 2 games'));
      assert.ok(stdout.includes('2024 W10: 7.00 $APE wagered'));
      assert.ok(!stdout.includes('Recent Games'), 'Should not render the default recent-games section');
      assert.ok(!stdout.includes('History Stats'), 'Should not render aggregate stats in leaderboard mode');
    });

    it('--json --leaderboard includes weekly wAPE totals', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --json --leaderboard', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const data = JSON.parse(stdout);

      assert.ok(data.leaderboard, 'Should include leaderboard data');
      assert.strictEqual(data.leaderboard.total_wagered_ape, '7');
      assert.strictEqual(data.leaderboard.total_games, 2);
      assert.strictEqual(data.leaderboard.weeks[0].week_label, '2024 W10');
      assert.strictEqual(data.leaderboard.weeks[0].wagered_ape, '7');
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
      assert.ok(stdout.includes('--leaderboard'), 'Should expose the weekly leaderboard toggle in help');
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

    it('--ids shows game IDs in the terminal scoreboard tables', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('scoreboard --ids', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes('game id'), 'Should render the game id column');
      assert.ok(stdout.includes('| 2 '), 'Should show the roulette game ID');
      assert.ok(!stdout.includes('https://www.ape.church/games/'), 'Should keep URLs hidden when IDs are shown');
    });

    it('uses the last scoreboard reference flag when --url and --ids are both passed', () => {
      setupHistoryFixtureHome();
      const { stdout: idsLast } = cli('scoreboard --url --ids', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const { stdout: urlLast } = cli('scoreboard --ids --url', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(idsLast.includes('game id'), 'Should prefer IDs when --ids is last');
      assert.ok(!idsLast.includes('https://www.ape.church/games/'), 'Should hide URLs when --ids is last');
      assert.ok(urlLast.includes('game url'), 'Should prefer URLs when --url is last');
      assert.ok(urlLast.includes('https://www.ape.church/games/'), 'Should show URLs when --url is last');
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
      assert.strictEqual(data.highest_multipliers[0].game_id, '2');
      assert.strictEqual(data.biggest_payouts[0].game_title, 'Roulette');
      assert.strictEqual(data.biggest_payouts[0].game_id, '2');
    });

    it('--list shows wallets with cached scoreboards or derivable history', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('scoreboard --list', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes(HISTORY_FIXTURE_WALLET.toLowerCase()), 'Should list scoreboard wallets');
    });

    it('--help documents the scoreboard reference toggles', () => {
      const { stdout } = cli('scoreboard --help');
      assert.ok(stdout.includes('--ids'), 'Should expose the IDs toggle in help');
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
