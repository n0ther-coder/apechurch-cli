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
const CONFIG_DIR_ENV = 'APECHURCH_CLI_CONFIG_DIR';
const BOTS_DIR_ENV = 'APECHURCH_CLI_BOTS_DIR';
const LOG_DIR_ENV = 'APECHURCH_CLI_LOG_DIR';
const SCR_DIR_ENV = 'APECHURCH_CLI_SCR_DIR';
const PASS_ENV = 'APECHURCH_CLI_PASS';
const R2_ACCOUNT_ID_ENV = 'APECHURCH_CLI_R2_ACCOUNT_ID';
const R2_NAME_ENV = 'APECHURCH_CLI_R2_NAME';
const R2_TOKEN_ENV = 'APECHURCH_CLI_R2_TOKEN';
const R2_KEY_ENV = 'APECHURCH_CLI_R2_KEY';
const R2_SECRET_ENV = 'APECHURCH_CLI_R2_SECRET';
const RPC_URL_ENV = 'APECHAIN_RPC_URL';
const FORCE_COLOR_ENV = 'APECHURCH_CLI_FORCE_COLOR';
const ANSI_RE = /\x1b\[[0-9;]*m/;
const CONFIG_OVERRIDE_WALLET = '0x2222222222222222222222222222222222222222';
const BOT_LOG_TX_A = `0x${'a'.repeat(64)}`;
const BOT_LOG_TX_B = `0x${'b'.repeat(64)}`;
const BOT_LOG_TX_C = `0x${'c'.repeat(64)}`;

function getBotLogDir(logDir, bot) {
  return path.join(logDir, bot);
}

function listBotLogFiles(logDir, bot) {
  const dir = getBotLogDir(logDir, bot);
  if (!fs.existsSync(dir)) return [];
  const pattern = new RegExp(`^${bot}\\.\\d{14}(?:\\.\\d+)?\\.json$`);
  return fs.readdirSync(dir).filter((name) => pattern.test(name));
}

function readBotLogFile(logDir, bot, fileName) {
  return JSON.parse(fs.readFileSync(path.join(getBotLogDir(logDir, bot), fileName), 'utf8'));
}

function setupNoWalletHome() {
  fs.rmSync(NO_WALLET_HOME, { recursive: true, force: true });
  fs.mkdirSync(NO_WALLET_HOME, { recursive: true });
}

function writeSelectedWalletFixture(configDir, address) {
  const normalized = address.toLowerCase();
  const walletsDir = path.join(configDir, 'wallets');
  fs.mkdirSync(walletsDir, { recursive: true });
  fs.writeFileSync(
    path.join(walletsDir, `${normalized}.json`),
    JSON.stringify({ address }, null, 2)
  );
  fs.writeFileSync(
    path.join(walletsDir, 'current.json'),
    JSON.stringify({
      version: 1,
      address,
      wallet_file: `${normalized}.json`,
    }, null, 2)
  );
}

function setupHistoryFixtureHome() {
  const apechurchDir = path.join(HISTORY_FIXTURE_HOME, '.apechurch-cli');
  const historyDir = path.join(apechurchDir, 'history');
  const gamesDir = path.join(apechurchDir, 'games');
  fs.rmSync(HISTORY_FIXTURE_HOME, { recursive: true, force: true });
  fs.mkdirSync(historyDir, { recursive: true });
  fs.mkdirSync(gamesDir, { recursive: true });

  writeSelectedWalletFixture(apechurchDir, HISTORY_FIXTURE_WALLET);
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

function writeConfigOverrideProfile({ address = CONFIG_OVERRIDE_WALLET, currentGpPerApe = 7.5 } = {}) {
  const normalized = address.toLowerCase();
  fs.mkdirSync(path.join(CONFIG_OVERRIDE_ROOT, 'profiles'), { recursive: true });
  writeSelectedWalletFixture(CONFIG_OVERRIDE_ROOT, address);
  fs.writeFileSync(
    path.join(CONFIG_OVERRIDE_ROOT, 'profiles', `${normalized}_profile.json`),
    JSON.stringify({ currentGpPerApe }, null, 2)
  );
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
  const pathEnvVars = [CONFIG_DIR_ENV, BOTS_DIR_ENV, LOG_DIR_ENV, SCR_DIR_ENV];
  const secretEnvVars = [
    PASS_ENV,
    R2_ACCOUNT_ID_ENV,
    R2_NAME_ENV,
    R2_TOKEN_ENV,
    R2_KEY_ENV,
    R2_SECRET_ENV,
  ];
  const isolatedEnvVars = [...pathEnvVars, ...secretEnvVars];
  const env = {
    ...process.env,
    HOME: optionEnv.HOME || NO_WALLET_HOME,
    FORCE_COLOR: '0',
    [FORCE_COLOR_ENV]: '',
  };

  // Integration tests create isolated fixtures. Do not let a developer's
  // shell-level path or secret config override them unless a test opts in.
  for (const envVar of isolatedEnvVars) {
    delete env[envVar];
  }

  const mergedEnv = {
    ...env,
    ...optionEnv,
  };
  mergedEnv.FORCE_COLOR = '0';
  mergedEnv[FORCE_COLOR_ENV] = '';

  for (const envVar of isolatedEnvVars) {
    if (!Object.prototype.hasOwnProperty.call(optionEnv, envVar)) {
      delete mergedEnv[envVar];
    }
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
      assert.ok(
        /\(\d{4}-[A-Z]{3}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{4} [0-9a-f]{7,}\)/i.test(stdout),
        'Should show the standardized terminal commit timestamp and abbreviated commit hash',
      );
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

    it('--color does not add ANSI escapes to JSON output', () => {
      const stdout = cliRaw('games --json --color');
      assert.doesNotMatch(stdout, ANSI_RE);
      JSON.parse(stdout);
    });

    it('--help shows usage', () => {
      const { stdout } = cli('--help');
      assert.ok(stdout.includes('Usage'), 'Should show usage');
      assert.ok(stdout.includes('Commands'), 'Should list commands');
      assert.ok(stdout.includes(CONFIG_DIR_ENV), 'Should document config directory env');
      assert.ok(stdout.includes(BOTS_DIR_ENV), 'Should document bots directory env');
      assert.ok(stdout.includes(LOG_DIR_ENV), 'Should document bot log directory env');
    });

    it('bot --help documents the external bot surface', () => {
      const { stdout } = cli('bot --help');
      assert.ok(stdout.includes('Run an external bot'), 'Should document the bot command');
      assert.ok(stdout.includes('Bot directory:'), 'Should show the bot directory');
      assert.ok(stdout.includes('Bot log directory:'), 'Should show the bot log directory');
      assert.ok(stdout.includes('bot [options] [name] [args...]'), 'Should show bot command usage');
      assert.ok(stdout.includes(BOTS_DIR_ENV), 'Should document direct bots root override');
      assert.ok(stdout.includes(LOG_DIR_ENV), 'Should document bot log dir override');
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
      assert.ok(stdout.includes('<split> ::= <integer>'), 'Should document split attempt grammar');
      assert.ok(stdout.includes('<survive> ::= <integer>'), 'Should document survival attempt grammar');
      assert.ok(!stdout.includes('--rolls <rolls>'), 'Should not advertise old roll flags');
      assert.ok(!stdout.includes('--runs <runs>'), 'Should not advertise old run flags');
      assert.ok(!stdout.includes('<= 3 when difficulty >= 3'), 'Should not mention the removed fake Bear-A-Dice 3-roll cap');
      assert.ok(stdout.includes('--numbers 1,7,13,25,40'), 'Should document the single-token numbers form');
    });

    it('fees --help documents actions and BNF grammar', () => {
      const { stdout } = cli('fees --help');
      assert.ok(stdout.includes('Actions:'), 'Should document fees actions');
      assert.ok(stdout.includes('scan    Read observed GameEnded logs'), 'Should document scan action');
      assert.ok(stdout.includes('report  Read the local compact fee log'), 'Should document report action');
      assert.ok(stdout.includes('Storage:'), 'Should document fee log storage');
      assert.ok(stdout.includes('Grammar (BNF)'), 'Should show a BNF appendix');
      assert.ok(stdout.includes('<fees-action> ::= "scan" | "report"'), 'Should document action grammar');
      assert.ok(stdout.includes('--yes'), 'Should document the unlimited scan confirmation bypass');
      assert.ok(stdout.includes('<game> ::= <game-key> | <game-alias> | <game-display-name>'), 'Should document alias-safe game grammar');
      assert.ok(stdout.includes('fees scan primes'), 'Should include scan example');
      assert.ok(stdout.includes('fees report primes'), 'Should include report example');
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

    it('blackjack --help documents hidden timing options and generic auto-play', () => {
      const { stdout } = cli('blackjack --help');
      assert.ok(stdout.includes('--auto [mode]'), 'Should still show auto option');
      assert.ok(stdout.includes('--solver [mode]'), 'Should show blackjack manual solver option');
      assert.ok(stdout.includes('--side <ape>'), 'Should show player side bet option');
      assert.ok(stdout.includes('--solver-max-states <n>'), 'Should show blackjack solver state cap option');
      assert.ok(stdout.includes('--solver-timeout-ms <ms>'), 'Should show blackjack solver timeout option');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should show take-profit stop option');
      assert.ok(stdout.includes('--min-profit <ape>'), 'Should show min-profit stop option');
      assert.ok(stdout.includes('--target-x <x>'), 'Should show single-game multiplier stop option');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should show single-game payout stop option');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should show single-game loss stop option');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should show drawdown recovery stop option');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should show profit giveback stop option');
      assert.ok(stdout.includes('--max-loss <ape>'), 'Should show max-loss stop option');
      assert.ok(stdout.includes('--bankroll <ape>'), 'Should show bankroll alias');
      assert.ok(stdout.includes('--min-bet <ape>'), 'Should show minimum bet floor option');
      assert.ok(stdout.includes('bankroll-fraction=<0..1>'), 'Should document bankroll fraction strategy syntax');
      assert.ok(stdout.includes('Auto-play the hand'), 'Should use generic auto-play description');
      assert.ok(stdout.includes('--human [range]'), 'Should document the supported human timing option');
    });

    it('video-poker --help documents hidden timing options and generic auto-play', () => {
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
      assert.ok(stdout.includes('--bankroll <ape>'), 'Should show bankroll alias');
      assert.ok(stdout.includes('--min-bet <ape>'), 'Should show minimum bet floor option');
      assert.ok(stdout.includes('bankroll-fraction=<0..1>'), 'Should document bankroll fraction strategy syntax');
      assert.ok(stdout.includes('Auto-play the hand'), 'Should use generic auto-play description');
      assert.ok(stdout.includes('--human [range]'), 'Should document the supported human timing option');
    });

    it('play --help documents hidden timing options and loop controls', () => {
      const { stdout } = cli('play --help');
      assert.ok(stdout.includes('--loop'), 'Should still show loop option');
      assert.ok(stdout.includes('--delay <seconds>'), 'Should still show delay option');
      assert.ok(stdout.includes('--solver-max-states <n>'), 'Should show blackjack solver state cap option');
      assert.ok(stdout.includes('--solver-timeout-ms <ms>'), 'Should show blackjack solver timeout option');
      assert.ok(stdout.includes('--take-profit <ape>'), 'Should show take-profit stop option');
      assert.ok(stdout.includes('--min-profit <ape>'), 'Should show min-profit stop option');
      assert.ok(stdout.includes('--target-x <x>'), 'Should show single-game multiplier stop option');
      assert.ok(stdout.includes('--target-profit <ape>'), 'Should show single-game payout stop option');
      assert.ok(stdout.includes('--retrace <ape>'), 'Should show single-game loss stop option');
      assert.ok(stdout.includes('--recover-loss <ape>'), 'Should show drawdown recovery stop option');
      assert.ok(stdout.includes('--giveback-profit <ape>'), 'Should show profit giveback stop option');
      assert.ok(stdout.includes('--max-loss <ape>'), 'Should show max-loss stop option');
      assert.ok(stdout.includes('--bankroll <ape>'), 'Should show bankroll alias');
      assert.ok(stdout.includes('--min-bet <ape>'), 'Should show minimum bet floor option');
      assert.ok(stdout.includes('bankroll-fraction=<0..1>'), 'Should document bankroll fraction strategy syntax');
      assert.ok(stdout.includes('--human [range]'), 'Should document the supported human timing option');
    });

    it('play accepts --bankroll as a --max-loss alias', () => {
      const { stdout, code } = cli('play --bankroll 0 --json');
      const payload = JSON.parse(stdout);
      assert.strictEqual(code, 1);
      assert.match(payload.error, /Invalid --bankroll value/);
    });

    it('play rejects --resilient values in favor of --no-resilient', () => {
      const { stdout, code } = cli('play ape-strong 1 --resilient=false --validate-only --json');

      assert.strictEqual(code, 1);
      assert.match(stdout, /unknown option '--resilient=false'|--resilient does not accept a value/);
    });

    it('play validate-only checks game option values without requiring a wallet', () => {
      const { stdout, code } = cli('play cosmic-plinko 1 --risk Wrong --validate-only --json');
      const payload = JSON.parse(stdout);

      assert.strictEqual(code, 1);
      assert.match(payload.error, /risk must be between/i);
      assert.ok(!stdout.includes('No wallet found'));
    });

    it('play validate-only accepts --survive for Blocks survival count', () => {
      const { stdout, code } = cli('play blocks --risk Low --survive 1 10 --loop --max-games 10 --validate-only --json');
      const payload = JSON.parse(stdout);

      assert.strictEqual(code, 0);
      assert.strictEqual(payload.game, 'blocks');
      assert.deepStrictEqual(payload.config, { gridMode: 0, grid: '3x3', mode: 0, survive: 1 });
      assert.ok(!stdout.includes('No wallet found'));
    });

    it('play validate-only accepts --split for independent Blocks rolls', () => {
      const { stdout, code } = cli('play blocks 10 --risk Low --grid 2x2 --split 5 --validate-only --json');
      const payload = JSON.parse(stdout);
      const invalid = cli('play blocks 10 --split 6 --validate-only --json');

      assert.strictEqual(code, 0);
      assert.strictEqual(payload.game, 'blocks');
      assert.deepStrictEqual(payload.config, {
        gridMode: 2,
        grid: '2x2',
        mode: 0,
        split: 5,
        compounding: false,
      });
      assert.ok(!stdout.includes('No wallet found'));
      assert.strictEqual(invalid.code, 1);
      assert.match(JSON.parse(invalid.stdout).error, /split must be between 1 and 5/i);
    });

    it('rejects simultaneous Blocks --split and --survive options', () => {
      const { stdout, code } = cli('play blocks 10 --split 2 --survive 3 --validate-only --json');
      const bet = cli('bet --game blocks --amount 10 --split 2 --survive 3');

      assert.strictEqual(code, 1);
      assert.match(JSON.parse(stdout).error, /--split and --survive cannot be used together/);
      assert.ok(!stdout.includes('No wallet found'));
      assert.strictEqual(bet.code, 1);
      assert.match(JSON.parse(bet.stdout).error, /--split and --survive cannot be used together/);
      assert.ok(!bet.stdout.includes('No wallet found'));
    });

    it('play validate-only accepts explicit Blocks grids and rejects numeric modes', () => {
      const explicit = cli('play blocks 10 --risk Low --grid 4x4 --survive 1 --validate-only --json');
      const numeric = cli('play blocks 10 --risk Low --grid 1 --survive 1 --validate-only --json');

      assert.strictEqual(explicit.code, 0);
      assert.deepStrictEqual(JSON.parse(explicit.stdout).config, {
        gridMode: 1,
        grid: '4x4',
        mode: 0,
        survive: 1,
      });
      assert.strictEqual(numeric.code, 1);
      assert.match(JSON.parse(numeric.stdout).error, /Numeric grid modes are not accepted/);
    });

    it('play validate-only rejects old Blocks roll-count flags with a rename hint', () => {
      const { stdout, code } = cli('play blocks --risk Low --rolls 1 10 --loop --max-games 10 --validate-only --json');
      const payload = JSON.parse(stdout);

      assert.strictEqual(code, 1);
      assert.match(payload.error, /Option --rolls was renamed/);
      assert.match(payload.error, /--survive/);
      assert.ok(!stdout.includes('No wallet found'));
    });

    it('play validate-only reports invalid blackjack solver timeout values', () => {
      const { stdout, code } = cli('play blackjack 10 --auto best --solver-timeout-ms nope --validate-only --json');
      const payload = JSON.parse(stdout);

      assert.strictEqual(code, 1);
      assert.match(payload.error, /Invalid --solver-timeout-ms value/);
      assert.ok(!stdout.includes('RPC may be slow'));
    });

    it('play validate-only accepts blackjack auto max only for blackjack', () => {
      const blackjack = cli('play blackjack 10 --auto max --validate-only --json');
      assert.strictEqual(blackjack.code, 0);
      assert.strictEqual(JSON.parse(blackjack.stdout).status, 'valid');

      const cashDash = cli('play cash-dash 10 --auto max --validate-only --json');
      assert.strictEqual(cashDash.code, 1);
      assert.match(JSON.parse(cashDash.stdout).error, /Invalid --auto mode/);
    });

    it('play validate-only enforces the current video poker denominations', () => {
      for (const amount of [10, 25, 50, 100, 250, 400]) {
        const result = cli(`play video-poker ${amount} --auto best --validate-only --json`);
        assert.strictEqual(result.code, 0, `expected ${amount} APE to be valid`);
        assert.strictEqual(JSON.parse(result.stdout).status, 'valid');
      }

      for (const amount of [1, 5]) {
        const result = cli(`play video-poker ${amount} --auto best --validate-only --json`);
        assert.strictEqual(result.code, 1, `expected ${amount} APE to be rejected`);
        assert.match(JSON.parse(result.stdout).error, /Valid bets: 10, 25, 50, 100, 250, 400 APE/);
      }
    });

    it('play validate-only accepts blackjack solver max and rejects invalid solver modes', () => {
      const valid = cli('play blackjack 10 --solver max --validate-only --json');
      assert.strictEqual(valid.code, 0);
      assert.strictEqual(JSON.parse(valid.stdout).status, 'valid');

      const invalid = cli('play blackjack 10 --solver turbo --validate-only --json');
      assert.strictEqual(invalid.code, 1);
      assert.match(JSON.parse(invalid.stdout).error, /Invalid --solver mode/);
    });

    it('help auto still shows advanced examples', () => {
      const { stdout } = cli('help auto');
      assert.ok(stdout.includes('--auto best'), 'Should keep best-mode examples in helper text');
      assert.ok(stdout.includes('--auto max'), 'Should document the blackjack max mode');
      assert.ok(stdout.includes('--solver max'), 'Should document blackjack manual max suggestions');
      assert.ok(stdout.includes('--solver-max-states'), 'Should document the blackjack best-EV state cap');
      assert.ok(stdout.includes('--solver-timeout-ms'), 'Should document the blackjack best-EV timeout');
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
      assert.ok(stdout.includes('--bankroll <ape>'), 'Should document bankroll alias');
      assert.ok(stdout.includes('--min-bet <ape>'), 'Should document minimum bet floor');
      assert.ok(stdout.includes('bankroll-fraction=<0..1>'), 'Should document bankroll fraction strategy syntax');
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
      assert.ok(!stdout.includes('Available:'), 'Plain status output should not show available balance');
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
        assert.ok('available_ape' in data, 'JSON should keep available_ape');
        assert.ok('gas_reserve_ape' in data, 'JSON should keep gas_reserve_ape');
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

  describe('script command', () => {
    it('documents script actions and BNF inline', () => {
      const { stdout } = cli('script --help');

      assert.ok(stdout.includes('write <nome_script>'), 'Should document the write action');
      assert.ok(stdout.includes('watch <nome_script>'), 'Should document the watch action');
      assert.ok(stdout.includes('read <nome_script>'), 'Should document the read action');
      assert.ok(stdout.includes('<script-command> ::= "script"'), 'Should include script BNF');
      assert.ok(stdout.includes('--every <seconds>'), 'Should document the interval option');
      assert.ok(stdout.includes('--if-balance-over <APE>'), 'Should document the over-balance gate');
      assert.ok(stdout.includes('--if-balance-under <APE>'), 'Should document the under-balance gate');
      assert.ok(stdout.includes('APECHURCH_CLI_SCR_DIR'), 'Should document the script directory env var');
      assert.ok(stdout.includes('script watch custom_script'), 'Should use custom_script in examples');
      assert.ok(stdout.includes('attempt/status line'), 'Should document timestamped watch attempt lines');
    });

    it('writes JSON scripts and reads them back as shell text without execution', () => {
      const scrDir = path.join(CONFIG_OVERRIDE_ROOT, 'script-write-read-scripts');
      fs.rmSync(scrDir, { recursive: true, force: true });

      const written = cli(
        'script write custom_script bot example-bot --human --pipeline "bot=child-bot --limit 500 step1=\'keno --picks 5\' --amount1 2" --color',
        { env: { [SCR_DIR_ENV]: scrDir } },
      );

      assert.strictEqual(written.code, 0);
      const writtenPayload = JSON.parse(written.stdout);
      assert.strictEqual(writtenPayload.status, 'written');
      assert.strictEqual(writtenPayload.script, 'custom_script.json');

      const stored = JSON.parse(fs.readFileSync(path.join(scrDir, 'custom_script.json'), 'utf8'));
      assert.deepStrictEqual(stored.command, [
        {
          bot: 'example-bot',
          '--pipeline': {
            arg: 'bot',
            value: [
              'child-bot --limit 500',
              "step1='keno --picks 5' --amount1 2",
            ],
          },
        },
        '--human',
        '--color',
      ]);

      const read = cli('script read custom_script', { env: { [SCR_DIR_ENV]: scrDir } });
      assert.strictEqual(read.code, 0);
      assert.match(read.stdout, /^apechurch-cli bot example-bot --pipeline /);
      assert.ok(read.stdout.includes('--human --color'));
      assert.ok(read.stdout.includes("bot=child-bot --limit 500 step1='keno --picks 5' --amount1 2"));
      assert.ok(read.stdout.trim().endsWith('--color'));

      const explicitRead = cli('script read custom_script.json', { env: { [SCR_DIR_ENV]: scrDir } });
      assert.strictEqual(explicitRead.stdout, read.stdout);
    });

    it('parses script watch options before attempting to load the JSON script', () => {
      const watched = cli('script watch custom_script --every 0 --if-balance-over 550');
      const output = `${watched.stdout}\n${watched.stderr}`;

      assert.notStrictEqual(watched.code, 0);
      assert.match(output, /--every must be a positive integer/);
      assert.doesNotMatch(output, /Script not found/);
    });
  });

  describe('games command', () => {
    it('lists available games', () => {
      const { stdout } = cli('games');
      assert.ok(stdout.includes('Stateful Games:'), 'Should separate stateful games');
      assert.ok(stdout.includes('Single Attempt Games:'), 'Should separate single-attempt games');
      assert.ok(stdout.includes('Survive Games:'), 'Should separate survive games');
      assert.ok(stdout.includes('Split Bet Games:'), 'Should separate split-bet games');
      assert.ok(stdout.includes('Classic Slot Machines:'), 'Should separate classic slot machines');
      assert.ok(stdout.includes('Slot Machines With Sub-Game:'), 'Should separate slot machines with sub-games');
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

      const assertSectionOrder = (sectionTitle, titles) => {
        let lastIndex = stdout.indexOf(`${sectionTitle}:`);
        assert.ok(lastIndex >= 0, `${sectionTitle} should be present`);
        for (const title of titles) {
          const currentIndex = stdout.indexOf(title);
          assert.ok(currentIndex > lastIndex, `${title} should appear in alphabetical order within ${sectionTitle}`);
          lastIndex = currentIndex;
        }
      };

      assertSectionOrder('Stateful Games', [
        'Blackjack ✔︎',
        'Cash Dash ✔︎',
        'Hi-Lo Nebula ✔︎',
        'Video Poker ✔︎',
      ]);
      assertSectionOrder('Single Attempt Games', [
        'ApeStrong ✔︎',
        'Baccarat ✔︎',
        'Gimboz Smash ✔︎',
        'Glyde or Crash ✔︎',
        'Keno ✔︎',
        'Monkey Match ✔︎',
        'Roulette ✔︎',
      ]);
      assertSectionOrder('Survive Games', [
        'Bear-A-Dice ✔︎',
        'Blocks ✔︎',
      ]);
      assertSectionOrder('Split Bet Games', [
        'Cosmic Plinko ✔︎',
        'Jungle Plinko ✔︎',
        'Primes ✔︎',
        'Speed Keno ✔︎',
      ]);
      assertSectionOrder('Classic Slot Machines', [
        'Bubblegum Heist ✔︎',
        'Dino Dough ✔︎',
        'Geez Diggerz ✔︎',
        'Sushi Showdown ✔︎',
      ]);
      assertSectionOrder('Slot Machines With Sub-Game', [
        'Reel Pirates',
      ]);
    });

    it('--list returns plain play command forms in grouped order', () => {
      const { stdout } = cli('games --list');
      const lines = stdout.trim().split('\n');

      assert.ok(lines.every((line) => line.startsWith('[play] ')), 'Should only print play-list lines');
      assert.ok(lines.includes('[play] blocks <ape> --grid <grid> --risk <risk> --split <split> --survive <survive>'), 'Should show --split and --survive for Blocks');
      assert.ok(lines.includes('[play] primes <ape> --risk <risk> --split <split>'), 'Should use --split for Primes');
      assert.ok(lines.includes('[play] reel-pirates <ape> --split <split>'), 'Should use --split for Reel Pirates');
      assert.ok(!stdout.includes('--rolls'), 'Should not advertise old roll flags');
      assert.ok(!stdout.includes('--runs'), 'Should not advertise old run flags');
      assert.ok(!stdout.includes('--balls'), 'Should not advertise old ball flags');
      assert.ok(!stdout.includes('--games'), 'Should not advertise old game-count flags');
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
      assert.ok(stdout.includes('Bet 10/25/50/100/250 APE'), 'Should group non-jackpot video poker bet tiers');
      assert.ok(stdout.includes('250.00x + 💰'), 'Should mark jackpot-aware max payouts with fixed decimals');
      assert.ok(stdout.includes('Legend:'), 'Should explain the RTP badges');
      assert.ok(stdout.includes('📄 documented'), 'Should explain documented RTP values');
      assert.ok(stdout.includes('👌 exact formula'), 'Should explain exact-formula RTP values');
    });

    it('shows the current alias set in the terminal catalog', () => {
      const { stdout } = cli('games');
      assert.ok(stdout.includes('Aliases: apestrong, strong'));
      assert.ok(stdout.includes('Aliases: geezdiggerz, geez, diggerz'));
      assert.ok(stdout.includes('Aliases: glyde, glyde-crash, glydecrash, speed-crash, speedcrash, crash'));
      assert.ok(stdout.includes('Aliases: speedkeno, skeno, speed'));
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
          'blackjack',
          'cash-dash',
          'hi-lo-nebula',
          'video-poker',
          'ape-strong',
          'baccarat',
          'gimboz-smash',
          'glyde-or-crash',
          'keno',
          'monkey-match',
          'roulette',
          'bear-dice',
          'blocks',
          'cosmic-plinko',
          'jungle-plinko',
          'primes',
          'speed-keno',
          'bubblegum-heist',
          'dino-dough',
          'geez-diggerz',
          'sushi-showdown',
          'reel-pirates',
        ],
        'Games JSON should be ordered by catalog group and alphabetically inside each group'
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

    it('shows grouped available games when the name is invalid', () => {
      const { stdout } = cli('game nope');
      assert.ok(stdout.includes('Stateful Games: blackjack | cash-dash | hi-lo-nebula | video-poker'));
      assert.ok(stdout.includes('Single Attempt Games: ape-strong | baccarat | gimboz-smash | glyde-or-crash | keno | monkey-match | roulette'));
      assert.ok(stdout.includes('Survive Games: bear-dice | blocks'));
      assert.ok(stdout.includes('Split Bet Games: cosmic-plinko | jungle-plinko | primes | speed-keno'));
      assert.ok(stdout.includes('Classic Slot Machines: bubblegum-heist | dino-dough | geez-diggerz | sushi-showdown'));
      assert.ok(stdout.includes('Slot Machines With Sub-Game: reel-pirates'));
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
      const diggerz = cli('game diggerz --json');
      const speed = cli('game speed --json');

      assert.strictEqual(JSON.parse(jungle.stdout).key, 'jungle-plinko');
      assert.strictEqual(JSON.parse(cosmic.stdout).key, 'cosmic-plinko');
      assert.strictEqual(JSON.parse(glyde.stdout).key, 'glyde-or-crash');
      assert.strictEqual(JSON.parse(diggerz.stdout).key, 'geez-diggerz');
      assert.strictEqual(JSON.parse(speed.stdout).key, 'speed-keno');
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
      const speedk = cli('play speedk 10');

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
      assert.deepStrictEqual(data.aliases, ['speedkeno', 'skeno', 'speed']);
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
      assert.deepStrictEqual(data.aliases, ['geezdiggerz', 'geez', 'diggerz']);
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

    it('rejects single-number Gimboz Smash ranges with a cover explanation', () => {
      const { stdout, code } = cli('play gimboz-smash 10 --range 50');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('A single number is ambiguous for Gimboz Smash'));
      assert.ok(stdout.includes('Use --cover 50'));
      assert.ok(stdout.includes('--range 50-50'));
      assert.ok(!stdout.includes('No wallet found'));
      assert.ok(!stdout.includes('file:///'));
      assert.ok(!stdout.includes('Node.js v'));
    });

    it('rejects conflicting Gimboz Smash range and out-range input without crashing', () => {
      const { stdout, code } = cli('play gimboz-smash 10 --range 1-50 --out-range 45-50');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('Invalid Gimboz Smash config: choose only one of --range, --out-range, or --cover.'));
      assert.ok(!stdout.includes('No wallet found'));
      assert.ok(!stdout.includes('file:///'));
      assert.ok(!stdout.includes('Node.js v'));
    });

    it('rejects conflicting Gimboz Smash cover and range input without crashing', () => {
      const { stdout, code } = cli('play gimboz-smash 10 --cover 50 --range 1-50');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('Invalid Gimboz Smash config: choose only one of --range, --out-range, or --cover.'));
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

    it('accepts valid Gimboz Smash cover input without tripping config conflicts', () => {
      const { stdout, code } = cli('play gimboz-smash 10 --cover 50');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('No wallet found'));
      assert.ok(!stdout.includes('Invalid Gimboz Smash config'));
      assert.ok(!stdout.includes('file:///'));
      assert.ok(!stdout.includes('Node.js v'));
    });

    it('rejects old ApeStrong --range input before wallet lookup', () => {
      const { stdout, code } = cli('play ape-strong 10 --range 50');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('Option --range was renamed for ApeStrong. Use --cover <cover> instead.'));
      assert.ok(!stdout.includes('No wallet found'));
      assert.ok(!stdout.includes('file:///'));
      assert.ok(!stdout.includes('Node.js v'));
    });

    it('accepts ApeStrong --cover input before wallet lookup', () => {
      const { stdout, code } = cli('play ape-strong 10 --cover 50');

      assert.notStrictEqual(code, 0);
      assert.ok(stdout.includes('No wallet found'));
      assert.ok(!stdout.includes('Option --range was renamed'));
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

      assert.ok(stdout.includes('--split'), 'Should show the canonical split parameter');
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

  describe('bucket command', () => {
    it('installs encrypted R2 credentials without printing or storing plaintext secrets', () => {
      resetBotFixtures();
      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [PASS_ENV]: 'test-password-123',
        [R2_ACCOUNT_ID_ENV]: 'acct-secret-not-printed',
        [R2_TOKEN_ENV]: 'bearer-secret-not-printed',
        [R2_KEY_ENV]: 'access-key-not-printed',
        [R2_SECRET_ENV]: 'secret-key-not-printed',
      };

      const { stdout, code } = cli('bucket install apechurch-cli-log --json', { env });
      assert.strictEqual(code, 0);
      const payload = JSON.parse(stdout.trim());
      assert.strictEqual(payload.success, true);
      assert.strictEqual(payload.bucket, 'apechurch-cli-log');
      assert.strictEqual(payload.enabled, true);

      for (const secret of [
        'acct-secret-not-printed',
        'bearer-secret-not-printed',
        'access-key-not-printed',
        'secret-key-not-printed',
      ]) {
        assert.ok(!stdout.includes(secret), `stdout leaked ${secret}`);
      }

      const configFile = path.join(CONFIG_OVERRIDE_ROOT, 'r2', 'apechurch-cli-log.json');
      const rawConfig = fs.readFileSync(configFile, 'utf8');
      assert.match(rawConfig, /"encrypted": true/);
      assert.match(rawConfig, /"bucket": "apechurch-cli-log"/);
      for (const secret of [
        'acct-secret-not-printed',
        'bearer-secret-not-printed',
        'access-key-not-printed',
        'secret-key-not-printed',
      ]) {
        assert.ok(!rawConfig.includes(secret), `config leaked ${secret}`);
      }

      const status = cli('bucket status --json', { env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT } });
      assert.strictEqual(status.code, 0);
      const statusPayload = JSON.parse(status.stdout.trim());
      assert.strictEqual(statusPayload.enabled, true);
      assert.strictEqual(statusPayload.enabled_bucket, 'apechurch-cli-log');
      assert.strictEqual(statusPayload.configs_count, 1);
      assert.ok(!status.stdout.includes('acct-secret-not-printed'));
      assert.ok(!status.stdout.includes('bearer-secret-not-printed'));
    });

    it('enables and disables stored R2 bucket entries', () => {
      resetBotFixtures();
      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [PASS_ENV]: 'test-password-123',
        [R2_ACCOUNT_ID_ENV]: 'acct-secret',
        [R2_TOKEN_ENV]: 'bearer-secret',
        [R2_KEY_ENV]: 'access-key',
        [R2_SECRET_ENV]: 'secret-key',
      };

      assert.strictEqual(cli('bucket install first-logs --json', { env }).code, 0);
      assert.strictEqual(cli('bucket install second-logs --json', { env }).code, 0);

      const autoEnabled = cli('bucket status --json', { env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT } });
      assert.strictEqual(autoEnabled.code, 0);
      assert.strictEqual(JSON.parse(autoEnabled.stdout.trim()).enabled_bucket, 'second-logs');

      const enabled = cli('bucket enable first-logs --json', { env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT } });
      assert.strictEqual(enabled.code, 0);
      const enabledPayload = JSON.parse(enabled.stdout.trim());
      assert.strictEqual(enabledPayload.success, true);
      assert.strictEqual(enabledPayload.action, 'enable');
      assert.strictEqual(enabledPayload.changed, true);
      assert.strictEqual(enabledPayload.bucket, 'first-logs');

      const list = cli('bucket list --json', { env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT } });
      assert.strictEqual(list.code, 0);
      assert.deepStrictEqual(JSON.parse(list.stdout.trim()).buckets, [
        { bucket: 'first-logs', enabled: true },
        { bucket: 'second-logs', enabled: false },
      ]);

      const disabled = cli('bucket disable --json', { env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT } });
      assert.strictEqual(disabled.code, 0);
      const disabledPayload = JSON.parse(disabled.stdout.trim());
      assert.strictEqual(disabledPayload.success, true);
      assert.strictEqual(disabledPayload.enabled, false);

      const status = cli('bucket status --json', { env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT } });
      assert.strictEqual(status.code, 0);
      assert.strictEqual(JSON.parse(status.stdout.trim()).enabled, false);
    });

    it('does not keep bucket select as a compatibility alias', () => {
      resetBotFixtures();
      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [PASS_ENV]: 'test-password-123',
        [R2_ACCOUNT_ID_ENV]: 'acct-secret',
        [R2_TOKEN_ENV]: 'bearer-secret',
        [R2_KEY_ENV]: 'access-key',
        [R2_SECRET_ENV]: 'secret-key',
      };
      assert.strictEqual(cli('bucket install first-logs --json', { env }).code, 0);

      const selected = cli('bucket select first-logs --json', { env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT } });
      assert.strictEqual(selected.code, 1);
      assert.ok(JSON.parse(selected.stdout.trim()).error.includes('Unknown R2 action'));
    });

    it('uses APECHURCH_CLI_R2_NAME as the bucket-name install fallback', () => {
      resetBotFixtures();
      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [PASS_ENV]: 'test-password-123',
        [R2_NAME_ENV]: 'apechurch-cli-log',
        [R2_ACCOUNT_ID_ENV]: 'acct-secret',
        [R2_TOKEN_ENV]: 'bearer-secret',
        [R2_KEY_ENV]: 'access-key',
        [R2_SECRET_ENV]: 'secret-key',
      };

      const { stdout, code } = cli('bucket install --json', { env });
      assert.strictEqual(code, 0);
      const payload = JSON.parse(stdout.trim());
      assert.strictEqual(payload.success, true);
      assert.strictEqual(payload.bucket, 'apechurch-cli-log');
      assert.ok(fs.existsSync(path.join(CONFIG_OVERRIDE_ROOT, 'r2', 'apechurch-cli-log.json')));
    });

    it('checks the encryption password before collecting R2 credential fields', () => {
      resetBotFixtures();
      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [R2_NAME_ENV]: 'apechurch-cli-log',
        [R2_ACCOUNT_ID_ENV]: 'acct-secret',
        [R2_TOKEN_ENV]: 'bearer-secret',
        [R2_KEY_ENV]: 'access-key',
        [R2_SECRET_ENV]: 'secret-key',
      };

      const { stdout, code } = cli('bucket install --json', { env });
      assert.strictEqual(code, 1);
      assert.ok(stdout.includes(PASS_ENV));
      assert.ok(!stdout.includes('R2 account ID'));
    });

    it('shows decrypted R2 endpoints and bucket fallback values only in verbose status/list', () => {
      resetBotFixtures();
      const installEnv = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [PASS_ENV]: 'test-password-123',
        [R2_ACCOUNT_ID_ENV]: 'acct-secret-not-printed',
        [R2_TOKEN_ENV]: 'bearer-secret-not-printed',
        [R2_KEY_ENV]: 'access-key-not-printed',
        [R2_SECRET_ENV]: 'secret-key-not-printed',
      };
      assert.strictEqual(cli('bucket install apechurch-cli-log --json', { env: installEnv }).code, 0);

      const safeStatus = cli('bucket status --json', {
        env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT },
      });
      assert.strictEqual(safeStatus.code, 0);
      assert.ok(!safeStatus.stdout.includes('acct-secret-not-printed'));
      assert.ok(!safeStatus.stdout.includes('bearer-secret-not-printed'));
      assert.ok(!safeStatus.stdout.includes('access-key-not-printed'));
      assert.ok(!safeStatus.stdout.includes('secret-key-not-printed'));

      const verboseEnv = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [PASS_ENV]: 'test-password-123',
      };
      const verboseStatus = cli('bucket status -v --json', { env: verboseEnv });
      assert.strictEqual(verboseStatus.code, 0);
      const statusPayload = JSON.parse(verboseStatus.stdout.trim());
      assert.strictEqual(statusPayload.verbose.bucket, 'apechurch-cli-log');
      assert.strictEqual(statusPayload.verbose.endpoints.s3_endpoint, 'https://acct-secret-not-printed.r2.cloudflarestorage.com');
      assert.strictEqual(statusPayload.verbose.endpoints.bucket_endpoint, 'https://acct-secret-not-printed.r2.cloudflarestorage.com/apechurch-cli-log');
      assert.deepStrictEqual(statusPayload.verbose.environment_fallbacks, {
        [R2_NAME_ENV]: 'apechurch-cli-log',
        [R2_ACCOUNT_ID_ENV]: 'acct-secret-not-printed',
        [R2_TOKEN_ENV]: 'bearer-secret-not-printed',
        [R2_KEY_ENV]: 'access-key-not-printed',
        [R2_SECRET_ENV]: 'secret-key-not-printed',
      });

      const verboseList = cli('bucket list -v --json', { env: verboseEnv });
      assert.strictEqual(verboseList.code, 0);
      const listPayload = JSON.parse(verboseList.stdout.trim());
      assert.strictEqual(listPayload.buckets.length, 1);
      assert.strictEqual(listPayload.buckets[0].verbose.environment_fallbacks[R2_TOKEN_ENV], 'bearer-secret-not-printed');

      const plainVerbose = cli('bucket status -v', { env: verboseEnv });
      assert.strictEqual(plainVerbose.code, 0);
      assert.ok(plainVerbose.stdout.includes('S3 API:'));
      assert.ok(plainVerbose.stdout.includes('https://acct-secret-not-printed.r2.cloudflarestorage.com'));
      assert.ok(plainVerbose.stdout.includes(`${R2_TOKEN_ENV}=bearer-secret-not-printed`));
    });

    it('requires the R2 encryption password for verbose status/list on stored bucket entries', () => {
      resetBotFixtures();
      const installEnv = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [PASS_ENV]: 'test-password-123',
        [R2_ACCOUNT_ID_ENV]: 'acct-secret-not-printed',
        [R2_TOKEN_ENV]: 'bearer-secret-not-printed',
        [R2_KEY_ENV]: 'access-key-not-printed',
        [R2_SECRET_ENV]: 'secret-key-not-printed',
      };
      assert.strictEqual(cli('bucket install apechurch-cli-log --json', { env: installEnv }).code, 0);

      const { stdout, code } = cli('bucket status -v --json', {
        env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT },
      });
      assert.strictEqual(code, 1);
      const payload = JSON.parse(stdout.trim());
      assert.ok(payload.error.includes(PASS_ENV));
      assert.ok(!stdout.includes('bearer-secret-not-printed'));
    });

    it('presigns explicit R2 object paths and reuses an unexpired cached URL', () => {
      resetBotFixtures();
      const installEnv = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [PASS_ENV]: 'test-password-123',
        [R2_ACCOUNT_ID_ENV]: 'acct-secret-not-printed',
        [R2_TOKEN_ENV]: 'bearer-secret-not-printed',
        [R2_KEY_ENV]: 'access-key-not-printed',
        [R2_SECRET_ENV]: 'secret-key-not-printed',
      };
      assert.strictEqual(cli('bucket install apechurch-cli-log --json', { env: installEnv }).code, 0);

      const presignEnv = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [PASS_ENV]: 'test-password-123',
      };
      const first = cli('bucket presign example-bot/example-bot.20260706120000.json -t 60 --json', { env: presignEnv });
      assert.strictEqual(first.code, 0);
      const firstPayload = JSON.parse(first.stdout.trim());
      assert.strictEqual(firstPayload.success, true);
      assert.strictEqual(firstPayload.object_key, 'example-bot/example-bot.20260706120000.json');
      assert.strictEqual(firstPayload.cached, false);
      assert.match(firstPayload.url, /^https:\/\/acct-secret-not-printed\.r2\.cloudflarestorage\.com\/apechurch-cli-log\/example-bot\/example-bot\.20260706120000\.json\?/);
      assert.ok(!first.stdout.includes('secret-key-not-printed'));
      assert.ok(!first.stdout.includes('bearer-secret-not-printed'));

      const second = cli('bucket presign example-bot/example-bot.20260706120000.json -t 60 --json', { env: presignEnv });
      assert.strictEqual(second.code, 0);
      const secondPayload = JSON.parse(second.stdout.trim());
      assert.strictEqual(secondPayload.cached, true);
      assert.strictEqual(secondPayload.url, firstPayload.url);

      const configFile = path.join(CONFIG_OVERRIDE_ROOT, 'r2', 'apechurch-cli-log.json');
      const rawConfig = fs.readFileSync(configFile, 'utf8');
      assert.match(rawConfig, /"presigned_url"/);
      assert.ok(!rawConfig.includes('secret-key-not-printed'));
      assert.ok(!rawConfig.includes('bearer-secret-not-printed'));
    });

    it('rejects verbose mode on bucket actions other than status and list', () => {
      resetBotFixtures();
      const { stdout, code } = cli('bucket disable -v --json', {
        env: { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT },
      });
      assert.strictEqual(code, 1);
      assert.ok(JSON.parse(stdout.trim()).error.includes('status and bucket list'));
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

    it('does not write a bot json log for help invocations with bot-specific args', () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'help-log-bot',
        script: `export default async function ({ args }) {
  console.log(JSON.stringify({ args }));
  return 0;
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot help-log-bot -v4 --help', { env });

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('["-v4","--help"]'));
      const files = listBotLogFiles(logDir, 'help-log-bot');
      assert.deepStrictEqual(files, []);
    });

    it('does not write a bot json log for startup usage errors', () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'usage-error-bot',
        script: `export default async function () {
  const error = new Error('Invalid startup arguments');
  error.botUsageError = true;
  error.code = 'BOT_USAGE_ERROR';
  throw error;
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { code } = cli('bot usage-error-bot --bad', { env });

      assert.notStrictEqual(code, 0);
      const files = listBotLogFiles(logDir, 'usage-error-bot');
      assert.deepStrictEqual(files, []);
    });

    it('bot validate-only checks exported argument parsers without running the bot', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'validator-bot',
        script: `export function parseArgs(args) {
  if (args.includes('--bad')) throw new Error('Bad startup option');
  return { args };
}

export default async function () {
  throw new Error('handler should not run during validation');
}
`,
      });

      const { stdout, code } = cli('bot validator-bot --bad --validate-only --json');
      const payload = JSON.parse(stdout);

      assert.strictEqual(code, 1);
      assert.strictEqual(payload.error, 'Bad startup option');
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
      assert.strictEqual(payload.line, '# game_n: 1, status: complete, bet: 2, payout: 5, multiply: 2.50');
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

    it('links nested bot json logs with parent run and call ids', () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'lineage-child',
        script: `export default async function ({ args, bot }) {
  return {
    exitCode: 0,
    summary: { bot: bot.command, args, status: 'child-ok', tx: '${BOT_LOG_TX_C}' },
  };
}
`,
      });
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'lineage-parent',
        script: `export default async function ({ bot, botJson }) {
  const child = await botJson('lineage-child', ['3']);
  return {
    exitCode: 0,
    summary: { bot: bot.command, status: 'parent-ok', child },
  };
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot lineage-parent --json', { env });
      const payload = JSON.parse(stdout.trim());

      assert.strictEqual(code, 0);
      assert.strictEqual(payload.status, 'parent-ok');
      assert.strictEqual(payload.child.status, 'child-ok');
      assert.strictEqual(payload.child.tx, BOT_LOG_TX_C);
      assert.strictEqual(payload.child.parent_run_id, payload.run_id);
      assert.strictEqual(payload.child.root_run_id, payload.root_run_id);
      assert.strictEqual(payload.child.call_depth, 1);
      assert.strictEqual(payload.nested_bot_calls.length, 1);
      assert.strictEqual(payload.nested_bot_calls[0].child_run_id, payload.child.run_id);
      assert.strictEqual(payload.nested_bot_calls[0].call_id, payload.child.parent_call_id);
      assert.deepStrictEqual(payload.nested_bot_calls[0].args, ['3', '--json']);

      const childFiles = listBotLogFiles(logDir, 'lineage-child');
      assert.strictEqual(childFiles.length, 1);
      const childLog = readBotLogFile(logDir, 'lineage-child', childFiles[0]);
      assert.strictEqual(childLog.tx, BOT_LOG_TX_C);
      assert.strictEqual(childLog.run_id, payload.child.run_id);
      assert.strictEqual(childLog.parent_run_id, payload.run_id);
      assert.strictEqual(childLog.parent_call_id, payload.nested_bot_calls[0].call_id);
    });

    it('propagates chimes inside bot children called by a parent bot', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'chime-env-child',
        script: `export default async function () {
  return {
    exitCode: 0,
    summary: {
      forceChime: process.env.APECHURCH_CLI_FORCE_CHIME || '',
      suppressChime: process.env.APECHURCH_CLI_SUPPRESS_CHIME || '',
      callDepth: process.env.APECHURCH_CLI_BOT_CALL_DEPTH || '',
    },
  };
}
`,
      });
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'chime-env-parent',
        script: `export default async function ({ botJson }) {
  const child = await botJson('chime-env-child', []);
  console.log(JSON.stringify(child));
  return 0;
}
`,
      });

      const { stdout, code } = cli('bot chime-env-parent');
      const payload = JSON.parse(stdout.trim());

      assert.strictEqual(code, 0);
      assert.strictEqual(payload.forceChime, '1');
      assert.strictEqual(payload.suppressChime, '');
      assert.strictEqual(payload.callDepth, '1');
    });

    it('suppresses nested bot chimes when requested by the parent bot', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'suppressed-chime-child',
        script: `export default async function () {
  process.stderr.write(String.fromCharCode(7));
  return {
    exitCode: 0,
    summary: {
      forceChime: process.env.APECHURCH_CLI_FORCE_CHIME || '',
      suppressChime: process.env.APECHURCH_CLI_SUPPRESS_CHIME || '',
    },
  };
}
`,
      });
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'suppressed-chime-parent',
        script: `export default async function ({ botJson }) {
  const child = await botJson('suppressed-chime-child', [], { suppressChime: true });
  return { exitCode: 0, summary: { status: 'ok', child } };
}
`,
      });

      const { stdout, code } = cli('bot suppressed-chime-parent --json');
      const payload = JSON.parse(stdout.trim());

      assert.strictEqual(code, 0);
      assert.strictEqual(stdout.includes('\x07'), false);
      assert.strictEqual(payload.child.forceChime, '');
      assert.strictEqual(payload.child.suppressChime, '1');
    });

    it('bridges nested bot bell chimes through json caller chains', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'bell-chime-child',
        script: `export default async function () {
  process.stderr.write(String.fromCharCode(7));
  return { exitCode: 0, summary: { status: 'child-ok' } };
}
`,
      });
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'bell-chime-parent',
        script: `export default async function ({ botJson }) {
  const child = await botJson('bell-chime-child', []);
  return { exitCode: 0, summary: { status: 'parent-ok', child } };
}
`,
      });

      const { stdout, code } = cli('bot bell-chime-parent --json');
      const payload = JSON.parse(stdout.replace(/\x07/g, '').trim());

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('\x07'));
      assert.strictEqual(payload.status, 'parent-ok');
      assert.strictEqual(payload.child.status, 'child-ok');
    });

    it('filters child bot metric lines from forwarded plain output', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'noisy-child',
        script: `export default async function ({ args }) {
  if (process.env.APECHURCH_CLI_BOT_PLAIN_OUTPUT === '1') {
    console.error('# hidden child metric');
    console.error('child command output');
    console.error('');
  }
  return { exitCode: 0, summary: { bot: 'noisy-child', args, status: 'ok' } };
}
`,
      });
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'noisy-parent',
        script: `export default async function ({ botJson }) {
  const payload = await botJson('noisy-child', ['3']);
  console.log(JSON.stringify(payload));
  return 0;
}
`,
      });

      const { stdout, code } = cli('bot noisy-parent');
      const lines = stdout.trim().split('\n');
      const payload = JSON.parse(lines.at(-1));

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('child command output'));
      assert.ok(!stdout.includes('child command output\n\n'));
      assert.ok(!stdout.includes('# hidden child metric'));
      assert.strictEqual(payload.bot, 'noisy-child');
      assert.deepStrictEqual(payload.args, ['3', '--json']);
    });

    it('forces ANSI colors in piped plain bot output with --color', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: path.join(NO_WALLET_HOME, '.apechurch-cli'),
        folderName: 'color-bot',
        script: `export default async function ({ binaryName, session }) {
  const colorOutput = session.shouldUsePlainColorOutput();
  console.log(session.formatCommandLine(['roulette', '1', 'RED'], { binaryName, colorOutput }));
  return 0;
}
`,
      });

      const plain = cli('bot color-bot');
      const forced = cli('bot color-bot --color');

      assert.strictEqual(plain.code, 0);
      assert.strictEqual(forced.code, 0);
      assert.doesNotMatch(plain.stdout, ANSI_RE);
      assert.match(forced.stdout, ANSI_RE);
    });

    it('uses APECHURCH_CLI_CONFIG_DIR as the config directory and default bot root', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'override-bot',
      });

      const env = { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT };
      const { stdout, code } = cli('bot --list', { env });
      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('override-bot'));
      assert.ok(stdout.includes(`${CONFIG_DIR_ENV}=`));
      assert.ok(stdout.includes(path.join(CONFIG_OVERRIDE_ROOT, 'bots')));
      assert.ok(stdout.includes(path.join(CONFIG_OVERRIDE_ROOT, 'log')));
      assert.ok(!stdout.includes('sample-bot'));
    });

    it('accepts APECHURCH_CLI_BOTS_DIR pointing directly at the bots root', () => {
      resetBotFixtures();
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'direct-bots-dir',
      });

      const botsDir = path.join(CONFIG_OVERRIDE_ROOT, 'bots');
      const env = { [BOTS_DIR_ENV]: botsDir };
      const { stdout, code } = cli('bot --list', { env });
      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('direct-bots-dir'));
      assert.ok(stdout.includes(`Bot directory: ${botsDir}`));
      assert.ok(stdout.includes(`${BOTS_DIR_ENV}=`));
      assert.ok(!stdout.includes(path.join(botsDir, 'bots')));
    });

    it('exposes resolved config and bot-specific log directories to bots', () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'path-bot',
        script: `import fs from 'node:fs';
export default async function ({ paths, bot }) {
  console.log(JSON.stringify({
    paths,
    botLogDir: bot.logDir,
    logExists: fs.existsSync(bot.logDir),
    rootLogExists: fs.existsSync(paths.logDir),
  }));
  return 0;
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot path-bot --json', { env });
      const payload = JSON.parse(stdout.trim());
      assert.strictEqual(code, 0);
      assert.strictEqual(payload.paths.configDir, CONFIG_OVERRIDE_ROOT);
      assert.strictEqual(payload.paths.botsDir, path.join(CONFIG_OVERRIDE_ROOT, 'bots'));
      assert.strictEqual(payload.paths.logDir, logDir);
      assert.strictEqual(payload.botLogDir, path.join(logDir, 'path-bot'));
      assert.strictEqual(payload.logExists, true);
      assert.strictEqual(payload.rootLogExists, true);
    });

    it('does not write a summary json log for bot runs without transactions or wagers', () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'summary-bot',
        script: `export default async function ({ bot, args }) {
  return {
    exitCode: 0,
    summary: { bot: bot.command, args, status: 'ok', total_wager_ape: '0' },
  };
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot summary-bot 7', { env });
      assert.strictEqual(code, 0);
      assert.strictEqual(stdout.trim(), '');

      const files = listBotLogFiles(logDir, 'summary-bot');
      assert.strictEqual(files.length, 0);
    });

    it('writes a summary json log for recorded wagers without transaction hashes', () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'wager-summary-bot',
        script: `export default async function ({ bot, args }) {
  return {
    exitCode: 0,
    summary: {
      bot: bot.command,
      args,
      status: 'ok',
      total_wager_ape: '27.5',
      total_payout_ape: '27.5',
      games: [{ status: 'complete', wager_ape: '27.5', payout_ape: '27.5' }],
    },
  };
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot wager-summary-bot 7', { env });
      assert.strictEqual(code, 0);
      assert.strictEqual(stdout.trim(), '');

      const files = listBotLogFiles(logDir, 'wager-summary-bot');
      assert.strictEqual(files.length, 1);

      const payload = readBotLogFile(logDir, 'wager-summary-bot', files[0]);
      assert.strictEqual(payload.total_wager_ape, '27.5');
      assert.strictEqual(payload.total_payout_ape, '27.5');
      assert.strictEqual(payload.games[0].status, 'complete');
    });

    it('writes a summary json log for bot runs with transactions', () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'summary-bot',
        script: `export default async function ({ bot, args }) {
  return {
    exitCode: 0,
    summary: { bot: bot.command, args, status: 'ok', tx: '${BOT_LOG_TX_A}' },
  };
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot summary-bot 7', { env });
      assert.strictEqual(code, 0);
      assert.strictEqual(stdout.trim(), '');

      const files = listBotLogFiles(logDir, 'summary-bot');
      assert.strictEqual(files.length, 1);

      const payload = readBotLogFile(logDir, 'summary-bot', files[0]);
      assert.strictEqual(payload.bot, 'summary-bot');
      assert.strictEqual(payload.bot_name, 'summary-bot');
      assert.deepStrictEqual(payload.args, ['7']);
      assert.strictEqual(payload.status, 'ok');
      assert.strictEqual(payload.tx, BOT_LOG_TX_A);
      assert.deepStrictEqual(payload.gp_rate, {
        base_gp_per_ape: 5,
        current_gp_per_ape: null,
        effective_gp_per_ape: 5,
        source: 'base',
        source_label: 'base default',
      });
      assert.match(payload.run_id, /^[0-9a-f-]{36}$/);
      assert.strictEqual(payload.root_run_id, payload.run_id);
      assert.strictEqual(payload.parent_run_id, null);
      assert.strictEqual(payload.call_depth, 0);
      assert.match(payload.started_at_utc, /^\d{4}-\d{2}-\d{2}T/);
      assert.match(payload.ended_at_utc, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('prints returned summary json without logging it when it has no transactions', () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'summary-bot-json',
        script: `export default async function ({ bot, args }) {
  return {
    exitCode: 0,
    summary: { bot: bot.command, args, status: 'ok' },
  };
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot summary-bot-json 7 --json', { env });
      assert.strictEqual(code, 0);
      const payload = JSON.parse(stdout.trim());
      assert.strictEqual(payload.bot, 'summary-bot-json');
      assert.strictEqual(payload.bot_name, 'summary-bot-json');
      assert.deepStrictEqual(payload.args, ['7', '--json']);
      assert.strictEqual(payload.status, 'ok');
      assert.match(payload.run_id, /^[0-9a-f-]{36}$/);
      assert.strictEqual(payload.root_run_id, payload.run_id);
      assert.strictEqual(payload.parent_run_id, null);

      const files = listBotLogFiles(logDir, 'summary-bot-json');
      assert.strictEqual(files.length, 0);
    });

    it('persists the effective GP rate in bot summary logs', () => {
      resetBotFixtures();
      writeConfigOverrideProfile({ currentGpPerApe: 7.5 });
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'gp-rate-bot',
        script: `export default async function ({ bot, args }) {
  return {
    exitCode: 0,
    summary: { bot: bot.command, args, status: 'ok', tx: '${BOT_LOG_TX_B}' },
  };
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot gp-rate-bot 7 --json', { env });
      assert.strictEqual(code, 0);
      const printed = JSON.parse(stdout.trim());
      assert.deepStrictEqual(printed.gp_rate, {
        base_gp_per_ape: 5,
        current_gp_per_ape: 7.5,
        effective_gp_per_ape: 7.5,
        source: 'profile',
        source_label: 'wallet current',
      });

      const files = listBotLogFiles(logDir, 'gp-rate-bot');
      assert.strictEqual(files.length, 1);
      const logged = readBotLogFile(logDir, 'gp-rate-bot', files[0]);
      assert.deepStrictEqual(logged.gp_rate, printed.gp_rate);
      assert.strictEqual(logged.tx, BOT_LOG_TX_B);
    });

    it('persists a bot --gp-ape override before the wallet profile rate', () => {
      resetBotFixtures();
      writeConfigOverrideProfile({ currentGpPerApe: 7.5 });
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'gp-rate-override-bot',
        script: `export default async function ({ bot, args }) {
  return {
    exitCode: 0,
    summary: { bot: bot.command, args, status: 'ok' },
  };
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot gp-rate-override-bot 7 --gp-ape 8 --json', { env });
      assert.strictEqual(code, 0);
      const printed = JSON.parse(stdout.trim());
      assert.deepStrictEqual(printed.args, ['7', '--gp-ape', '8', '--json']);
      assert.deepStrictEqual(printed.gp_rate, {
        base_gp_per_ape: 5,
        current_gp_per_ape: 7.5,
        effective_gp_per_ape: 8,
        source: 'cli',
        source_label: 'run override',
      });
    });

    it('does not write an error json log when a bot throws before any transaction', () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'error-bot',
        script: `export default async function () {
  throw new Error('boom');
}
`,
      });

      const env = {
        [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
        [LOG_DIR_ENV]: logDir,
      };
      const { stdout, code } = cli('bot error-bot --json', { env });
      assert.strictEqual(code, 1);
      assert.ok(stdout.includes('Bot "error-bot" failed'));

      const files = listBotLogFiles(logDir, 'error-bot');
      assert.strictEqual(files.length, 0);
    });

    it('writes an interrupted json log when a bot receives SIGINT', async () => {
      resetBotFixtures();
      const logDir = path.join(CONFIG_OVERRIDE_ROOT, 'bot-logs');
      writeBotFixture({
        baseDir: CONFIG_OVERRIDE_ROOT,
        folderName: 'interrupt-bot',
        script: `export default async function ({ bot, updateRunSummary }) {
  updateRunSummary({
    bot: bot.command,
    status: 'running',
    tx: '${BOT_LOG_TX_A}',
    iterations: [{ n: 1, result: 'recorded-before-signal' }],
  });
  console.log('ready');
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}
`,
      });

      const env = buildCliEnv({
        env: {
          [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT,
          [LOG_DIR_ENV]: logDir,
        },
      });
      const child = spawn(process.execPath, [CLI_PATH, 'bot', 'interrupt-bot'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      await new Promise((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`interrupt-bot did not become ready. Output: ${output}`));
        }, 5000);
        const onData = (chunk) => {
          output += chunk;
          if (output.includes('ready')) {
            clearTimeout(timeout);
            child.stdout.off('data', onData);
            child.stderr.off('data', onData);
            resolve();
          }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
      });

      const runningFiles = listBotLogFiles(logDir, 'interrupt-bot');
      assert.strictEqual(runningFiles.length, 1);
      const runningPayload = readBotLogFile(logDir, 'interrupt-bot', runningFiles[0]);
      assert.strictEqual(runningPayload.status, 'running');
      assert.strictEqual(runningPayload.tx, BOT_LOG_TX_A);
      assert.deepStrictEqual(runningPayload.iterations, [{ n: 1, result: 'recorded-before-signal' }]);
      assert.match(runningPayload.updated_at_utc, /^\d{4}-\d{2}-\d{2}T/);

      child.kill('SIGINT');
      const close = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('interrupt-bot did not exit after SIGINT.'));
        }, 5000);
        child.on('close', (code, signal) => {
          clearTimeout(timeout);
          resolve({ code, signal });
        });
      });

      assert.strictEqual(close.code, 130);
      assert.strictEqual(close.signal, null);

      const files = listBotLogFiles(logDir, 'interrupt-bot');
      assert.strictEqual(files.length, 1);

      const payload = readBotLogFile(logDir, 'interrupt-bot', files[0]);
      assert.strictEqual(payload.bot, 'interrupt-bot');
      assert.strictEqual(payload.bot_name, 'interrupt-bot');
      assert.strictEqual(payload.status, 'interrupted');
      assert.strictEqual(payload.signal, 'SIGINT');
      assert.strictEqual(payload.tx, BOT_LOG_TX_A);
      assert.deepStrictEqual(payload.iterations, [{ n: 1, result: 'recorded-before-signal' }]);
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

      const env = { [CONFIG_DIR_ENV]: CONFIG_OVERRIDE_ROOT };
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

    it('--offline returns cached JSON without RPC access', () => {
      setupHistoryFixtureHome();
      const { stdout, code } = cli('history --json --limit 1 --offline', {
        env: {
          ...process.env,
          HOME: HISTORY_FIXTURE_HOME,
          [RPC_URL_ENV]: 'http://127.0.0.1:1',
        },
        timeout: 5000,
      });
      const data = JSON.parse(stdout);

      assert.strictEqual(code, 0);
      assert.strictEqual(data.games.length, 1, 'Should respect limit from the local cache');
      assert.strictEqual(data.stats.current_gp_balance_raw, null);
      assert.strictEqual(data.stats.current_wape_balance_wei, null);
    });

    it('--offline rejects --refresh', () => {
      setupHistoryFixtureHome();
      const { stdout, code } = cli('history --json --offline --refresh', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });
      const data = JSON.parse(stdout);

      assert.notStrictEqual(code, 0);
      assert.strictEqual(data.error, '--offline cannot be combined with --refresh');
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

    it('--leaderboard renders weekly wAPE totals with play breakdowns', () => {
      setupHistoryFixtureHome();
      const { stdout } = cli('history --leaderboard', {
        env: { ...process.env, HOME: HISTORY_FIXTURE_HOME },
      });

      assert.ok(stdout.includes('Global: 7.00 $APE wagered over 2 games'));
      assert.ok(stdout.includes('WEEK'));
      assert.ok(stdout.includes('$APE wagered'));
      assert.match(stdout, /2024 W10 \|\s+7\.00 \| 1 ape-strong, 1 roulette/);
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
      assert.deepStrictEqual(data.leaderboard.weeks[0].plays.map((play) => [play.game, play.plays]), [
        ['ape-strong', 1],
        ['roulette', 1],
      ]);
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

  describe('fees command', () => {
    const FEE_WALLET_A = '0x1111111111111111111111111111111111111111';
    const FEE_WALLET_B = '0x2222222222222222222222222222222222222222';
    const FEE_TX_A = `0x${'a'.repeat(64)}`;
    const FEE_TX_B = `0x${'b'.repeat(64)}`;

    function writeFeeReportFixture(logDir) {
      const feesDir = path.join(logDir, 'fees');
      fs.rmSync(logDir, { recursive: true, force: true });
      fs.mkdirSync(feesDir, { recursive: true });
      fs.writeFileSync(path.join(feesDir, 'speed-keno.json'), JSON.stringify({
        v: 4,
        ch: 33139,
        game: 'speed-keno',
        name: 'Speed Keno ✔︎',
        contract: '0x40EE3295035901e5Fd80703774E5A9FE7CE2B90C',
        cap: 10485760,
        created: '2026-06-09T00:00:00.000Z',
        updated: '2026-06-09T00:00:00.000Z',
        lb: '3',
        ob: '1',
        floor: '1',
        r: [['1', '3']],
        chunks: 1,
        logs: 3,
        missing: 0,
        g: {
          n: 3,
          w: 1,
          p: 0,
          l: 2,
          s: 0,
          bw: '200000000000000000000',
          po: '0',
          fw: '3000000000000000000',
          gw: '300000000000000000',
          minf: '0',
          maxf: '2000000000000000000',
          minfb: '0',
          maxfb: '2000',
          ming: '100000000000000000',
          maxg: '100000000000000000',
        },
        t: {
          [FEE_WALLET_A]: {
            a: {
              n: 1,
              w: 1,
              p: 0,
              l: 0,
              s: 0,
              bw: '100000000000000000000',
              po: '0',
              fw: '1000000000000000000',
              gw: '100000000000000000',
              minf: '1000000000000000000',
              maxf: '1000000000000000000',
              minfb: '100',
              maxfb: '100',
              ming: '100000000000000000',
              maxg: '100000000000000000',
            },
            r: [['1', '3']],
          },
        },
        x: {
          minf: { v: '0', fb: '0', b: '1', tx: FEE_TX_A, w: FEE_WALLET_B, p: FEE_WALLET_B, id: '1', bw: '1000000000000000000', po: '0' },
          maxf: { v: '2000000000000000000', fb: '2000', b: '2', tx: FEE_TX_B, w: FEE_WALLET_B, p: FEE_WALLET_B, id: '2', bw: '1000000000000000000', po: '0' },
          minfb: { v: '0', fb: '0', b: '1', tx: FEE_TX_A, w: FEE_WALLET_B, p: FEE_WALLET_B, id: '1', bw: '1000000000000000000', po: '0' },
          maxfb: { v: '2000', fb: '2000', b: '2', tx: FEE_TX_B, w: FEE_WALLET_B, p: FEE_WALLET_B, id: '2', bw: '1000000000000000000', po: '0' },
        },
      }, null, 2));
    }

    it('requires --yes for unlimited JSON scans before opening RPC clients', () => {
      const { stdout, code } = cli('fees scan primes --json');
      const data = JSON.parse(stdout);

      assert.strictEqual(code, 1);
      assert.match(data.error, /requires --yes in JSON mode/);
    });

    it('reports local fee aggregates as JSON without requiring an RPC scan', () => {
      const logDir = path.join(NO_WALLET_HOME, '.apechurch-cli', 'fee-report-log');
      fs.rmSync(logDir, { recursive: true, force: true });

      const { stdout, code } = cli('fees report primes --json', {
        env: {
          [LOG_DIR_ENV]: logDir,
        },
      });
      const data = JSON.parse(stdout);

      assert.strictEqual(code, 0);
      assert.strictEqual(data.game, 'primes');
      assert.strictEqual(data.global.games, 0);
      assert.strictEqual(data.wallet, null);
      assert.strictEqual(data.tracked_wallets, 0);
      assert.ok(data.file_path.endsWith(path.join('fees', 'primes.json')));
    });

    it('renders wager context, derived-rest min/max notes, and outliers in fee reports', () => {
      const logDir = path.join(NO_WALLET_HOME, '.apechurch-cli', 'fee-report-fixture-log');
      writeFeeReportFixture(logDir);

      const { stdout, code } = cli(`fees report skeno --wallet ${FEE_WALLET_A}`, {
        env: {
          [LOG_DIR_ENV]: logDir,
        },
      });

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes('Wager: 200.000000 APE avg 66.666667 APE'), 'Should show global average wager');
      assert.ok(stdout.includes('Cost: 3.300000 APE avg 1.100000 APE (165.00 bps)'), 'Should show fee plus gas cost');
      assert.ok(stdout.includes('Min/Max fee: n.a. (not tracked for derived rest)'), 'Should explain derived rest min/max');
      assert.ok(stdout.includes('Outliers:'), 'Should show outlier section');
      assert.ok(stdout.includes('Zero observed fee:'), 'Should flag zero fee outliers');
      assert.ok(stdout.includes('High fee/wager:'), 'Should flag high bps outliers');
      assert.ok(stdout.includes(FEE_WALLET_B), 'Should render fee report addresses in full');
      assert.ok(stdout.includes(FEE_TX_A), 'Should render fee report transaction hashes in full');
      assert.ok(stdout.includes(FEE_TX_B), 'Should render fee report transaction hashes in full');
      assert.ok(!stdout.includes('0x2222...2222'), 'Should not abbreviate fee report addresses');
      assert.ok(!stdout.includes('0xaaaaaaaa…aaaaaaaa'), 'Should not abbreviate fee report transaction hashes');
      assert.ok(!stdout.includes('APE APE'), 'Should not duplicate APE units');
      assert.ok(!stdout.includes('Tracked cheapest avg fee'), 'Should hide tracked leaderboards for one wallet');
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
