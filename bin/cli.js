#!/usr/bin/env node
/**
 * @fileoverview Ape Church CLI - Main entry point
 *
 * Command-line interface for Ape Church on-chain casino on ApeChain.
 * Enables automated and manual gameplay, wallet management, and account operations.
 *
 * Architecture:
 * - All game logic, utilities, and helpers are modularized in lib/
 * - This file contains command definitions and CLI orchestration
 * - Uses Commander.js for CLI argument parsing
 *
 * Commands:
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SETUP & CONFIGURATION                                                   │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ install          Setup the Ape Church Agent (wallet + profile)          │
 * │ uninstall        Remove all Ape Church data from this machine           │
 * │ wallet [action]  Wallet management + per-wallet history download       │
 * │ bucket [action]  Encrypted R2 bot log mirror configuration             │
 * │ profile <action> Profile management (show, set username/persona)        │
 * │ register         Register username on-chain via SIWE                    │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ GAMEPLAY                                                                │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ play [game] [amt] Play stateless/stateful games (supports --loop)       │
 * │ bot [name] [args] Run a private gameplay bot via external files         │
 * │ bet              Quick manual bet on a specific stateless game          │
 * │ blackjack <amt>   Interactive blackjack (stateful, multi-step)          │
 * │ cash-dash <amt>   Interactive Cash Dash (stateful, multi-step)          │
 * │ hi-lo-nebula <amt> Interactive Hi-Lo Nebula (stateful, multi-step)      │
 * │ video-poker <amt> Interactive video poker (stateful, multi-step)        │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ INFORMATION                                                             │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ status           Show wallet balance and local state                    │
 * │ history          Read cached per-wallet history, games, stats, scores  │
 * │ scoreboard       Read cached per-wallet leaderboards from history       │
 * │ games            List all available games                               │
 * │ game <name>      Detailed info about a specific game                    │
 * │ commands         Full help reference for all commands                   │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ TRANSFERS & STAKING                                                     │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ send <asset> <amt> <to>  Send APE or GP to another address              │
 * │ house <action>   The House: deposit/withdraw/status (be the house)      │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ CONTESTS                                                                │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ contest          View and join agent competitions                       │
 * │ pause / continue Control autonomous play for contests                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Data Storage:
 * - wallets/current.json - Current wallet selector, no private key material
 * - wallets/<address>.json - Selectable encrypted wallet entries
 * - profiles/         - Per-wallet usernames, persona, preferences
 * - states/           - Per-wallet local stats and betting state
 * - history/          - Per-wallet cached game histories and sync state
 * - scores/           - Per-wallet top multipliers and biggest payouts
 * - games/            - Per-wallet unfinished stateful games
 *
 * @module bin/cli
 * @see {@link https://ape.church} - Ape Church website
 * @see {@link https://docs.ape.church} - Documentation
 */
import { Command, Option } from 'commander';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import updateNotifier from 'update-notifier';

// Check for updates (async, non-blocking, cached for 1 day)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const shouldShowUpdateNotifier = process.stdout.isTTY && process.stderr.isTTY && !process.argv.includes('--json');
const notifier = shouldShowUpdateNotifier
  ? updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 })
  : null;
import readline from 'readline';
import { formatEther, isAddress, parseEther } from 'viem';

// --- Local modules ---
import {
  APECHURCH_DIR,
  BOTS_DIR_ENV_VAR,
  LOG_DIR,
  LOG_DIR_ENV_VAR,
  SKILL_TARGET_DIR,
  WALLET_FILE,
  GAS_RESERVE_APE,
  CONTEST_REGISTER_CONTRACT,
  USER_INFO_CONTRACT,
  CONTEST_ENTRY_FEE,
  CONTEST_WAGER_LIMIT,
  CONTEST_END_DATE,
  REGISTER_AGENT_ABI,
  USER_INFO_ABI,
  WAPE_TOKEN_CONTRACT,
  WALLETS_DIR,
  GP_TOKEN_CONTRACT,
  GP_TOKEN_ABI,
  GP_DECIMALS,
  GP_PER_LEVEL,
  GP_PER_APE,
  HOUSE_CONTRACT,
  HOUSE_ABI,
  HOUSE_LOCK_TIME,
  HOUSE_WITHDRAW_FEE,
  BLACKJACK_CONTRACT,
  CASH_DASH_CONTRACT,
  HI_LO_NEBULA_CONTRACT,
  PACKAGE_NAME,
  BINARY_NAME,
  CONFIG_DIR_ENV_VAR,
  FORCE_CHIME_ENV_VAR,
  FORCE_COLOR_ENV_VAR,
  NO_COLOR_ENV_VAR,
  PASS_ENV_VAR,
  PROFILE_URL_ENV_VAR,
  PRIVATE_KEY_ENV_VAR,
  R2_ACCOUNT_ID_ENV_VAR,
  R2_DIR,
  R2_KEY_ENV_VAR,
  R2_NAME_ENV_VAR,
  R2_PREFIX_ENV_VAR,
  R2_SECRET_ENV_VAR,
  R2_TOKEN_ENV_VAR,
  RPC_URL_ENV_VAR,
  SUPPRESS_VERSION_BANNER_ENV_VAR,
  VIDEO_POKER_CONTRACT,
  ZERO_ADDRESS,
} from '../lib/constants.js';
import {
  sanitizeError,
  formatApeAmount,
  ensureDir,
  addBigIntStrings,
  clampRange,
  ensureIntRange,
  randomIntInclusive,
  parseNonNegativeInt,
} from '../lib/utils.js';
import { queueWinChimeFromWei } from '../lib/chime.js';
import {
  createLoopStats,
  formatBalanceSnapshot,
  formatLoopGameCompletion,
  formatLoopProgress,
  recordLoopGame,
} from '../lib/loop-stats.js';
import {
  createLoopTerminalState,
  deriveLoopLossControls,
  formatLoopTerminalConditionMessage,
  getBalanceLoopTerminalCondition,
  getRemainingBankrollApe,
  getSingleGameLoopTerminalCondition,
  parseLoopTerminalOptions,
} from '../lib/loop-conditions.js';
import {
  getWallet,
  walletExists,
  createClients,
  getBalanceWithRetry,
  loadWalletData,
  isWalletEncrypted,
  getWalletHints,
  setWalletHints,
  createEncryptedWalletFromPrivateKey,
  rotateEncryptedWalletPassword,
  getConfiguredPrivateKey,
  getWalletAddress,
  getWalletPublicMetadata,
  findStoredWallet,
  listStoredWallets,
  selectStoredWallet,
  promptSecret,
} from '../lib/wallet.js';
import {
  loadProfile,
  saveProfile,
  loadState,
  saveState,
  loadHistory,
  saveHistory,
  getHistoryFilePath,
  registerUsername,
  generateUsername,
  normalizeUsername,
  normalizeStrategy,
  normalizeGpPerApe,
  resolveGpPerApe,
  resolveGpPerApeInfo,
  formatGpPerApeValue,
  formatGpPerApeNotice,
  listHistoryWalletAddresses,
  getActiveGames,
  saveActiveGames,
  loadActiveGames,
  ensureWalletScopedData,
} from '../lib/profile.js';
import {
  getScoreFilePath,
  listScoreWalletAddresses,
  saveScoresFromHistory,
} from '../lib/scores.js';
import {
  getStrategyConfig,
  applyProfileOverrides,
  calculateWager,
  selectGameAndConfig,
  computeCooldownMs,
} from '../lib/strategy.js';
import { configGetters, playGame, resolveGame } from '../lib/games/index.js';
import { parseBaccaratBet } from '../lib/games/baccarat.js';
import { resolveBearDiceConfig } from '../lib/games/beardice.js';
import { parseGimbozSmashInput } from '../lib/games/gimbozsmash.js';
import { parseRouletteBets } from '../lib/games/roulette.js';
import { resolveSlotsConfig } from '../lib/games/slots.js';
import {
  getGameConfigCliName,
  getGameConfigDisplayDefault,
  getGameConfigDisplayRange,
  getGameOptionLabel,
  parseGameConfigValue,
} from '../lib/game-config.js';
import {
  GAME_REGISTRY,
  listGames,
  getGameDisplayName,
  resolveGameDisplayName,
  stripAbiVerifiedSymbol,
} from '../registry.js';
import {
  calculateNextBet,
  getBankrollFractionRuntimeError,
  getBetStrategyUsageError,
  getStrategyNames,
  isBankrollFractionStrategy,
  isBankrollFractionStrategyName,
  listStrategies,
  resolveStrategy,
} from '../lib/strategies/index.js';
import {
  buildHistoryWapeLeaderboard,
  fetchSavedHistoryEntries,
  resolveHistoryGameName,
  selectHistoryGames,
} from '../lib/history.js';
import {
  buildHistoryGameStatusSummary,
  summarizeUnfinishedGames,
} from '../lib/status.js';
import {
  downloadWalletHistory,
  inferSavedHistoryGameVariants,
  readCurrentHistoryBalances,
  summarizeHistoryGames,
  summarizeHistoryGamesByGame,
  DEFAULT_HISTORY_SYNC_CHUNK_SIZE,
} from '../lib/wallet-analysis.js';
import {
  buildFeeReport,
  DEFAULT_FEE_ANALYSIS_CAP_BYTES,
  DEFAULT_FEE_ANALYSIS_CHUNK_SIZE,
  DEFAULT_FEE_ANALYSIS_MAX_CHUNKS,
  scanGameFees,
} from '../lib/fee-analysis.js';
import {
  theme,
  formatPnL,
  formatBalance,
  formatAmount,
  formatOutcomeIcon,
  formatNetProfitLabel,
  formatField,
  formatYesNo,
  formatHeader,
  formatAddress,
  formatHistoryLine,
  forceColorOutput,
} from '../lib/theme.js';
import { fitAnsiText, getVisibleWidth, truncateAnsi } from '../lib/ansi.js';
import {
  formatGlydeOrCrashTargetMultiplier,
  getGameCalculatedVariantReference,
  getConfiguredGameMaxPayoutReference,
  getGameMaxPayoutVariantReference,
  getUniformGameMaxPayoutReference,
  formatMaxPayoutReference,
  parseGlydeOrCrashTargetMultiplierInput,
  formatRtpDetails,
  formatRtpTripletCells,
  formatRtpTripletLine,
} from '../lib/rtp.js';
import {
  estimateConfiguredGameLoopRunout,
  formatLoopRunoutEstimate,
  getConfiguredGameVrfFeeApe,
} from '../lib/loop-estimate.js';
import {
  AUTO_MODE_BEST,
  AUTO_MODE_MAX,
  AUTO_MODE_SIMPLE,
  AUTO_MODE_WINSTON_LADDER,
  formatAutoModes,
  normalizeAutoMode,
} from '../lib/stateful/auto.js';
import {
  formatHumanDelayRange,
  formatDelayMs,
  getLoopDelayMs,
  normalizeHumanTiming,
  resolveLoopDelaySeconds,
  sleep,
} from '../lib/stateful/timing.js';
import {
  discoverBotDefinitions,
  runBot,
  validateBotInvocation,
} from '../lib/bots.js';
import {
  disableSelectedR2Config,
  getR2PublicMetadata,
  listStoredR2Configs,
  loadStoredR2ConfigCredentials,
  normalizeR2BucketName,
  saveEncryptedR2Config,
  enableStoredR2Config,
} from '../lib/r2.js';

// --- CLI Setup ---
const program = new Command();
const PACKAGE_VERSION = pkg.version || '0.0.0';
const VERSION_METADATA = Object.freeze({
  version: PACKAGE_VERSION,
  ...readVersionGitMetadata(),
});
const VERSION_DISPLAY = formatVersionDisplay(VERSION_METADATA);
const TOP_LEVEL_ENVIRONMENT_HELP = `
Environment:
  Paths:
    ${CONFIG_DIR_ENV_VAR}   Root config/data directory (default: ~/.apechurch-cli)
    ${BOTS_DIR_ENV_VAR}     External bots root (default: ${CONFIG_DIR_ENV_VAR}/bots)
    ${LOG_DIR_ENV_VAR}      Bot log directory (default: ${CONFIG_DIR_ENV_VAR}/log)

  Wallet and profile:
    ${PRIVATE_KEY_ENV_VAR}          Optional fallback for non-interactive install/reinstall
    ${PASS_ENV_VAR}        Wallet password for non-interactive install/signing
    ${PROFILE_URL_ENV_VAR} Optional username/profile API endpoint override

  Network and output:
    ${RPC_URL_ENV_VAR}             Custom ApeChain RPC URL(s); default RPC remains a fallback
    ${FORCE_COLOR_ENV_VAR}   Force ANSI color in plain output when set to 1
    ${NO_COLOR_ENV_VAR}                    Disable ANSI color when set
    ${FORCE_CHIME_ENV_VAR}   Force win chimes in JSON/nested bot flows when set to 1
    ${SUPPRESS_VERSION_BANNER_ENV_VAR}
                             Suppress the stderr version banner when set to 1

  R2 bot log mirror:
    ${R2_PREFIX_ENV_VAR}       Optional remote object key prefix for mirrored bot logs
    ${R2_NAME_ENV_VAR}         Bucket name fallback for ${BINARY_NAME} bucket install
    ${R2_ACCOUNT_ID_ENV_VAR}   Non-interactive fallback for ${BINARY_NAME} bucket install
    ${R2_TOKEN_ENV_VAR}        Non-interactive fallback for ${BINARY_NAME} bucket install
    ${R2_KEY_ENV_VAR}          Non-interactive fallback for ${BINARY_NAME} bucket install
    ${R2_SECRET_ENV_VAR}       Non-interactive fallback for ${BINARY_NAME} bucket install
`;

program
  .name(BINARY_NAME)
  .version(VERSION_DISPLAY, '-V, --version', 'output the current version')
  .option('--color', 'Force ANSI color in plain output, even when output is piped');
const GAME_LIST = listGames().join(' | ');
const cliPath = path.join(__dirname, 'cli.js');
const discoveredBots = discoverBotDefinitions();
const BOT_HELP_EXAMPLES = Object.freeze([
  `${BINARY_NAME} bot`,
  `${BINARY_NAME} bot my-bot`,
  `${BINARY_NAME} bot my-bot --max-routines 10 --json`,
]);
const GAME_TITLE_COLLATOR = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true,
});
const SIMPLE_GAME_HELP_BNF_LINES = Object.freeze([
  '<ape> ::= <number>                                 ; decimal APE amount; value > 0',
  '<points> ::= <number>                              ; decimal GP per APE rate; value > 0',
  '<bet-strategy> ::= "flat" | "martingale" | "reverse-martingale" | "fibonacci" | "dalembert" | "bankroll-fraction=" <fraction>',
  '<fraction> ::= <number>                            ; decimal strictly between 0 and 1',
  '<risk> ::= <integer> | <game-risk-label>           ; public risk surface for Bear Dice, Blocks, Plinko, Monkey Match, and Primes',
  '<split> ::= <integer>                              ; independent split attempts; 1 <= value <= game max',
  '<survive> ::= <integer>                            ; all-or-nothing survival attempts; 1 <= value <= game max',
  '<spins> ::= <integer>                              ; slots-only alias for <split>',
  '<cover> ::= <integer>                             ; ApeStrong uses 5..95; Gimboz Smash randomizes a 1..95 inside/outside cover',
  '<range> ::= <target-range> | <target-range> "," <target-range> ; Gimboz Smash inside target ranges on 1..100',
  '<multiplier> ::= <number> [ "x" ]                ; 1.01 <= value <= 10000 and at most 4 decimal places',
  '<target-range> ::= <integer> "-" <integer>         ; each endpoint is within 1..100, each range is inclusive, total covered numbers across all ranges is within 1..95',
  '<out-range> ::= <target-range>                     ; one excluded inclusive range for Gimboz Smash outside bets; excluded coverage must be within 5..95',
  '<picks> ::= <integer>                              ; 1 <= value <= 10 for Keno, 1 <= value <= 5 for Speed Keno',
  '<uint256> ::= <integer> | "0x" <hex>               ; expert override for gameData gameId',
  '<bytes32> ::= "0x" <64-hex-chars>                  ; expert override for gameData userRandomWord',
  '<solver-states> ::= <integer>                      ; blackjack exact-EV search state cap; defaults 50000/150000 for best/max',
  '<solver-timeout-ms> ::= <integer>                  ; blackjack exact-EV worker timeout; defaults 5000/30000 for best/max',
  '<keno-numbers> ::= "random" | <keno-number> ( "," <keno-number> )*',
  '<keno-number> ::= <integer>                        ; 1 <= value <= 40',
  '<speed-keno-numbers> ::= "random" | <speed-keno-number> ( "," <speed-keno-number> )*',
  '<speed-keno-number> ::= <integer>                  ; 1 <= value <= 20',
  '<roulette-bets> ::= <roulette-bet> ( "," <roulette-bet> )*',
  '<roulette-bet> ::= "0" | "00" | <roulette-number> | "RED" | "BLACK" | "ODD" | "EVEN" | "FIRST_HALF" | "SECOND_HALF" | "FIRST_THIRD" | "SECOND_THIRD" | "THIRD_THIRD" | "FIRST_COL" | "SECOND_COL" | "THIRD_COL"',
  '<roulette-number> ::= <integer>                    ; 1 <= value <= 36',
  '<baccarat-bet> ::= "PLAYER" | "BANKER" | "TIE" | <combo-baccarat-bet>',
  '<combo-baccarat-bet> ::= <ape> <baccarat-side> <ape> "TIE"',
  '<baccarat-side> ::= "PLAYER" | "BANKER"',
]);
const PLAY_STATELESS_OPTION_LINES = Object.freeze([
  '--auto                  Random stateless game selection when no game is specified',
  '--risk <risk>           Bear Dice, Blocks, Plinko, Monkey Match, and Primes risk',
  '--split <count>         Independent split attempts for Plinko, Primes, Speed Keno, and slots',
  '--survive <count>       All-or-nothing survival attempts for Bear Dice and Blocks',
  '--spins <count>         Slots-only alias for --split',
  '--bet <bet>             Roulette/Baccarat bet payload',
  '--cover <cover>         ApeStrong cover or Gimboz Smash random cover',
  '--range <range>         Gimboz Smash inside range',
  '--multiplier <x>        Glyde or Crash target multiplier',
  '--out-range <range>     Gimboz Smash outside range to exclude',
  '--picks <picks>         Keno / Speed Keno pick count',
  '--numbers <numbers>     Keno / Speed Keno numbers as one token; e.g. --numbers 1,7,13,25,40',
  '--timeout <ms>          Max wait for a stateless game result; 0 returns pending',
  '--x-gameId <uint256>    Expert stateless gameData override',
  '--x-ref <address>       Expert stateless referral override',
  '--x-userRandomWord <bytes32> Expert stateless randomness override',
]);
const PLAY_STATEFUL_OPTION_LINES = Object.freeze([
  '--auto [mode]           Stateful auto-play mode where supported',
  '--game-id <id>          Stateful unfinished-game id for resume/action',
  '--display <mode>        Stateful display mode: full, simple, json',
  '--side <ape>            Blackjack player side bet',
  '--solver-max-states <n> Blackjack best/max EV search state cap',
  '--solver-timeout-ms <ms> Blackjack best/max EV worker timeout',
  '--solver [mode]         Solver suggestions for supported stateful games',
  '--tile <tile>           Cash Dash opening tile: 1-7 or random',
  '--cashout-after <rows>  Cash Dash auto-play cashout depth',
  '--resilient             Retry transient network/RPC failures conservatively',
  '--no-resilient          Disable inherited resilient retry mode',
]);
const DEPRECATED_ATTEMPT_OPTIONS = Object.freeze(['--balls', '--games', '--runs', '--rolls']);
const SPLIT_GAME_TYPES = Object.freeze(['plinko', 'primes', 'speedkeno', 'slots']);
const SURVIVE_GAME_TYPES = Object.freeze(['beardice', 'blocks']);
const ATTEMPT_OPTION_GAME_HINTS = Object.freeze({
  '--balls': 'Use --split for Plinko games.',
  '--games': 'Use --split for Speed Keno.',
  '--runs': 'Use --survive for Bear-A-Dice/Blocks or --split for Primes.',
  '--rolls': 'Use --survive for Bear-A-Dice or Blocks.',
});
const PLAY_SHARED_OPTION_LINES = Object.freeze([
  '--game <name>           Stateless or stateful game key',
  '--amount <ape>          Wager amount',
  '--loop                  Repeat the selected gameplay surface until stopped',
  '--resilient             Conservative retry mode for transient network/RPC failures',
  '--no-resilient          Disable inherited resilient retry mode',
  '--delay <seconds>       Delay between looped games',
  '--max-games <count>     Stop after N games',
  '--take-profit <ape>     Stop when balance reaches the target',
  '--min-profit <ape>      Stop when session P&L reaches target profit',
  '--target-x <x>          Stop when one game pays at least this multiplier',
  '--target-profit <ape>   Stop when one game pays at least this payout',
  '--retrace <ape>         Stop when one game loses at least this amount',
  '--recover-loss <ape>    Arm at -<ape> net P&L; stop at break-even/profit',
  '--giveback-profit <ape> Arm at +<ape> net P&L; stop at break-even/loss',
  '--stop-loss <ape>       Stop when balance drops to the threshold',
  '--max-loss <ape>        Stop when session P&L reaches the loss limit',
  '--bankroll <ape>        Alias for --max-loss',
  '--bet-strategy <name>   Loop bet progression; supports bankroll-fraction=<0..1>',
  '--max-bet <ape>         Loop safety cap for progressive strategies',
  '--min-bet <ape>         Loop minimum bet floor',
  '--gp-ape <points>       Override local GP estimation for this run',
  '-v, --verbose           Show technical logs',
  '--color                 Force ANSI color in plain output',
  '--json                  Emit JSON output only',
]);
const FEES_HELP_BNF_LINES = Object.freeze([
  '<fees-command> ::= "fees" <fees-action> <game> <fees-option>*',
  '<fees-action> ::= "scan" | "report"',
  '<game> ::= <game-key> | <game-alias> | <game-display-name>',
  '<fees-option> ::= <wallet-option> | <range-option> | <scan-option> | <report-option> | "--json"',
  '<wallet-option> ::= "--wallet" <address>',
  '<range-option> ::= "--from-block" <block> | "--to-block" <block> | "--floor-block" <block>',
  '<scan-option> ::= "--chunk-size" <integer> | "--max-chunks" <integer> | "--cap-mb" <number> | "-y" | "--yes"',
  '<report-option> ::= "--min-games" <integer>',
  '<block> ::= <integer>                                ; block number >= 0',
  '<address> ::= "0x" <40-hex-chars>',
  '<integer> ::= <digit>+',
  '<number> ::= <integer> [ "." <digit>+ ]',
]);
const INLINE_HELP_OPTION_LINE = '-h, --help             Show this inline help for the command';
const COMMON_BNF_LINES = Object.freeze([
  '<address> ::= "0x" <40-hex-chars>',
  '<ape> ::= <number>                              ; decimal APE amount; value > 0',
  '<ape-nonnegative> ::= <number>                  ; decimal APE amount; value >= 0',
  '<points> ::= <number>                           ; decimal GP per APE rate; value > 0',
  '<block> ::= <integer>                           ; block number >= 0',
  '<count> ::= <integer>                           ; value > 0',
  '<seconds> ::= <number>                          ; value > 0',
  '<human-range> ::= <integer> "-" <integer>        ; inclusive seconds range, for example 2-17',
  '<username> ::= <token>                          ; letters, numbers, underscores; max 32 chars',
  '<persona> ::= "conservative" | "balanced" | "aggressive" | "degen"',
  '<display> ::= "full" | "simple" | "json"',
  '<asset> ::= "APE" | "GP"',
  '<game-id> ::= <token>                           ; local unfinished-game identifier',
]);
const LOOP_HELP_OPTION_LINES = Object.freeze([
  '--loop                  Keep playing until a stop condition is reached',
  '--delay <seconds>       Fixed delay between looped games',
  '--human [range]         Add humanized random delay; bare flag uses weighted 3-9s',
  '--max-games <count>     Stop after N completed loop games',
  '--take-profit <ape>     Stop when wallet balance reaches this absolute target',
  '--min-profit <ape>      Stop when session P&L reaches this profit',
  '--target-x <x>          Stop when one game pays at least this multiplier',
  '--target-profit <ape>   Stop when one game pays at least this payout',
  '--retrace <ape>         Stop when one game loses at least this amount',
  '--recover-loss <ape>    Arm at -<ape> net P&L; stop at break-even/profit',
  '--giveback-profit <ape> Arm at +<ape> net P&L; stop at break-even/loss',
  '--stop-loss <ape>       Stop when wallet balance drops to this absolute threshold',
  '--max-loss <ape>        Stop when session P&L reaches this loss',
  '--bankroll <ape>        Alias for --max-loss',
  '--bet-strategy <name>   Loop bet progression strategy',
  '--max-bet <ape>         Maximum loop wager cap',
  '--min-bet <ape>         Minimum loop wager floor',
]);
const BET_STRATEGY_HELP_LINES = Object.freeze([
  '<bet-strategy> ::= "flat" | "martingale" | "reverse-martingale" | "fibonacci" | "dalembert" | "bankroll-fraction=" <fraction>',
  '<fraction> ::= <number>                         ; decimal strictly between 0 and 1',
]);
const STATEFUL_SHARED_HELP_OPTION_LINES = Object.freeze([
  '--game <id>             Select a specific unfinished game id for resume/action',
  '--display <mode>        Render mode: full, simple, json',
  '--json                  Emit JSON output only',
  '-v, --verbose           Show technical progress logs',
  '--gp-ape <points>       Override local GP estimation for this run',
  '--resilient             Retry transient network/RPC failures conservatively',
  '--no-resilient          Disable inherited resilient retry mode',
]);
const STATEFUL_SHARED_BNF_LINES = Object.freeze([
  '<stateful-common-option> ::= "--game" <game-id> | "--display" <display> | "--json" | "-v" | "--verbose" | "--gp-ape" <points> | "--resilient" | "--no-resilient"',
  '<stateful-loop-option> ::= "--loop" | "--resilient" | "--no-resilient" | "--delay" <seconds> | "--human" [ <human-range> ] | "--max-games" <count> | "--take-profit" <ape> | "--min-profit" <ape> | "--target-x" <number> | "--target-profit" <ape> | "--retrace" <ape> | "--recover-loss" <ape> | "--giveback-profit" <ape> | "--stop-loss" <ape-nonnegative> | "--max-loss" <ape> | "--bankroll" <ape> | "--bet-strategy" <bet-strategy> | "--max-bet" <ape> | "--min-bet" <ape>',
]);

function isPositiveApeToken(value) {
  const input = String(value ?? '').trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(input)) {
    return false;
  }
  const amount = Number(input);
  return Number.isFinite(amount) && amount > 0;
}

function printCommandError(message, { json = false, exit = false } = {}) {
  if (json) {
    console.error(JSON.stringify({ error: message }));
  } else {
    console.error(`\n❌ ${message}\n`);
  }
  if (exit) {
    process.exit(1);
  }
}

function resolveBetStrategyOrExit(rawName, { json = false } = {}) {
  const betStrategyName = rawName || 'flat';
  let betStrategy;
  try {
    betStrategy = resolveStrategy(betStrategyName);
  } catch (error) {
    printCommandError(error.message, { json, exit: true });
  }
  if (!betStrategy) {
    printCommandError(`Unknown betting strategy: "${betStrategyName}". Available: ${getStrategyNames()}`, { json, exit: true });
  }
  return { betStrategyName, betStrategy };
}

function formatDerivedLoopLossNotice({ derivedStopLoss, derivedMaxLoss, stopLoss, maxLoss }) {
  if (derivedStopLoss) {
    return `Derived stop-loss: ${Number(stopLoss).toFixed(6).replace(/\.?0+$/, '')} APE from bankroll ${maxLoss} APE`;
  }
  if (derivedMaxLoss) {
    return `Derived bankroll: ${Number(maxLoss).toFixed(6).replace(/\.?0+$/, '')} APE from stop-loss ${stopLoss} APE`;
  }
  return null;
}

function formatUtcTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ].join('');
}

function readVersionGitMetadata() {
  try {
    const output = execFileSync('git', ['-C', repoRoot, 'log', '-1', '--format=%cI%n%h'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const [commitIsoDate, commitId] = output.split(/\r?\n/);

    return {
      timestamp_utc: formatUtcTimestamp(new Date(commitIsoDate)),
      commit_id: commitId || null,
    };
  } catch {
    return {
      timestamp_utc: null,
      commit_id: null,
    };
  }
}

function formatVersionDisplay(metadata) {
  const details = [metadata.timestamp_utc, metadata.commit_id].filter(Boolean).join(' ');
  return details ? `${metadata.version} (${details})` : metadata.version;
}

function withVersionMetadata(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      ...VERSION_METADATA,
      ...value,
      version: VERSION_METADATA.version,
      timestamp_utc: VERSION_METADATA.timestamp_utc,
      commit_id: VERSION_METADATA.commit_id,
    };
  }

  return {
    ...VERSION_METADATA,
    data: value,
  };
}

function enrichJsonLine(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return text;
  }

  try {
    return JSON.stringify(withVersionMetadata(JSON.parse(trimmed)));
  } catch {
    return text;
  }
}

function installJsonMetadataConsoleHooks() {
  if (!process.argv.includes('--json')) {
    return;
  }

  const writeJsonMetadataLine = (original) => (...args) => {
    if (args.length === 1 && typeof args[0] === 'string') {
      return original(enrichJsonLine(args[0]));
    }

    return original(...args);
  };

  console.log = writeJsonMetadataLine(console.log.bind(console));
  console.error = writeJsonMetadataLine(console.error.bind(console));
}

function isVersionArg(arg) {
  return arg === '--version' || arg === '-V';
}

function getTopLevelVersionArgs(argv = process.argv) {
  const args = argv.slice(2);
  const firstCommandArg = args.find((arg) => arg !== '--json' && arg !== '--color');
  const isVersionRequest = isVersionArg(firstCommandArg);
  const isMetadataJsonRequest = args.includes('--json') && (!firstCommandArg || isVersionRequest);

  return {
    isVersionRequest,
    isJson: isMetadataJsonRequest,
  };
}

function printVersionJson() {
  console.log(JSON.stringify(withVersionMetadata({})));
}

function isPlainGamesListRequest(argv = process.argv) {
  const args = argv.slice(2);
  return args[0] === 'games' && (args.includes('--list') || args.includes('-l')) && !args.includes('--json');
}

function printInvocationVersion() {
  if (process.env[SUPPRESS_VERSION_BANNER_ENV_VAR] === '1') {
    return;
  }
  if (process.argv.includes('--json')) {
    return;
  }
  if (isPlainGamesListRequest()) {
    return;
  }
  console.error(`${BINARY_NAME} v${VERSION_DISPLAY}`);
}

function shouldForceAnsiColor(argv = process.argv) {
  if (argv.includes('--json')) return false;
  return argv.includes('--color') || process.env[FORCE_COLOR_ENV_VAR] === '1';
}

function installColorOutputMode() {
  if (!shouldForceAnsiColor()) return;
  forceColorOutput();
}

function formatHelpBnfSection(lines = []) {
  return `
Grammar (BNF):
  ${lines.join('\n  ')}

Notes:
  - Pass \`--numbers\` as a single CLI token, for example \`--numbers 1,7,13,25,40\`.
  - Run \`${BINARY_NAME} game <name>\` for per-game grammar and constraints.
`;
}

function formatHelpOptionGroup(title, lines = []) {
  if (!Array.isArray(lines) || lines.length === 0) return '';
  return `${title}:\n  ${lines.join('\n  ')}`;
}

function formatInlineHelpLines(lines = [], fallback = 'None.') {
  const values = Array.isArray(lines) && lines.length > 0 ? lines : [fallback];
  return values
    .map((line) => String(line).split('\n').join('\n  '))
    .join('\n  ');
}

function formatInlineHelpSection(title, lines = [], fallback = 'None.') {
  return `${title}:\n  ${formatInlineHelpLines(lines, fallback)}`;
}

function withHelpOption(lines = []) {
  return [...lines, INLINE_HELP_OPTION_LINE];
}

function formatCommandHelpAppendix({
  actions = [],
  parameters = [],
  options = [],
  bnf = [],
  examples = [],
  notes = [],
} = {}) {
  return `
${formatInlineHelpSection('Actions', actions)}

${formatInlineHelpSection('Parameters', parameters)}

${formatInlineHelpSection('Options', withHelpOption(options))}

${formatInlineHelpSection('Grammar (BNF)', bnf)}

${formatInlineHelpSection('Examples', examples)}

${formatInlineHelpSection('Notes', notes)}
`;
}

function formatTopLevelHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. Choose one top-level command from the command list above.'],
    parameters: [
      '<command>    One top-level command such as install, wallet, play, history, or blackjack',
      '<args...>    Command-specific arguments; run `<command> --help` for that command grammar',
    ],
    options: [
      '-V, --version          Output CLI version and git metadata when available',
      '--color                Force ANSI color in plain output, even when output is piped',
    ],
    bnf: [
      '<top-level-command> ::= "install" | "uninstall" | "wallet" | "bucket" | "status" | "pause" | "continue" | "register" | "profile" | "bet" | "play" | "bot" | "contest" | "history" | "scoreboard" | "fees" | "games" | "game" | "commands" | "help" | "send" | "house" | "blackjack" | "bj" | "cash-dash" | "cashdash" | "dash" | "hi-lo-nebula" | "hilonebula" | "hilo" | "nebula" | "video-poker" | "vp"',
      `<cli> ::= "${BINARY_NAME}" [ "--color" ] <top-level-command> <command-args>*`,
      `<version-command> ::= "${BINARY_NAME}" ( "-V" | "--version" ) [ "--json" ]`,
    ],
    examples: [
      `${BINARY_NAME} wallet --help`,
      `${BINARY_NAME} play --help`,
      `${BINARY_NAME} blackjack --help`,
      `${BINARY_NAME} help commands`,
    ],
    notes: [
      'Inline help is command-specific. Prefer `<command> --help` when you need actions, parameters, options, BNF, and examples.',
      TOP_LEVEL_ENVIRONMENT_HELP.trim(),
    ],
  });
}

function formatInstallHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `install` performs setup or reinstall behavior directly.'],
    parameters: ['None.'],
    options: [
      '--username <name>      Initial username for the selected wallet profile',
      '--persona <name>       Initial persona: conservative, balanced, aggressive, or degen',
      '-y, --quick            Skip optional interactive prompts and use defaults',
    ],
    bnf: [
      '<install-command> ::= "install" <install-option>*',
      '<install-option> ::= "--username" <username> | "--persona" <persona> | "-y" | "--quick"',
      '<username> ::= <token>                          ; letters, numbers, underscores; max 32 chars',
      '<persona> ::= "conservative" | "balanced" | "aggressive" | "degen"',
    ],
    examples: [
      `${BINARY_NAME} install`,
      `${BINARY_NAME} install --username smith --persona balanced`,
      `${BINARY_NAME} install --quick`,
    ],
    notes: [
      'Fresh install/reinstall prompts securely for the private key when no encrypted wallet exists.',
      `${PRIVATE_KEY_ENV_VAR} is only a non-interactive fallback for fresh install/reinstall.`,
      `${PASS_ENV_VAR} supplies the local wallet password for non-interactive install/signing.`,
      `${PROFILE_URL_ENV_VAR} overrides the username/profile API endpoint.`,
    ],
  });
}

function formatUninstallHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `uninstall` removes local CLI data after confirmation.'],
    parameters: ['None.'],
    options: ['-y, --yes              Skip the confirmation prompt'],
    bnf: ['<uninstall-command> ::= "uninstall" [ "-y" | "--yes" ]'],
    examples: [
      `${BINARY_NAME} uninstall`,
      `${BINARY_NAME} uninstall --yes`,
    ],
    notes: [
      `Deletes local data under ${APECHURCH_DIR}.`,
      'Make sure you still control the original private key outside this local installation before removing the encrypted wallet.',
    ],
  });
}

function formatWalletHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'status                 Show encrypted-wallet status and local signing metadata',
      'new                    Import/create and select another encrypted local wallet',
      'select [address]       Select a stored wallet; prompts interactively when address is omitted',
      'download [address]     Download supported on-chain history into the local per-wallet cache',
      'password               Re-encrypt the selected local wallet with a new password',
      'hints                  View or update up to three local password hints',
      'reset                  Delete local wallet/config data; requires reinstall',
      'export/decrypt/unlock/lock are intentionally disabled in this hardened build',
    ],
    parameters: [
      '[action]               Wallet action; omitted action prints the available action list',
      '[address]              0x wallet address for `select` or `download`; defaults to current wallet for `download`',
    ],
    options: [
      '-y, --yes              Skip confirmation prompts where supported, mainly reset',
      '--list                 List locally available wallet addresses',
      '--json                 Emit JSON output where supported',
      '--from-block <n>       Start block for wallet history download/backfill',
      '--to-block <n>         End block for wallet history download; default is latest',
      '--chunk-size <n>       Block span per history log query',
    ],
    bnf: [
      '<wallet-command> ::= "wallet" [ <wallet-action> [ <address> ] ] <wallet-option>*',
      '<wallet-action> ::= "status" | "new" | "select" | "download" | "password" | "hints" | "reset"',
      '<wallet-option> ::= "-y" | "--yes" | "--list" | "--json" | "--from-block" <block> | "--to-block" <block> | "--chunk-size" <count>',
      '<address> ::= "0x" <40-hex-chars>',
      '<block> ::= <integer>                         ; block number >= 0',
      '<count> ::= <integer>                         ; value > 0',
    ],
    examples: [
      `${BINARY_NAME} wallet status`,
      `${BINARY_NAME} wallet --list`,
      `${BINARY_NAME} wallet new`,
      `${BINARY_NAME} wallet select 0x1234567890abcdef1234567890abcdef12345678`,
      `${BINARY_NAME} wallet download`,
      `${BINARY_NAME} wallet download 0x1234567890abcdef1234567890abcdef12345678 --from-block 0`,
      `${BINARY_NAME} wallet password`,
      `${BINARY_NAME} wallet reset --yes`,
    ],
    notes: [
      `Current wallet selector: ${WALLET_FILE}`,
      `Encrypted wallet entries: ${WALLETS_DIR}/<address>.json.`,
      'If an address entry is a symlink, normal filesystem resolution applies; the CLI only follows the selected wallets/<address>.json path.',
      `History downloads write to ${path.join(APECHURCH_DIR, 'history')}/<wallet>_history.json.`,
      'The private key is never exported by this CLI; signing decrypts locally only when needed.',
    ],
  });
}

function formatBucketHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'install <bucket>       Encrypt credentials for one bucket and enable it',
      'reinstall <bucket>     Same as install; overwrites the entry and enables it',
      'status                 Show enabled R2 mirror state without revealing credentials',
      'list                   List stored bucket entries without revealing credentials',
      'enable <bucket>        Enable a stored bucket entry for bot log mirroring',
      'disable                Disable remote mirroring while preserving encrypted entries',
    ],
    parameters: [
      '[action]               R2 action; omitted action defaults to status',
      '[bucket]               Cloudflare R2 bucket name for install/reinstall/enable',
    ],
    options: [
      '--json                 Emit JSON output where supported',
      '-v, --verbose          Decrypt and show R2 endpoints plus bucket fallback environment values for status/list',
    ],
    bnf: [
      '<bucket-command> ::= "bucket" [ <bucket-action> [ <bucket> ] ] [ "--json" ] [ "-v" | "--verbose" ]',
      '<bucket-action> ::= "install" | "reinstall" | "status" | "list" | "enable" | "disable"',
      '<bucket> ::= <bucket-name>                     ; 3-63 lowercase letters, numbers, dots, or hyphens',
    ],
    examples: [
      `${BINARY_NAME} bucket install apechurch-cli-log`,
      `${BINARY_NAME} bucket status`,
      `${BINARY_NAME} bucket status -v`,
      `${BINARY_NAME} bucket list --json`,
      `${BINARY_NAME} bucket enable apechurch-cli-log`,
      `${BINARY_NAME} bucket disable`,
    ],
    notes: [
      `Encrypted R2 entries live under ${R2_DIR}/<bucket>.json with a separate current selector; install/reinstall automatically enables the installed bucket.`,
      `enable writes the current selector so future bot runs mirror logs to that stored bucket.`,
      `disable removes only the current selector so future bot runs stop mirroring; encrypted bucket entries are preserved and can be enabled again later.`,
      `Install checks ${PASS_ENV_VAR} or prompts for the encryption password before account ID and access key ID in clear text, then API token and secret access key with hidden input.`,
      `${R2_NAME_ENV_VAR} is the bucket-name fallback; ${R2_ACCOUNT_ID_ENV_VAR}, ${R2_TOKEN_ENV_VAR}, ${R2_KEY_ENV_VAR}, and ${R2_SECRET_ENV_VAR} are non-interactive install/reinstall credential fallbacks only.`,
      `Verbose status/list output requires ${PASS_ENV_VAR} or an interactive password prompt because it prints decrypted fallback values.`,
      `${R2_PREFIX_ENV_VAR} optionally prefixes mirrored object keys; values are normalized without leading or trailing slashes.`,
      `During bot runs, remote mirroring is best-effort and only activates when an enabled R2 entry exists and ${PASS_ENV_VAR} is set.`,
    ],
  });
}

function formatStatusHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `status` reads the selected wallet/profile state directly.'],
    parameters: ['None.'],
    options: ['--json                 Emit JSON output only'],
    bnf: ['<status-command> ::= "status" [ "--json" ]'],
    examples: [
      `${BINARY_NAME} status`,
      `${BINARY_NAME} status --json`,
    ],
    notes: ['Shows wallet balance, GP balance, house balance when present, username, persona, pause state, and unfinished games.'],
  });
}

function formatPauseHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `pause` sets the local profile pause flag to true.'],
    parameters: ['None.'],
    options: [],
    bnf: ['<pause-command> ::= "pause"'],
    examples: [`${BINARY_NAME} pause`],
    notes: ['Outputs a JSON status payload.'],
  });
}

function formatContinueHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `continue` sets the local profile pause flag to false.'],
    parameters: ['None.'],
    options: [],
    bnf: ['<continue-command> ::= "continue"'],
    examples: [`${BINARY_NAME} continue`],
    notes: ['Outputs a JSON status payload.'],
  });
}

function formatRegisterHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `register` registers or updates username/persona directly.'],
    parameters: ['None.'],
    options: [
      '--username <name>      Username to register; generated/current username is used when omitted',
      '--persona <name>       Persona: conservative, balanced, aggressive, or degen',
    ],
    bnf: [
      '<register-command> ::= "register" <register-option>*',
      '<register-option> ::= "--username" <username> | "--persona" <persona>',
      '<username> ::= <token>                          ; letters, numbers, underscores; max 32 chars',
      '<persona> ::= "conservative" | "balanced" | "aggressive" | "degen"',
    ],
    examples: [
      `${BINARY_NAME} register --username smith`,
      `${BINARY_NAME} register --username smith --persona aggressive`,
    ],
    notes: ['Requires the selected local wallet because registration signs locally.'],
  });
}

function formatProfileHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'show                   Show the effective local profile for the selected wallet',
      'set                    Update one or more profile fields',
      'omitted                Defaults to show',
    ],
    parameters: ['[action]               Profile action: show or set'],
    options: [
      '--username <name>      Register or change username for the selected wallet; requires set',
      '--persona <name>       Persona: conservative, balanced, aggressive, or degen; requires set',
      '--referral <address>   Local-only referral address attached to future game transactions; requires set',
      '--card-display <mode>  Card display mode: full, simple, json; requires set',
      '--gp-ape <points>      Persist wallet-specific current GP/APE override; requires set',
      '--no-gp-ape            Clear wallet-specific current GP/APE override; requires set',
      '--json                 Emit JSON output',
    ],
    bnf: [
      '<profile-command> ::= "profile" [ <profile-action> ] <profile-option>*',
      '<profile-action> ::= "show" | "set"',
      '<profile-option> ::= "--username" <username> | "--persona" <persona> | "--referral" <address> | "--card-display" <display> | "--gp-ape" <points> | "--no-gp-ape" | "--json"',
      '<username> ::= <token>                          ; letters, numbers, underscores; max 32 chars',
      '<persona> ::= "conservative" | "balanced" | "aggressive" | "degen"',
      '<display> ::= "full" | "simple" | "json"',
      '<address> ::= "0x" <40-hex-chars>',
      '<points> ::= <number>                           ; decimal GP per APE rate; value > 0',
    ],
    examples: [
      `${BINARY_NAME} profile`,
      `${BINARY_NAME} profile show --json`,
      `${BINARY_NAME} profile set [options]`,
      `${BINARY_NAME} profile set --username smith`,
      `${BINARY_NAME} profile set --persona aggressive --card-display simple`,
      `${BINARY_NAME} profile set --referral 0x1234567890abcdef1234567890abcdef12345678`,
      `${BINARY_NAME} profile set --gp-ape 7.5`,
      `${BINARY_NAME} profile set --no-gp-ape`,
    ],
    notes: [
      'Mutating flags require the explicit `profile set` action.',
      '--referral is local-only and affects future game transactions only.',
    ],
  });
}

function formatBetHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `bet` places one stateless wager selected by --game.'],
    parameters: ['None. `bet` uses required named options instead of positional parameters.'],
    options: [
      '--game <type>          Required stateless game key or alias',
      '--amount <ape>         Required wager amount',
      '--risk <risk>          Bear Dice, Blocks, Plinko, Monkey Match, and Primes risk',
      '--split <count>        Independent split attempts for Plinko, Primes, Speed Keno, and slots',
      '--survive <count>      All-or-nothing survival attempts for Bear Dice and Blocks',
      '--spins <count>        Slots-only alias for --split',
      '--bet <bet>            Roulette or baccarat bet payload',
      '--cover <cover>        ApeStrong cover or Gimboz Smash random cover',
      '--range <range>        Gimboz Smash inside range',
      '--multiplier <x>       Glyde or Crash target multiplier',
      '--out-range <range>    Gimboz Smash outside range to exclude',
      '--picks <picks>        Keno or Speed Keno pick count',
      '--numbers <numbers>    Keno or Speed Keno numbers as one token, or random',
      '--timeout <ms>         Max wait for result; 0 means no wait',
      '--x-gameId <uint256>   Expert override for generated gameData gameId',
      '--x-ref <address>      Expert override for referral address in gameData',
      '--x-userRandomWord <bytes32> Expert override for generated userRandomWord',
      '--resilient            Retry transient network/RPC failures conservatively',
      '--no-resilient         Disable inherited resilient retry mode',
      '--gp-ape <points>      Override local GP estimation for this run',
    ],
    bnf: [
      '<bet-command> ::= "bet" "--game" <stateless-game> "--amount" <ape> <bet-option>*',
      '<bet-option> ::= "--risk" <risk> | "--split" <split> | "--survive" <survive> | "--spins" <spins> | "--bet" <token> | "--cover" <cover> | "--range" <range> | "--multiplier" <multiplier> | "--out-range" <out-range> | "--picks" <picks> | "--numbers" <token> | "--timeout" <integer> | "--x-gameId" <uint256> | "--x-ref" <address> | "--x-userRandomWord" <bytes32> | "--resilient" | "--no-resilient" | "--gp-ape" <points>',
      ...SIMPLE_GAME_HELP_BNF_LINES,
    ],
    examples: [
      `${BINARY_NAME} bet --game roulette --amount 10 --bet RED`,
      `${BINARY_NAME} bet --game jungle-plinko --amount 10 --risk 0 --split 100`,
      `${BINARY_NAME} bet --game keno --amount 5 --picks 5 --numbers 1,7,13,25,40`,
      `${BINARY_NAME} bet --game gimboz-smash --amount 10 --range 45-55`,
      `${BINARY_NAME} bet --game glyde-or-crash --amount 10 --multiplier 2x --timeout 0`,
    ],
    notes: [
      'Use `play` for loop mode, stateful games, or random stateless selection.',
      `Run ${BINARY_NAME} game <name> for per-game parameter details.`,
    ],
  });
}

function formatPlayHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'None at the play-command level.',
      'When [game] is stateful, the next positional token is forwarded as that game action.',
      'Stateful forwarded actions: blackjack hit/stand/double/split/insurance/surrender/resume/status/clear; cash-dash resume/status/payouts/table/clear/guess/tile/pick/random/cashout; hi-lo-nebula resume/status/payouts/table/clear/high/lower/same/cashout; video-poker resume/status/payouts/table/clear.',
    ],
    parameters: [
      '[game]                 Stateless or stateful game key/alias; omit only with --auto for random stateless selection',
      '[amount]               Wager amount, or stateful action when [game] is stateful',
      '[config...]            Game-specific positional config, or stateful action payload such as Cash Dash tile',
    ],
    options: [
      formatHelpOptionGroup('Stateless game options', PLAY_STATELESS_OPTION_LINES),
      formatHelpOptionGroup('Stateful game options', PLAY_STATEFUL_OPTION_LINES),
      formatHelpOptionGroup('Shared play / loop options', [
        '--game <name>          Game key/alias when not using positional [game]',
        '--amount <ape>         Wager amount when not using positional [amount]',
        '--strategy <name>      Persona for automatic stateless game/config selection',
        ...LOOP_HELP_OPTION_LINES,
        '--gp-ape <points>      Override local GP estimation for this run',
        '-v, --verbose          Show technical progress logs',
        '--json                 Emit JSON output only',
        '--validate-only        Validate arguments and print JSON without starting a game',
      ]),
    ],
    bnf: [
      '<play-command> ::= "play" [ <play-positional> ] <play-option>*',
      '<play-positional> ::= <stateless-game> [ <ape> <token>* ] | <stateful-game> [ <stateful-head> ] [ <token> ]',
      '<stateful-head> ::= <ape> | "resume" | "status" | "clear" | "payouts" | "table" | <token>',
      '<play-option> ::= <play-stateless-option> | <play-stateful-option> | <play-shared-option>',
      '<play-stateless-option> ::= "--auto" | "--risk" <risk> | "--split" <split> | "--survive" <survive> | "--spins" <spins> | "--bet" <token> | "--cover" <cover> | "--range" <range> | "--multiplier" <multiplier> | "--out-range" <out-range> | "--picks" <picks> | "--numbers" <token> | "--timeout" <integer> | "--x-gameId" <uint256> | "--x-ref" <address> | "--x-userRandomWord" <bytes32>',
      '<play-stateful-option> ::= "--auto" [ <auto-mode> ] | "--game-id" <game-id> | "--display" <display> | "--side" <ape-nonnegative> | "--solver-max-states" <count> | "--solver-timeout-ms" <count> | "--solver" [ <auto-mode> | "winston-ladder" ] | "--tile" <token> | "--cashout-after" <count> | "--resilient" | "--no-resilient"',
      '<play-shared-option> ::= "--game" <game-name> | "--amount" <ape> | "--strategy" <persona> | "--loop" | "--resilient" | "--no-resilient" | "--delay" <seconds> | "--human" [ <human-range> ] | "--max-games" <count> | "--take-profit" <ape> | "--min-profit" <ape> | "--target-x" <number> | "--target-profit" <ape> | "--retrace" <ape> | "--recover-loss" <ape> | "--giveback-profit" <ape> | "--stop-loss" <ape-nonnegative> | "--max-loss" <ape> | "--bankroll" <ape> | "--bet-strategy" <bet-strategy> | "--max-bet" <ape> | "--min-bet" <ape> | "--gp-ape" <points> | "-v" | "--verbose" | "--json" | "--validate-only"',
      ...SIMPLE_GAME_HELP_BNF_LINES,
      ...COMMON_BNF_LINES.filter((line) => !line.startsWith('<ape') && !line.startsWith('<points>')),
    ],
    examples: [
      `${BINARY_NAME} play --auto`,
      `${BINARY_NAME} play roulette 10 RED`,
      `${BINARY_NAME} play jungle-plinko 10 --risk 0 --split 100`,
      `${BINARY_NAME} play keno 5 --picks 5 --numbers 1,7,13,25,40`,
      `${BINARY_NAME} play blackjack 10 --auto best`,
      `${BINARY_NAME} play cash-dash guess 3 --game-id 123`,
      `${BINARY_NAME} play video-poker 25 --auto best --loop --max-games 20`,
      `${BINARY_NAME} play roulette 10 RED --loop --min-profit 25 --max-loss 20`,
      `${BINARY_NAME} play roulette --bet RED --loop --bankroll 500 --bet-strategy bankroll-fraction=0.09 --max-bet 100 --min-bet 5`,
      `${BINARY_NAME} play roulette 10 RED --validate-only`,
    ],
    notes: [
      'Stateless game options apply only to fire-and-forget games routed through stateless game handlers.',
      'Stateful game options apply only to blackjack, cash-dash, hi-lo-nebula, and video-poker when routed through play.',
      'Shared play / loop options apply across selected stateless and stateful play surfaces.',
      'Pass `--numbers` as a single CLI token, for example `--numbers 1,7,13,25,40`.',
      'Bare `play` does not auto-run a random game; use `play --auto` or pass a game.',
      'For stateful resume/action through `play`, prefer `--game-id <id>` because `--game <name>` selects the target game.',
      `Run ${BINARY_NAME} game <name> for per-game config grammar.`,
    ],
  });
}

function formatPathEnvNotice(label, resolvedPath, envVar) {
  const rawValue = process.env[envVar];
  return rawValue
    ? `${label}: ${resolvedPath} (${envVar}=${rawValue})`
    : `${label}: ${resolvedPath}`;
}

function formatBotDirectoryNotice() {
  return [
    formatPathEnvNotice('Config directory', APECHURCH_DIR, CONFIG_DIR_ENV_VAR),
    formatPathEnvNotice('Bot directory', discoveredBots.botsDir, BOTS_DIR_ENV_VAR),
    formatPathEnvNotice('Bot log directory', LOG_DIR, LOG_DIR_ENV_VAR),
  ].join('\n');
}

function formatBotLoadErrors() {
  if (discoveredBots.errors.length === 0) return '';

  const lines = ['Load errors:'];
  for (const error of discoveredBots.errors) {
    lines.push(`  - ${path.basename(error.botDirectory)}: ${error.message}`);
  }
  return lines.join('\n');
}

function findBotByCommand(input) {
  const requested = String(input || '').trim().toLowerCase();
  return discoveredBots.bots.find((bot) => bot.command === requested) || null;
}

function printBotList() {
  const lines = [formatBotDirectoryNotice(), ''];
  if (discoveredBots.bots.length === 0) {
    lines.push(`No bots discovered under ${discoveredBots.botsDir}.`);
  } else {
    lines.push('Discovered bots:');
    for (const bot of discoveredBots.bots) {
      const suffix = bot.description ? ` - ${bot.description}` : '';
      lines.push(`  ${bot.command}${suffix}`);
    }
  }

  const loadErrors = formatBotLoadErrors();
  if (loadErrors) {
    lines.push('', loadErrors);
  }

  console.log(lines.join('\n'));
}

function formatBotHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'omitted                List discovered bots and loader paths',
      '<name>                 Run the named discovered bot',
      '<name> -h/--help       Forward help to the named bot',
    ],
    parameters: [
      '[name]                 Bot command name from a discovered bot.json manifest',
      '[args...]              Opaque tokens forwarded to the selected bot',
    ],
    options: [
      '--list                 List discovered bots',
      '--validate-only        Validate bot invocation without running it',
      '--resilient            Inherit resilient retry mode in bot-launched plays',
      '--no-resilient         Disable inherited resilient retry mode',
      '<bot options...>       Any unrecognized options after [name] are forwarded to the bot',
    ],
    bnf: [
      '<bot-command> ::= "bot" [ <bot-name> ] [ <token>* ] ( <bot-loader-option> | <bot-shared-option> )*',
      '<bot-loader-option> ::= "-h" | "--help" | "--list" | "--validate-only"',
      '<bot-shared-option> ::= "--resilient" | "--no-resilient"',
      '<bot-name> ::= <token>',
      '<token> ::= <one-shell-token>',
    ],
    examples: BOT_HELP_EXAMPLES,
    notes: [
      formatBotDirectoryNotice(),
      `${BOTS_DIR_ENV_VAR} overrides the external bots root and should point directly at the directory containing bot folders.`,
      `${LOG_DIR_ENV_VAR} overrides the bot log directory.`,
      `${PASS_ENV_VAR} supplies the wallet password for non-interactive live bot signing.`,
      `${RPC_URL_ENV_VAR} overrides ApeChain RPC URL(s); the default RPC remains a fallback.`,
      'Bot code is trusted local code. Only run bots from directories you control.',
      'Bot-specific options are documented by each bot, not by the loader.',
      formatBotLoadErrors(),
    ].filter(Boolean),
  });
}

function formatContestHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'omitted                Show contest info and current wallet eligibility/status',
      'register               Register the selected wallet for the contest',
    ],
    parameters: ['[action]               Contest action; only register is accepted'],
    options: ['--json                 Emit JSON output'],
    bnf: ['<contest-command> ::= "contest" [ "register" ] [ "--json" ]'],
    examples: [
      `${BINARY_NAME} contest`,
      `${BINARY_NAME} contest --json`,
      `${BINARY_NAME} contest register`,
    ],
    notes: [
      `Entry fee: ${CONTEST_ENTRY_FEE} APE.`,
      `Eligibility limit: total wagered must be below ${CONTEST_WAGER_LIMIT} APE.`,
      `Contest end date: ${CONTEST_END_DATE.toISOString()}.`,
    ],
  });
}

function formatHistoryHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'omitted                Read cached history for [address] or the selected local wallet',
      '--list                 List wallets with local cached history files',
      '--refresh              Refresh local history from chain before rendering',
    ],
    parameters: ['[address]              Wallet address to inspect; defaults to selected local wallet'],
    options: [
      '--list                 List wallet addresses with local cached history files',
      '--limit <n>            Number of recent cached games to show',
      '--all                  Show all cached games instead of the recent slice',
      '--ids                  Show game IDs in history lines and scoreboard tables',
      '--stats                Show only aggregate history stats',
      '--breakdown [game]     Show stats split by game, optionally filtered to one game',
      '--leaderboard          Show weekly wAPE wagered leaderboard',
      '--scoreboard           Append cached wallet scoreboard derived from history',
      '--url                  Show scoreboard game URLs in terminal tables',
      '--offline              Read local cache only; skip RPC enrichment and balance reads',
      '--refresh              Refresh local history from chain before showing it',
      '--from-block <n>       Start block for --refresh sync/backfill',
      '--to-block <n>         End block for --refresh sync; default is latest',
      '--chunk-size <n>       Block range per log query during refresh',
      '--json                 Emit JSON output',
    ],
    bnf: [
      '<history-command> ::= "history" [ <address> ] <history-option>*',
      '<history-option> ::= "--list" | "--limit" <count> | "--all" | "--ids" | "--stats" | "--breakdown" [ <token> ] | "--leaderboard" | "--scoreboard" | "--url" | "--offline" | "--refresh" | "--from-block" <block> | "--to-block" <block> | "--chunk-size" <count> | "--json"',
      '<address> ::= "0x" <40-hex-chars>',
      '<block> ::= <integer>                         ; block number >= 0',
      '<count> ::= <integer>                         ; value > 0',
    ],
    examples: [
      `${BINARY_NAME} history`,
      `${BINARY_NAME} history --list`,
      `${BINARY_NAME} history 0x1234567890abcdef1234567890abcdef12345678 --limit 25`,
      `${BINARY_NAME} history --stats`,
      `${BINARY_NAME} history --breakdown video-poker`,
      `${BINARY_NAME} history --scoreboard --ids`,
      `${BINARY_NAME} history --refresh --from-block 0`,
    ],
    notes: [
      '`--offline` cannot be combined with `--refresh`.',
      '`--url` and `--ids` affect terminal scoreboard reference columns; JSON keeps both fields.',
      `Use ${BINARY_NAME} wallet download --from-block 0 to rebuild history from genesis.`,
    ],
  });
}

function formatScoreboardHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'omitted                Build/read cached scoreboards for [address] or the selected local wallet',
      '--list                 List wallets with cached scoreboards or derivable history',
      '--refresh              Refresh local history before rebuilding the scoreboard',
    ],
    parameters: ['[address]              Wallet address to inspect; defaults to selected local wallet'],
    options: [
      '--list                 List wallet addresses with local cached scoreboards or history',
      '--ids                  Show game IDs in terminal scoreboard tables',
      '--url                  Show game URLs in terminal scoreboard tables',
      '--refresh              Refresh local history from chain before showing scoreboard',
      '--from-block <n>       Start block for --refresh sync/backfill',
      '--to-block <n>         End block for --refresh sync; default is latest',
      '--chunk-size <n>       Block range per log query during refresh',
      '--json                 Emit JSON output',
    ],
    bnf: [
      '<scoreboard-command> ::= "scoreboard" [ <address> ] <scoreboard-option>*',
      '<scoreboard-option> ::= "--list" | "--ids" | "--url" | "--refresh" | "--from-block" <block> | "--to-block" <block> | "--chunk-size" <count> | "--json"',
      '<address> ::= "0x" <40-hex-chars>',
      '<block> ::= <integer>                         ; block number >= 0',
      '<count> ::= <integer>                         ; value > 0',
    ],
    examples: [
      `${BINARY_NAME} scoreboard`,
      `${BINARY_NAME} scoreboard --list`,
      `${BINARY_NAME} scoreboard 0x1234567890abcdef1234567890abcdef12345678 --url`,
      `${BINARY_NAME} scoreboard --refresh --from-block 0 --json`,
    ],
    notes: [
      'Renders Highest Multipliers and Biggest Payouts Top 20 tables derived from cached history.',
      'If both --ids and --url are passed in terminal mode, the last one wins for the reference column.',
    ],
  });
}

function formatFeesHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'scan    Read observed GameEnded logs for one game and update compact fee aggregates',
      'report  Read the local compact fee log and compare the selected wallet to the rest of the game',
      'omitted                Defaults to report, but <game> is still required',
    ],
    parameters: [
      '[action]               Fee action: scan or report',
      '[game]                 Game key, alias, or display name to scan/report',
    ],
    options: [
      '--wallet <address>     Wallet to compare/store exact target aggregates; defaults to current wallet',
      '--from-block <n>       Start block for explicit scan range',
      '--to-block <n>         End block for scan range; default is latest',
      '--floor-block <n>      Oldest block for automatic backfill',
      '--chunk-size <n>       Block range per fee log query',
      '--max-chunks <n>       Max chunks this run; 0 means unlimited/full backfill',
      '--min-games <n>        Minimum games for wallet leaderboards in reports',
      '--cap-mb <n>           Per-game fee log cap in MiB',
      '-y, --yes              Skip unlimited scan confirmation',
      '--json                 Emit JSON output',
    ],
    bnf: FEES_HELP_BNF_LINES,
    examples: [
      `${BINARY_NAME} fees scan primes`,
      `${BINARY_NAME} fees scan jungle --max-chunks 10`,
      `${BINARY_NAME} fees scan primes --yes --json`,
      `${BINARY_NAME} fees report primes`,
      `${BINARY_NAME} fees report primes --wallet 0x1111111111111111111111111111111111111111 --json`,
    ],
    notes: [
      `Storage: ${LOG_DIR}/fees/<canonical-game-key>.json.`,
      `Default cap: ${DEFAULT_FEE_ANALYSIS_CAP_BYTES / (1024 * 1024)} MiB per game.`,
      'The report action does not call the RPC.',
    ],
  });
}

function formatGamesHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `games` lists the supported game catalog directly.'],
    parameters: ['None.'],
    options: [
      '-l, --list            Emit a plain text play-line list only',
      '--stats                Append the full Game Stats catalog, using local history when available',
      '--json                 Emit JSON output',
    ],
    bnf: ['<games-command> ::= "games" <games-option>*', '<games-option> ::= "-l" | "--list" | "--stats" | "--json"'],
    examples: [
      `${BINARY_NAME} games`,
      `${BINARY_NAME} games --list`,
      `${BINARY_NAME} games --stats`,
      `${BINARY_NAME} games --json`,
    ],
    notes: ['Use `game <name>` for one game\'s aliases, parameters, and contract metadata.'],
  });
}

function formatGameHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `game` prints metadata and grammar for one selected game.'],
    parameters: ['<name>                 Supported canonical game key, alias, or display name'],
    options: ['--json                 Emit JSON output'],
    bnf: [
      '<game-command> ::= "game" <game-name> [ "--json" ]',
      '<game-name> ::= <stateless-game> | "blackjack" | "bj" | "cash-dash" | "cashdash" | "dash" | "hi-lo-nebula" | "hilonebula" | "hilo" | "nebula" | "video-poker" | "vp"',
      '<stateless-game> ::= <game-key> | <game-alias>',
    ],
    examples: [
      `${BINARY_NAME} game roulette`,
      `${BINARY_NAME} game jungle-plinko`,
      `${BINARY_NAME} game blackjack`,
      `${BINARY_NAME} game video-poker --json`,
    ],
    notes: ['The output includes per-game parameters, BNF where configured, examples, aliases, ABI status, and contract address.'],
  });
}

function formatCommandsHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `commands` prints the terminal command index directly.'],
    parameters: ['None.'],
    options: [],
    bnf: ['<commands-command> ::= "commands"'],
    examples: [`${BINARY_NAME} commands`],
    notes: ['For exhaustive command-specific inline help, run `<command> --help`.'],
  });
}

function formatHelpCommandAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'omitted                List available help topics',
      'loop                   Loop mode and safety controls',
      'strategies             Betting strategies',
      'auto                   Stateful auto-play and solver modes',
      'wallet                 Wallet security and history download workflow',
      'bucket                 Encrypted R2 bot log mirror setup',
      'history                History cache and reporting workflow',
      'house                  The House staking system',
      'commands               Command-specific help workflow and command index',
    ],
    parameters: ['[topic]                Help topic name'],
    options: ['--json                 Emit JSON output with topic metadata/content'],
    bnf: [
      '<help-command> ::= "help" [ <help-topic> ] [ "--json" ]',
      '<help-topic> ::= "loop" | "strategies" | "auto" | "wallet" | "bucket" | "history" | "house" | "commands"',
    ],
    examples: [
      `${BINARY_NAME} help`,
      `${BINARY_NAME} help loop`,
      `${BINARY_NAME} help commands`,
      `${BINARY_NAME} help wallet --json`,
    ],
    notes: ['Use `<command> --help` for the complete inline reference for a specific command.'],
  });
}

function formatSendHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: ['None. `send` transfers the selected asset directly.'],
    parameters: [
      '<asset>                Transfer asset: APE or GP',
      '<amount>               APE decimal amount, or GP whole-number amount',
      '<destination>          Destination 0x wallet address',
    ],
    options: ['--json                 Emit JSON output only'],
    bnf: [
      '<send-command> ::= "send" <asset> <amount> <address> [ "--json" ]',
      '<asset> ::= "APE" | "GP"',
      '<amount> ::= <ape> | <gp-amount>',
      '<gp-amount> ::= <integer>                       ; whole number because GP has 0 decimals',
      '<address> ::= "0x" <40-hex-chars>',
    ],
    examples: [
      `${BINARY_NAME} send APE 10 0x1234567890abcdef1234567890abcdef12345678`,
      `${BINARY_NAME} send GP 250 0x1234567890abcdef1234567890abcdef12345678 --json`,
    ],
    notes: ['wAPE is not transferable through this CLI because the tracker contract does not expose transfer().'],
  });
}

function formatHouseHelpAppendix() {
  return formatCommandHelpAppendix({
    actions: [
      'omitted/status/info    Show global House stats and selected-wallet position',
      'deposit <amount>       Deposit APE into The House',
      'withdraw <amount>      Withdraw staked APE after the lock period',
    ],
    parameters: [
      '[action]               House action: status, info, deposit, or withdraw',
      '[amount]               Decimal APE amount for deposit/withdraw',
    ],
    options: ['--json                 Emit JSON output only'],
    bnf: [
      '<house-command> ::= "house" [ <house-action> [ <ape> ] ] [ "--json" ]',
      '<house-action> ::= "status" | "info" | "deposit" | "withdraw"',
      '<ape> ::= <number>                              ; decimal APE amount; value > 0',
    ],
    examples: [
      `${BINARY_NAME} house`,
      `${BINARY_NAME} house status --json`,
      `${BINARY_NAME} house deposit 100`,
      `${BINARY_NAME} house withdraw 50`,
    ],
    notes: [
      `Deposit lock time: ${HOUSE_LOCK_TIME / 60} minutes.`,
      `Withdraw fee: ${(HOUSE_WITHDRAW_FEE * 100).toFixed(0)}%.`,
      'The displayed house_yield is the current HOUSE price multiplier since launch, not annualized APY.',
    ],
  });
}

function formatStatefulCommandHelpAppendix(gameKey) {
  const gameHelp = {
    blackjack: {
      actions: [
        '<amount>               Start a new blackjack hand with this APE bet',
        'resume                 Resume unfinished blackjack games',
        'status                 Show the current blackjack game state',
        'hit                    Draw another card',
        'stand                  Keep current hand',
        'double                 Double bet, take one card, then stand',
        'split                  Split an eligible pair into two hands',
        'insurance              Take insurance when dealer shows Ace',
        'surrender              Forfeit half the bet where available',
        'clear                  Clear locally tracked unfinished blackjack games',
      ],
      parameters: [
        '[action]               Bet amount or blackjack action',
        '[amount]               Optional second positional value; used only by action forms that need it',
      ],
      options: [
        ...STATEFUL_SHARED_HELP_OPTION_LINES,
        '--auto [mode]          Auto-play the hand: simple, best, or max',
        '--solver [mode]        Show manual suggested action: simple, best, or max',
        '--side <ape>           Player side bet amount; value >= 0',
        '--solver-max-states <n> Best/max exact-EV search state cap',
        '--solver-timeout-ms <ms> Best/max exact-EV worker timeout',
        ...LOOP_HELP_OPTION_LINES,
      ],
      bnf: [
        '<blackjack-command> ::= ( "blackjack" | "bj" ) [ <blackjack-head> ] [ <ape> ] <blackjack-option>*',
        '<blackjack-head> ::= <ape> | "resume" | "status" | "hit" | "stand" | "double" | "split" | "insurance" | "surrender" | "clear"',
        '<blackjack-option> ::= <stateful-common-option> | "--auto" [ <blackjack-auto-mode> ] | "--solver" [ <blackjack-auto-mode> ] | "--side" <ape-nonnegative> | "--solver-max-states" <count> | "--solver-timeout-ms" <count> | <stateful-loop-option>',
        '<blackjack-auto-mode> ::= "simple" | "best" | "max"',
        ...STATEFUL_SHARED_BNF_LINES,
        ...BET_STRATEGY_HELP_LINES,
        ...COMMON_BNF_LINES,
      ],
      examples: [
        `${BINARY_NAME} blackjack 10`,
        `${BINARY_NAME} bj 25 --side 1`,
        `${BINARY_NAME} blackjack 25 --auto best`,
        `${BINARY_NAME} blackjack 25 --solver max`,
        `${BINARY_NAME} blackjack hit --game 123`,
        `${BINARY_NAME} blackjack 10 --auto --loop --take-profit 500`,
      ],
      notes: ['Dealer hits soft 17. best/max modes use the exact-EV worker and fall back to simple mode on cap/timeout.'],
    },
    'cash-dash': {
      actions: [
        '<amount>               Start a new Cash Dash run with this APE bet',
        'resume                 Resume unfinished Cash Dash games',
        'status                 Show current game state',
        'payouts/table          Show verified row payout table',
        'guess/tile/pick <tile> Continue with a tile pick',
        'random/r               Pick a random tile in the active row',
        'cashout/cash/c         Bank current winnings and end the run',
        'clear                  Clear locally tracked unfinished Cash Dash games',
      ],
      parameters: [
        '[action]               Bet amount or Cash Dash action',
        '[amount]               Tile payload for guess/tile/pick, or unused for other actions',
      ],
      options: [
        ...STATEFUL_SHARED_HELP_OPTION_LINES,
        '--auto [mode]          Auto-play the run: simple or best',
        '--solver               Show best continuation suggestion in manual mode',
        '--tile <tile>          Opening tile: 1-7 or random',
        '--cashout-after <rows> Auto-play cashes out after N safe rows',
        ...LOOP_HELP_OPTION_LINES,
      ],
      bnf: [
        '<cash-dash-command> ::= ( "cash-dash" | "cashdash" | "dash" ) [ <cash-dash-head> ] [ <cash-dash-tile> ] <cash-dash-option>*',
        '<cash-dash-head> ::= <ape> | "resume" | "status" | "payouts" | "table" | "clear" | "guess" | "tile" | "pick" | "random" | "r" | "cashout" | "cash" | "c"',
        '<cash-dash-tile> ::= "random" | "r" | <integer>',
        '<cash-dash-option> ::= <stateful-common-option> | "--auto" [ <auto-mode> ] | "--solver" | "--tile" <cash-dash-tile> | "--cashout-after" <count> | <stateful-loop-option>',
        '<auto-mode> ::= "simple" | "best"',
        ...STATEFUL_SHARED_BNF_LINES,
        ...BET_STRATEGY_HELP_LINES,
        ...COMMON_BNF_LINES,
      ],
      examples: [
        `${BINARY_NAME} cash-dash 25`,
        `${BINARY_NAME} cashdash 25 --tile 3`,
        `${BINARY_NAME} dash 25 --auto best --cashout-after 3`,
        `${BINARY_NAME} cash-dash guess 2`,
        `${BINARY_NAME} cash-dash cashout --game 123`,
        `${BINARY_NAME} cash-dash 25 --auto best --loop --max-games 20`,
      ],
      notes: ['Each row has one hidden death tile. Cashout becomes available after a safe resolved row.'],
    },
    'hi-lo-nebula': {
      actions: [
        '<amount>               Start a new Hi-Lo Nebula run with this APE bet',
        'resume                 Resume unfinished Hi-Lo Nebula games',
        'status                 Show current game state',
        'payouts/table          Show verified payout table',
        'higher/high/h          Guess next rank is higher',
        'lower/low/l            Guess next rank is lower',
        'same/push/s            Guess next rank is the same',
        'cashout/cash/c         Bank current winnings and end the run',
        'clear                  Clear locally tracked unfinished Hi-Lo Nebula games',
      ],
      parameters: [
        '[action]               Bet amount or Hi-Lo Nebula action',
        '[amount]               Optional second positional value; normally unused',
      ],
      options: [
        ...STATEFUL_SHARED_HELP_OPTION_LINES,
        '--auto [mode]          Auto-play the run: simple, best, or winston-ladder',
        '--solver [mode]        Show manual continuation suggestion; defaults to best',
        ...LOOP_HELP_OPTION_LINES,
      ],
      bnf: [
        '<hi-lo-nebula-command> ::= ( "hi-lo-nebula" | "hilonebula" | "hilo" | "nebula" ) [ <hi-lo-nebula-head> ] [ <ape> ] <hi-lo-nebula-option>*',
        '<hi-lo-nebula-head> ::= <ape> | "resume" | "status" | "payouts" | "table" | "clear" | "higher" | "high" | "h" | "lower" | "low" | "l" | "same" | "push" | "s" | "cashout" | "cash" | "c"',
        '<hi-lo-nebula-option> ::= <stateful-common-option> | "--auto" [ <hi-lo-auto-mode> ] | "--solver" [ <hi-lo-auto-mode> ] | <stateful-loop-option>',
        '<hi-lo-auto-mode> ::= "simple" | "best" | "winston-ladder"',
        ...STATEFUL_SHARED_BNF_LINES,
        ...BET_STRATEGY_HELP_LINES,
        ...COMMON_BNF_LINES,
      ],
      examples: [
        `${BINARY_NAME} hi-lo-nebula 25`,
        `${BINARY_NAME} hilo 25 --solver best`,
        `${BINARY_NAME} nebula 25 --auto winston-ladder`,
        `${BINARY_NAME} hi-lo-nebula lower`,
        `${BINARY_NAME} hi-lo-nebula cashout --game 123`,
        `${BINARY_NAME} hi-lo-nebula 25 --auto best --loop --max-loss 20`,
      ],
      notes: ['Ranks 2..A are sampled uniformly with replacement. best mode accounts for VRF and live jackpot snapshot.'],
    },
    'video-poker': {
      actions: [
        '<amount>               Start a new Video Poker hand; valid bets are 1, 5, 10, 25, 50, 100 APE',
        'resume                 Resume unfinished Video Poker hands',
        'status                 Show current game state',
        'payouts/table          Show payout table',
        'clear                  Clear locally tracked unfinished Video Poker hands',
      ],
      parameters: [
        '[action]               Fixed bet amount or Video Poker action',
        '[amount]               Optional second positional value; normally unused',
      ],
      options: [
        ...STATEFUL_SHARED_HELP_OPTION_LINES,
        '--auto [mode]          Auto-play the hand: simple or best',
        '--solver               Show best-EV hold suggestion in interactive play',
        ...LOOP_HELP_OPTION_LINES,
      ],
      bnf: [
        '<video-poker-command> ::= ( "video-poker" | "vp" ) [ <video-poker-head> ] [ <video-poker-bet> ] <video-poker-option>*',
        '<video-poker-head> ::= <video-poker-bet> | "resume" | "status" | "payouts" | "table" | "clear"',
        '<video-poker-bet> ::= "1" | "5" | "10" | "25" | "50" | "100"',
        '<video-poker-option> ::= <stateful-common-option> | "--auto" [ <auto-mode> ] | "--solver" | <stateful-loop-option>',
        '<auto-mode> ::= "simple" | "best"',
        ...STATEFUL_SHARED_BNF_LINES,
        ...BET_STRATEGY_HELP_LINES,
        ...COMMON_BNF_LINES,
      ],
      examples: [
        `${BINARY_NAME} video-poker 10`,
        `${BINARY_NAME} vp 100`,
        `${BINARY_NAME} video-poker 25 --auto best`,
        `${BINARY_NAME} video-poker resume --game 123`,
        `${BINARY_NAME} video-poker 25 --auto best --loop --giveback-profit 40`,
      ],
      notes: ['Max bet 100 APE is jackpot eligible on Royal Flush. best mode enumerates hold combinations and redraw outcomes.'],
    },
  }[gameKey];

  return formatCommandHelpAppendix(gameHelp);
}

program.addHelpText('after', formatTopLevelHelpAppendix());

function printConfigBnf(cfg = {}) {
  const lines = Array.isArray(cfg?.bnf)
    ? cfg.bnf
    : (typeof cfg?.bnf === 'string' && cfg.bnf.trim() ? [cfg.bnf] : []);
  if (lines.length === 0) {
    return;
  }

  console.log('      BNF:');
  for (const line of lines) {
    console.log(`        ${line}`);
  }
}

function isPublicGameConfigEntry(cfg) {
  return Boolean(
    cfg
    && typeof cfg === 'object'
    && (
      cfg.description
      || cfg.min !== undefined
      || cfg.max !== undefined
      || cfg.default !== undefined
      || cfg.cliName
      || Array.isArray(cfg.bnf)
      || Array.isArray(cfg.examples)
      || Array.isArray(cfg.options)
    )
  );
}

function formatBearDiceResultLines(details = {}) {
  const rolls = Array.isArray(details?.rolls) ? details.rolls : [];
  if (rolls.length === 0) {
    return [];
  }

  const numRuns = Number(details.num_runs ?? rolls.length);
  const trailingZeroSlots = Number(details.trailing_zero_slots ?? Math.max(numRuns - rolls.length, 0));
  const lines = [
    `   Rolls executed: ${rolls.length}/${numRuns}`,
  ];

  for (const roll of rolls) {
    const verdict = roll.losing ? 'loss' : 'safe';
    lines.push(`   Roll ${roll.index}: ${roll.die_1}+${roll.die_2} = ${roll.sum} (${verdict})`);
  }

  if (trailingZeroSlots > 0) {
    lines.push(`   Remaining ${trailingZeroSlots} roll(s): not executed after the first loss; getGameInfo leaves those slots at 0.`);
  }

  return lines;
}

function formatGlydeOrCrashResultLines(details = {}) {
  const lines = [];

  if (details?.target_multiplier) {
    lines.push(`   Target: ${details.target_multiplier}`);
  }

  if (details?.crash_multiplier) {
    lines.push(`   Crash: ${details.crash_multiplier}`);
  }

  if (details?.reached_target === true) {
    lines.push('   Outcome: target reached before the crash.');
  } else if (details?.reached_target === false) {
    lines.push('   Outcome: crash happened before the target.');
  }

  return lines;
}

// --- Helper: Interactive prompt ---
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function collectPasswordForWalletFile({
  commandLabel = `${BINARY_NAME} install`,
  promptLabel = 'wallet password',
} = {}) {
  const envPassword = process.env[PASS_ENV_VAR];
  if (envPassword) return envPassword;

  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    console.error(`
❌ Secure password entry requires an interactive terminal.
   Fallback: set ${PASS_ENV_VAR} only if you must run ${commandLabel} non-interactively.
`);
    process.exit(1);
  }

  const password = await promptSecret(`Set ${promptLabel} (input hidden): `);
  if (!password || password.length < 8) {
    console.error('\n❌ Password must be at least 8 characters\n');
    process.exit(1);
  }

  const confirm = await promptSecret(`Confirm ${promptLabel} (input hidden): `);
  if (password !== confirm) {
    console.error('\n❌ Passwords do not match\n');
    process.exit(1);
  }

  return password;
}

async function collectHintsIfInteractive({
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  intro = '\nOptional password hints (stored locally, max 3, never the password itself):',
} = {}) {
  if (!interactive) {
    return [];
  }

  console.log(intro);
  const hints = [];
  for (let i = 1; i <= 3; i++) {
    const hint = await prompt(`Hint ${i}: `);
    if (hint.trim()) hints.push(hint.trim());
  }
  return hints;
}

async function collectPrivateKeyForWalletImport({ commandLabel = `${BINARY_NAME} install` } = {}) {
  const envPrivateKey = getConfiguredPrivateKey();
  if (envPrivateKey) return envPrivateKey;

  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    console.error(`
❌ Secure private key entry requires an interactive terminal.
   Fallback: set ${PRIVATE_KEY_ENV_VAR} only if you must run ${commandLabel} non-interactively.
`);
    process.exit(1);
  }

  let privateKeyInput;
  try {
    privateKeyInput = await promptSecret('Enter private key (input hidden): ');
  } catch (error) {
    console.error(`
❌ ${sanitizeError(error)}
`);
    process.exit(1);
  }

  const privateKey = privateKeyInput.trim();
  if (!privateKey) {
    console.error('\n❌ Private key is required.\n');
    process.exit(1);
  }

  return privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
}

async function collectR2CredentialField({
  envVar,
  label,
  commandLabel = `${BINARY_NAME} bucket install`,
  hidden = false,
} = {}) {
  const envValue = String(process.env[envVar] || '').trim();
  if (envValue) return envValue;

  const outputStream = hidden ? process.stderr : process.stdout;
  if (!process.stdin.isTTY || !outputStream.isTTY) {
    const entryType = hidden ? `Secure ${label} entry` : `${label} entry`;
    throw new Error(`${entryType} requires an interactive terminal. Set ${envVar} only if you must run ${commandLabel} non-interactively.`);
  }

  const value = String(hidden
    ? await promptSecret(`${label} (input hidden): `)
    : await prompt(`${label}: `) || '').trim();
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function resolveR2BucketForInstall(bucket) {
  return normalizeR2BucketName(bucket || process.env[R2_NAME_ENV_VAR]);
}

async function collectR2CredentialsForInstall(bucket, {
  commandLabel = `${BINARY_NAME} bucket install`,
} = {}) {
  const normalizedBucket = resolveR2BucketForInstall(bucket);
  const accountId = await collectR2CredentialField({ envVar: R2_ACCOUNT_ID_ENV_VAR, label: 'R2 account ID', commandLabel });
  const apiToken = await collectR2CredentialField({ envVar: R2_TOKEN_ENV_VAR, label: 'R2 API token', commandLabel, hidden: true });
  const accessKeyId = await collectR2CredentialField({ envVar: R2_KEY_ENV_VAR, label: 'R2 access key ID', commandLabel });
  const secretAccessKey = await collectR2CredentialField({ envVar: R2_SECRET_ENV_VAR, label: 'R2 secret access key', commandLabel, hidden: true });

  return {
    bucket: normalizedBucket,
    accountId,
    apiToken,
    accessKeyId,
    secretAccessKey,
  };
}

async function collectR2PasswordForVerboseBucketOutput({
  commandLabel = `${BINARY_NAME} bucket status -v`,
} = {}) {
  const envPassword = process.env[PASS_ENV_VAR];
  if (envPassword) return envPassword;

  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error(`Verbose bucket output requires ${PASS_ENV_VAR} or an interactive terminal for secure password entry. Set ${PASS_ENV_VAR} only if you must run ${commandLabel} non-interactively.`);
  }

  const password = await promptSecret('R2 encryption password (input hidden): ');
  if (!password) {
    throw new Error('R2 encryption password is required.');
  }
  return password;
}

function getR2BucketEnvironmentFallbacks(credentials = {}) {
  return {
    [R2_NAME_ENV_VAR]: credentials.bucket || '',
    [R2_ACCOUNT_ID_ENV_VAR]: credentials.account_id || '',
    [R2_TOKEN_ENV_VAR]: credentials.api_token || '',
    [R2_KEY_ENV_VAR]: credentials.access_key_id || '',
    [R2_SECRET_ENV_VAR]: credentials.secret_access_key || '',
  };
}

function sanitizeVerboseValue(value) {
  return String(value ?? '')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function getR2VerboseBucketDetails(entry, password) {
  const loaded = loadStoredR2ConfigCredentials(entry, { password });
  if (!loaded.enabled) {
    const bucketLabel = entry?.bucket ? ` for ${entry.bucket}` : '';
    throw new Error(`Failed to decrypt R2 bucket config${bucketLabel}: ${loaded.reason || 'unknown error'}.`);
  }

  return {
    bucket: loaded.bucket,
    enabled: Boolean(entry.isCurrent),
    endpoints: loaded.endpoints,
    environment_fallbacks: getR2BucketEnvironmentFallbacks(loaded.credentials),
  };
}

function printR2VerboseBucketDetails(details, { indent = '   ' } = {}) {
  console.log(`${indent}Endpoints:`);
  console.log(`${indent}  S3 API:          ${details.endpoints.s3_endpoint}`);
  console.log(`${indent}  Bucket API:      ${details.endpoints.bucket_endpoint}`);
  console.log(`${indent}Environment fallback values:`);
  for (const [name, value] of Object.entries(details.environment_fallbacks)) {
    console.log(`${indent}  ${name}=${sanitizeVerboseValue(value)}`);
  }
}

function getCurrentUnfinishedGames(walletAddress = getWalletAddress()) {
  if (!walletAddress) {
    return [];
  }

  const activeGames = loadActiveGames(walletAddress);
  return summarizeUnfinishedGames(activeGames);
}

function prepareCurrentWalletForSwitch({ json = false } = {}) {
  const currentAddress = getWalletAddress();
  if (!currentAddress) {
    return null;
  }

  ensureWalletScopedData(currentAddress);
  const unfinishedGames = getCurrentUnfinishedGames(currentAddress);
  if (unfinishedGames.length > 0) {
    const message = 'Cannot switch wallets while unfinished games are still open for the current wallet. Resume or clear them first.';
    if (json) {
      console.log(JSON.stringify({ error: message, unfinished_games: unfinishedGames }));
    } else {
      console.error(`\n❌ ${message}\n`);
      console.error(`${formatUnfinishedGamesSection(unfinishedGames)}\n`);
    }
    process.exit(1);
  }

  return currentAddress;
}

function printSelectableWallets(wallets) {
  console.log('\nAvailable wallets:\n');
  wallets.forEach((wallet, index) => {
    const currentLabel = wallet.isCurrent ? ' (current)' : '';
    console.log(`   ${index + 1}. ${wallet.address}${currentLabel}`);
  });
  console.log('');
}

function printAddressList(title, addresses, { currentAddress = null } = {}) {
  console.log(`\n${title}\n`);
  if (addresses.length === 0) {
    console.log('   (none)\n');
    return;
  }

  addresses.forEach((address, index) => {
    const currentLabel = currentAddress && currentAddress.toLowerCase() === String(address).toLowerCase()
      ? ' (current)'
      : '';
    console.log(`   ${index + 1}. ${address}${currentLabel}`);
  });
  console.log('');
}

async function promptForWalletSelection(wallets) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('wallet select without <address> requires an interactive terminal.');
  }

  printSelectableWallets(wallets);

  while (true) {
    const answer = (await prompt('Select wallet number [1]: ')).trim();
    if (!answer) {
      return wallets[0];
    }

    const selectedIndex = Number.parseInt(answer, 10);
    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= wallets.length) {
      return wallets[selectedIndex - 1];
    }

    console.log(`\nChoose a number between 1 and ${wallets.length}.\n`);
  }
}

async function confirmGameplayPasswordPromptBehavior({ json = false, forcePrompt = false } = {}) {
  if ((json && !forcePrompt) || process.env[PASS_ENV_VAR]) {
    return true;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return true;
  }

  const meta = getWalletPublicMetadata();
  if (!meta?.encrypted) {
    return true;
  }

  while (true) {
    const answer = (await prompt(`
🔐 No ${PASS_ENV_VAR} is set.
If you play now, the CLI will prompt for your wallet password before each signing interaction.

Choose:
  [s] Stop now and set it first
  [c] Continue and prompt each time

Continue? [s/C]: `)).trim().toLowerCase();

    if (answer === '' || answer === 'c' || answer === 'continue') {
      console.log('');
      return true;
    }

    if (answer === 's' || answer === 'stop' || answer === 'set') {
      console.log(`
Set it in your shell, then rerun the game command:
  export ${PASS_ENV_VAR}="your-password"
`);
      return false;
    }

    console.log('\nPlease answer "s" to stop or "c" to continue.\n');
  }
}

function formatPlainApe(apeAmount, decimals = 2) {
  const value = Number.parseFloat(apeAmount || 0);
  if (!Number.isFinite(value)) {
    return `0.${'0'.repeat(decimals)} APE`;
  }
  return `${value.toFixed(decimals)} APE`;
}

function formatPlainTokenAmount(amount, decimals = 2) {
  const value = Number.parseFloat(amount || 0);
  if (!Number.isFinite(value)) {
    return `0.${'0'.repeat(decimals)}`;
  }
  return value.toFixed(decimals);
}

function formatNullableValue(value, formatter) {
  if (value === null || value === undefined) {
    return 'n.a.';
  }

  return formatter ? formatter(value) : String(value);
}

function formatHistoryRtpDetails(stats) {
  return formatRtpDetails({
    totalPayoutApe: stats.total_payout_ape,
    totalWageredApe: stats.total_wagered_ape,
    netResultApe: stats.win_loss_ape,
  });
}

function formatAverageGpRatio(value) {
  if (value === null || value === undefined) {
    return 'n.a.';
  }

  return `${formatGpPerApeValue(value)} GP/APE`;
}

function formatHistoryStatsReport(stats) {
  const netResultValue = Number.parseFloat(stats.net_result_ape || 0);
  const netResultIcon = netResultValue > 0 ? '🎉' : netResultValue < 0 ? '💀' : '🤝';
  const lines = [
    '',
    '📜 History Stats:',
    `   🎰 Games: ${stats.games}`,
    `   💸 Contract fees paid: ${formatPlainApe(stats.contract_fees_paid_ape, 4)}`,
    `   ⛽️ Gas paid: ${formatPlainApe(stats.gas_paid_ape, 4)}`,
    `   ${netResultIcon} Net result: ${formatPnL(stats.net_result_ape, 2)} ${theme.dim(`(gross ${formatPlainApe(stats.gross_result_ape)})`)}`,
    `   ✌️  Win rate: ${stats.win_rate.toFixed(2)}% (${stats.wins}/${stats.games})`,
    `   ${formatRtpTripletLine({ currentRtp: stats.rtp })} ${formatHistoryRtpDetails(stats)}`,
    `   🎟️  APE Wagered (wAPE): ${formatNullableValue(stats.current_wape_balance_ape, (value) => formatPlainTokenAmount(value, 2))}/${formatPlainTokenAmount(stats.total_wape_received_ape, 2)}`,
    `   🧮 Gimbo Points (GP): ${formatNullableValue(stats.current_gp_balance_display)}/${stats.total_gp_received_display}`,
    `   📈 Average GP Ratio: ${formatAverageGpRatio(stats.average_gp_per_ape)}`,
    `   🪜 Level rate: Every ${GP_PER_LEVEL.toLocaleString('en-US')} GP = 1 Level`,
  ];

  if (stats.unsynced_games > 0) {
    lines.push(`   ${theme.warning(`${stats.unsynced_games} saved game(s) are still excluded from economic stats.`)}`);
  }

  return lines.join('\n');
}

function formatHistoryBreakdownReport(gameStats) {
  if (!Array.isArray(gameStats) || gameStats.length === 0) {
    return '';
  }

  const lines = [
    '',
    '🎮 Breakdown:',
  ];

  for (const stats of gameStats) {
    const netResultValue = Number.parseFloat(stats.net_result_ape || 0);
    const netResultIcon = netResultValue > 0 ? '🎉' : netResultValue < 0 ? '💀' : '🤝';

    lines.push(`   ${theme.label(`${stats.game || 'Unknown'}:`)}`);
    lines.push(`      🎰 Games: ${stats.games}`);
    lines.push(`      💸 Contract fees paid: ${formatPlainApe(stats.contract_fees_paid_ape, 4)}`);
    lines.push(`      ⛽️ Gas paid: ${formatPlainApe(stats.gas_paid_ape, 4)}`);
    lines.push(`      ${netResultIcon} Net result: ${formatPnL(stats.net_result_ape, 2)} ${theme.dim(`(gross ${formatPlainApe(stats.gross_result_ape)})`)}`);
    lines.push(`      ✌️  Win rate: ${stats.win_rate.toFixed(2)}% (${stats.wins}/${stats.games})`);
    lines.push(`      ${formatRtpTripletLine({
      game: stats.rtp_game || stats.game_key || stats.game,
      config: stats.rtp_config || null,
      currentRtp: stats.rtp,
    })} ${formatHistoryRtpDetails(stats)}`);
    lines.push(`      🎯 Max hit: ${formatObservedMultiplier(stats.max_hit_x)}`);
    lines.push(`      🎟️  APE Wagered (wAPE) received: ${formatPlainTokenAmount(stats.total_wape_received_ape, 2)}`);
    lines.push(`      🧮 Gimbo Points (GP) received: ${stats.total_gp_received_display}`);
    lines.push(`      📈 Average GP Ratio: ${formatAverageGpRatio(stats.average_gp_per_ape)}`);
    lines.push(`      🪜 Level rate: Every ${GP_PER_LEVEL.toLocaleString('en-US')} GP = 1 Level`);

    if (stats.unsynced_games > 0) {
      lines.push(`      ${theme.warning(`${stats.unsynced_games} saved game(s) are still excluded from economic stats.`)}`);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function formatScoreNumericValue(value, { suffix = '', decimals = 6, trimTrailingZeros = true } = {}) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return theme.warning('…');
  }

  const formatted = numeric.toFixed(decimals);
  return theme.value(`${trimTrailingZeros ? formatted.replace(/\.?0+$/, '') : formatted}${suffix}`);
}

function formatScoreDateValue(value) {
  const normalized = String(value || '').trim();
  return normalized ? theme.dim(normalized) : theme.warning('…');
}

function formatScoreModeValue(value) {
  const normalized = String(value || '').trim();
  return normalized ? theme.value(normalized) : theme.dim('Base');
}

function formatScoreUrlValue(value) {
  const normalized = String(value || '').trim();
  return normalized || theme.warning('…');
}

function formatScoreIdValue(value) {
  const normalized = String(value || '').trim();
  return normalized ? theme.value(normalized) : theme.warning('…');
}

function formatLeaderboardApeAmount(amount) {
  const normalized = String(amount ?? '0').trim();
  if (!normalized) {
    return '0.00';
  }

  const sign = normalized.startsWith('-') ? '-' : '';
  const unsigned = sign ? normalized.slice(1) : normalized;
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const paddedFraction = fractionRaw.padEnd(3, '0');
  const roundUp = Number(paddedFraction[2] || '0') >= 5;
  let cents = BigInt(`${whole}${paddedFraction.slice(0, 2)}`);

  if (roundUp) {
    cents += 1n;
  }

  const roundedWhole = cents / 100n;
  const roundedFraction = cents % 100n;
  return `${sign}${roundedWhole}.${roundedFraction.toString().padStart(2, '0')}`;
}

function resolveLeaderboardTerminalWidth() {
  const columns = Number(process.stdout?.columns || 0);
  return Number.isFinite(columns) && columns > 0 ? columns : 80;
}

function truncateLeaderboardCell(text, maxVisibleWidth) {
  const source = String(text ?? '');
  if (getVisibleWidth(source) <= maxVisibleWidth) {
    return source;
  }

  if (maxVisibleWidth <= 0) {
    return '';
  }

  if (maxVisibleWidth === 1) {
    return '…';
  }

  const truncated = truncateAnsi(source, maxVisibleWidth - 1).replace(/[\s,]+$/g, '');
  return `${truncated || truncateAnsi(source, maxVisibleWidth - 1)}…`;
}

function formatLeaderboardWeekPlays(plays) {
  if (!Array.isArray(plays) || plays.length === 0) {
    return '';
  }

  return plays
    .map((play) => `${Number(play.plays || 0)} ${play.game || 'unknown'}`)
    .join(', ');
}

function formatHistoryWapeLeaderboardReport(leaderboard, { terminalWidth = resolveLeaderboardTerminalWidth() } = {}) {
  const weeks = Array.isArray(leaderboard?.weeks) ? leaderboard.weeks : [];
  const lines = [
    `Global: ${formatLeaderboardApeAmount(leaderboard?.total_wagered_ape)} $APE wagered over ${Number(leaderboard?.total_games || 0)} games`,
  ];

  if (weeks.length > 0) {
    const rows = weeks.map((week) => ({
      week: week.week_label || `${week.year} W${String(week.week).padStart(2, '0')}`,
      amount: formatLeaderboardApeAmount(week.wagered_ape),
      plays: formatLeaderboardWeekPlays(week.plays),
    }));
    const weekWidth = Math.max(
      'WEEK'.length,
      ...rows.map((row) => getVisibleWidth(row.week)),
    );
    const amountWidth = Math.max(
      '$APE wagered'.length,
      ...rows.map((row) => getVisibleWidth(row.amount)),
    );
    const fixedWidth = weekWidth + 3 + amountWidth + 3;
    const tableWidth = Math.max(Number(terminalWidth) || 80, fixedWidth + 'PLAYS'.length);
    const playsWidth = Math.max(0, tableWidth - fixedWidth);
    const header = `${fitAnsiText('WEEK', weekWidth)} | ${padAnsiStart('$APE wagered', amountWidth)} | PLAYS`;

    lines.push('');
    lines.push(header);
    lines.push('='.repeat(tableWidth));
    for (const row of rows) {
      lines.push(`${fitAnsiText(row.week, weekWidth)} | ${padAnsiStart(row.amount, amountWidth)} | ${truncateLeaderboardCell(row.plays, playsWidth)}`);
    }
  }

  return lines.join('\n');
}

function resolveScoreboardReferenceMode(command, opts = {}) {
  const rawArgs = Array.isArray(command?.parent?.rawArgs)
    ? command.parent.rawArgs
    : [];

  let mode = null;
  for (const arg of rawArgs) {
    if (arg === '--url') {
      mode = 'url';
    } else if (arg === '--ids') {
      mode = 'ids';
    }
  }

  if (mode) {
    return mode;
  }

  if (opts.ids) {
    return 'ids';
  }

  return opts.url ? 'url' : null;
}

function formatScoreboardCell(text, width, align = 'left') {
  return align === 'right'
    ? padAnsiStart(text, width)
    : fitAnsiText(text, width);
}

function formatScoreboardTable(entries = [], columns = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return `   ${theme.dim('No economically synced games available yet.')}`;
  }

  const widths = Object.fromEntries(columns.map(({ key, header }) => [
    key,
    Math.max(
      header.length,
      ...entries.map((entry) => getVisibleWidth(entry[key]))
    ),
  ]));

  const renderRow = (row) => `   | ${columns
    .map(({ key, align }) => formatScoreboardCell(row[key], widths[key], align))
    .join(' | ')} |`;

  const headerRow = renderRow(Object.fromEntries(columns.map(({ key, header }) => [key, header])));
  const separatorRow = `   |-${columns.map(({ key }) => '-'.repeat(widths[key])).join('-|-')}-|`;

  return [
    headerRow,
    separatorRow,
    ...entries.map(renderRow),
  ].join('\n');
}

function formatScoreboardReport(scoreboard, { includeHeader = true, referenceMode = null } = {}) {
  const highestMultipliers = Array.isArray(scoreboard?.highest_multipliers)
    ? scoreboard.highest_multipliers
    : [];
  const biggestPayouts = Array.isArray(scoreboard?.biggest_payouts)
    ? scoreboard.biggest_payouts
    : [];

  const highestMultiplierRows = highestMultipliers.map((entry) => ({
    multiplier: formatScoreNumericValue(entry.multiplier, { suffix: 'x', decimals: 2, trimTrailingZeros: false }),
    game_title: theme.gameName(entry.game_title || 'Unknown'),
    game_mode: formatScoreModeValue(entry.game_mode),
    bet: formatScoreNumericValue(entry.bet, { suffix: ' APE' }),
    payout: formatScoreNumericValue(entry.payout, { suffix: ' APE', decimals: 2, trimTrailingZeros: false }),
    game_id: formatScoreIdValue(entry.game_id),
    datetime_utc: formatScoreDateValue(entry.datetime_utc),
    game_url: formatScoreUrlValue(entry.game_url),
  }));
  const biggestPayoutRows = biggestPayouts.map((entry) => ({
    payout: formatScoreNumericValue(entry.payout, { suffix: ' APE', decimals: 2, trimTrailingZeros: false }),
    game_title: theme.gameName(entry.game_title || 'Unknown'),
    game_mode: formatScoreModeValue(entry.game_mode),
    bet: formatScoreNumericValue(entry.bet, { suffix: ' APE' }),
    multiplier: formatScoreNumericValue(entry.multiplier, { suffix: 'x', decimals: 2, trimTrailingZeros: false }),
    game_id: formatScoreIdValue(entry.game_id),
    datetime_utc: formatScoreDateValue(entry.datetime_utc),
    game_url: formatScoreUrlValue(entry.game_url),
  }));

  const lines = [];
  if (includeHeader) {
    lines.push(formatHeader('Scoreboard', '🏆'), '');
  }

  const highestMultiplierColumns = [
    { key: 'multiplier', header: 'multiplier', align: 'right' },
    { key: 'game_title', header: 'game title', align: 'left' },
    { key: 'game_mode', header: 'game mode', align: 'left' },
    { key: 'bet', header: 'bet', align: 'right' },
    { key: 'payout', header: 'payout', align: 'right' },
    { key: 'datetime_utc', header: 'datetime UTC', align: 'left' },
    ...(referenceMode === 'url'
      ? [{ key: 'game_url', header: 'game url', align: 'left' }]
      : referenceMode === 'ids'
        ? [{ key: 'game_id', header: 'game id', align: 'left' }]
        : []),
  ];
  const biggestPayoutColumns = [
    { key: 'payout', header: 'payout', align: 'right' },
    { key: 'game_title', header: 'game title', align: 'left' },
    { key: 'game_mode', header: 'game mode', align: 'left' },
    { key: 'bet', header: 'bet', align: 'right' },
    { key: 'multiplier', header: 'multiplier', align: 'right' },
    { key: 'datetime_utc', header: 'datetime UTC', align: 'left' },
    ...(referenceMode === 'url'
      ? [{ key: 'game_url', header: 'game url', align: 'left' }]
      : referenceMode === 'ids'
        ? [{ key: 'game_id', header: 'game id', align: 'left' }]
        : []),
  ];

  lines.push('Highest Multipliers:', '');
  lines.push(formatScoreboardTable(highestMultiplierRows, highestMultiplierColumns));
  lines.push('', 'Biggest Payouts:', '');
  lines.push(formatScoreboardTable(biggestPayoutRows, biggestPayoutColumns));

  return lines.join('\n').trimEnd();
}

function createGameCatalogEntry(game) {
  return {
    key: game.key,
    name: game.name,
    aliases: Array.isArray(game.aliases) ? [...game.aliases] : [],
    displayName: getGameDisplayName(game),
    type: game.type,
    description: game.description,
    abiVerified: Boolean(game.abiVerified),
    contract: game.contract,
    config: game.config,
  };
}

function compareCatalogEntriesByTitle(a, b) {
  const titleA = stripAbiVerifiedSymbol(a?.name || a?.displayName || '');
  const titleB = stripAbiVerifiedSymbol(b?.name || b?.displayName || '');
  return GAME_TITLE_COLLATOR.compare(titleA, titleB)
    || GAME_TITLE_COLLATOR.compare(String(a?.key || ''), String(b?.key || ''));
}

function getBlackjackCatalogEntry() {
  return {
    key: 'blackjack',
    name: 'Blackjack',
    aliases: ['bj'],
    displayName: resolveGameDisplayName({
      gameKey: 'blackjack',
      contract: BLACKJACK_CONTRACT,
      fallbackName: 'Blackjack',
    }),
    type: 'stateful',
    description: 'Classic H17 blackjack with simple and exact-EV auto-play',
    abiVerified: true,
    contract: BLACKJACK_CONTRACT,
  };
}

function getHiLoNebulaCatalogEntry() {
  return {
    key: 'hi-lo-nebula',
    name: 'Hi-Lo Nebula',
    aliases: ['hilonebula', 'hilo', 'nebula'],
    displayName: resolveGameDisplayName({
      gameKey: 'hi-lo-nebula',
      contract: HI_LO_NEBULA_CONTRACT,
      fallbackName: 'Hi-Lo Nebula',
    }),
    type: 'stateful',
    description: 'Sequential higher/lower/same card-streak game with cashout and jackpot pathing',
    abiVerified: true,
    contract: HI_LO_NEBULA_CONTRACT,
  };
}

function getCashDashCatalogEntry() {
  return {
    key: 'cash-dash',
    name: 'Cash Dash',
    aliases: ['cashdash', 'dash'],
    displayName: resolveGameDisplayName({
      gameKey: 'cash-dash',
      contract: CASH_DASH_CONTRACT,
      fallbackName: 'Cash Dash',
    }),
    type: 'stateful',
    description: 'Stateful death-tile ladder game with compounding rows and cashout decisions',
    abiVerified: true,
    contract: CASH_DASH_CONTRACT,
  };
}

function getVideoPokerCatalogEntry() {
  return {
    key: 'video-poker',
    name: 'Video Poker',
    aliases: ['vp'],
    displayName: resolveGameDisplayName({
      gameKey: 'video-poker',
      contract: VIDEO_POKER_CONTRACT,
      fallbackName: 'Video Poker',
    }),
    type: 'stateful',
    description: 'Jacks or Better video poker with verified on-chain paytable, simple auto-play, and exact best-EV auto-play',
    abiVerified: true,
    contract: VIDEO_POKER_CONTRACT,
  };
}

function listSupportedGameCatalogEntries() {
  return [
    ...GAME_REGISTRY.map((game) => createGameCatalogEntry(game)),
    getBlackjackCatalogEntry(),
    getCashDashCatalogEntry(),
    getHiLoNebulaCatalogEntry(),
    getVideoPokerCatalogEntry(),
  ].sort(compareCatalogEntriesByTitle);
}

function listAllSupportedGameKeys() {
  return listSupportedGameCatalogEntries().map((game) => game.key);
}

function normalizeCatalogLookupInput(input) {
  return stripAbiVerifiedSymbol(String(input || '').trim()).toLowerCase();
}

function getCatalogEntryLookupValues(game) {
  return [
    game?.key,
    game?.name,
    game?.displayName,
    ...(Array.isArray(game?.aliases) ? game.aliases : []),
  ];
}

function resolveCatalogGameEntry(input) {
  if (!input) return null;
  const requested = normalizeCatalogLookupInput(input);
  return listSupportedGameCatalogEntries().find((game) => (
    getCatalogEntryLookupValues(game).some((value) => normalizeCatalogLookupInput(value) === requested)
  )) || null;
}

function resolveStatefulPlayGame(input) {
  const entry = resolveCatalogGameEntry(input);
  return entry?.type === 'stateful' ? entry : null;
}

function isStatefulStartAction(action) {
  return !action || !isNaN(parseFloat(action));
}

function clearStatefulGames(gameKey, displayLabel) {
  const games = loadActiveGames();
  const activeGames = games[gameKey] || [];
  if (activeGames.length === 0) {
    console.log(`\n✅ No active ${displayLabel} games to clear.\n`);
  } else {
    console.log(`\n🗑️  Clearing ${activeGames.length} stored ${displayLabel} game(s)...`);
    games[gameKey] = [];
    saveActiveGames(games);
    console.log('✅ Done.\n');
  }
}

function allowsMissingStatefulStartAmount(opts = {}) {
  return Boolean(opts.loop && isBankrollFractionStrategyName(opts.betStrategy));
}

async function runStatefulGameCommand(gameKey, action, amount, opts = {}) {
  if (rejectResilientValueOption(process.argv.slice(2), opts)) {
    return;
  }

  switch (gameKey) {
    case 'blackjack': {
      const blackjack = await import('../lib/stateful/blackjack/index.js');

      if (isStatefulStartAction(action)) {
        const betAmount = action || amount;
        if (!betAmount && !allowsMissingStatefulStartAmount(opts)) {
          console.error('\n❌ Bet amount required');
          console.error(`   Usage: ${BINARY_NAME} blackjack <amount>\n`);
          console.error(`   Example: ${BINARY_NAME} blackjack 10\n`);
          return;
        }
        await getWalletWithPrompt({ json: opts.json, gameplay: true });
        return blackjack.start(betAmount, opts);
      }

      const actionLower = action.toLowerCase();

      switch (actionLower) {
        case 'resume':
          await getWalletWithPrompt({ json: opts.json, gameplay: true });
          return blackjack.resume(opts.game, opts);

        case 'status':
          return blackjack.status(opts.game, opts);

        case 'hit':
        case 'stand':
        case 'double':
        case 'split':
        case 'insurance':
        case 'surrender':
          await getWalletWithPrompt({ json: opts.json, gameplay: true });
          return blackjack.action(actionLower, opts);

        case 'clear':
          return clearStatefulGames('blackjack', 'blackjack');

        default:
          console.error(`\n❌ Unknown action: ${action}`);
          console.error('   Valid actions: hit, stand, double, split, insurance, surrender');
          console.error('   Or: resume, status, clear\n');
      }
      return;
    }

    case 'cash-dash': {
      const cashDash = await import('../lib/stateful/cash-dash/index.js');

      if (isStatefulStartAction(action)) {
        const betAmount = action || amount;
        if (!betAmount && !allowsMissingStatefulStartAmount(opts)) {
          console.error('\n❌ Bet amount required');
          console.error(`   Usage: ${BINARY_NAME} cash-dash <amount>\n`);
          console.error(`   Example: ${BINARY_NAME} cash-dash 25\n`);
          return;
        }
        await getWalletWithPrompt({ json: opts.json, gameplay: true });
        return cashDash.start(betAmount, opts);
      }

      const actionLower = action.toLowerCase();
      switch (actionLower) {
        case 'resume':
          await getWalletWithPrompt({ json: opts.json, gameplay: true });
          return cashDash.resume(opts.game, opts);

        case 'status':
          return cashDash.status(opts.game, opts);

        case 'payouts':
        case 'table':
          return cashDash.payouts();

        case 'clear':
          return clearStatefulGames('cash-dash', 'Cash Dash');

        case 'guess':
        case 'tile':
        case 'pick':
          if (!amount) {
            console.error(`\n❌ Tile required. Usage: ${BINARY_NAME} cash-dash ${actionLower} <tile>\n`);
            return;
          }
          await getWalletWithPrompt({ json: opts.json, gameplay: true });
          return cashDash.action(amount, opts);

        default:
          await getWalletWithPrompt({ json: opts.json, gameplay: true });
          return cashDash.action(actionLower, opts);
      }
    }

    case 'hi-lo-nebula': {
      const hiLoNebula = await import('../lib/stateful/hi-lo-nebula/index.js');

      if (isStatefulStartAction(action)) {
        const betAmount = action || amount;
        if (!betAmount && !allowsMissingStatefulStartAmount(opts)) {
          console.error('\n❌ Bet amount required');
          console.error(`   Usage: ${BINARY_NAME} hi-lo-nebula <amount>\n`);
          console.error(`   Example: ${BINARY_NAME} hi-lo-nebula 25\n`);
          return;
        }
        await getWalletWithPrompt({ json: opts.json, gameplay: true });
        return hiLoNebula.start(betAmount, opts);
      }

      const actionLower = action.toLowerCase();
      switch (actionLower) {
        case 'resume':
          await getWalletWithPrompt({ json: opts.json, gameplay: true });
          return hiLoNebula.resume(opts.game, opts);

        case 'status':
          return hiLoNebula.status(opts.game, opts);

        case 'payouts':
        case 'table':
          return hiLoNebula.payouts();

        case 'clear':
          return clearStatefulGames('hi-lo-nebula', 'Hi-Lo Nebula');

        default:
          await getWalletWithPrompt({ json: opts.json, gameplay: true });
          return hiLoNebula.action(actionLower, opts);
      }
    }

    case 'video-poker': {
      const videoPoker = await import('../lib/stateful/video-poker/index.js');

      if (isStatefulStartAction(action)) {
        const betAmount = action || amount;
        if (!betAmount && !allowsMissingStatefulStartAmount(opts)) {
          console.error('\n❌ Bet amount required');
          console.error('   Valid bets: 1, 5, 10, 25, 50, 100 APE');
          console.error(`   Usage: ${BINARY_NAME} video-poker <amount>\n`);
          console.error(`   Example: ${BINARY_NAME} video-poker 10\n`);
          return;
        }
        await getWalletWithPrompt({ json: opts.json, gameplay: true });
        return videoPoker.start(betAmount, opts);
      }

      const actionLower = action.toLowerCase();

      switch (actionLower) {
        case 'resume':
          await getWalletWithPrompt({ json: opts.json, gameplay: true });
          return videoPoker.resume(opts.game, opts);

        case 'status':
          return videoPoker.status(opts.game, opts);

        case 'payouts':
        case 'table':
          return videoPoker.payouts();

        case 'clear':
          return clearStatefulGames('video-poker', 'video poker');

        default:
          console.error(`\n❌ Unknown action: ${action}`);
          console.error('   Valid actions: resume, status, payouts, clear');
          console.error('   Or provide a bet amount: 1, 5, 10, 25, 50, 100\n');
      }
      return;
    }

    default:
      throw new Error(`Unsupported stateful game: ${gameKey}`);
  }
}

function buildStatefulPlayOptions(opts, { selectedFromGameOption = false } = {}) {
  const playOpts = { ...opts };
  if (playOpts.gameId !== undefined) {
    playOpts.game = playOpts.gameId;
  } else if (selectedFromGameOption) {
    delete playOpts.game;
  }
  return playOpts;
}

function resolveStatefulPlayDispatch({ gameArg, amountArg, configArgs, opts }) {
  const positionalGame = resolveStatefulPlayGame(gameArg);
  if (positionalGame) {
    return {
      game: positionalGame,
      action: amountArg || opts.amount,
      amount: configArgs?.[0],
      opts: buildStatefulPlayOptions(opts),
    };
  }

  const optionGame = resolveStatefulPlayGame(opts.game);
  if (optionGame) {
    return {
      game: optionGame,
      action: amountArg || opts.amount,
      amount: configArgs?.[0],
      opts: buildStatefulPlayOptions(opts, { selectedFromGameOption: true }),
    };
  }

  return null;
}

const HI_LO_NEBULA_VALIDATE_AUTO_MODES = Object.freeze([
  AUTO_MODE_SIMPLE,
  AUTO_MODE_BEST,
  AUTO_MODE_WINSTON_LADDER,
]);

const BLACKJACK_VALIDATE_AUTO_MODES = Object.freeze([
  AUTO_MODE_SIMPLE,
  AUTO_MODE_BEST,
  AUTO_MODE_MAX,
]);

function formatPlayValidationPayload(payload = {}) {
  return {
    status: 'valid',
    command: 'play',
    ...payload,
  };
}

function failPlayValidation(error) {
  console.error(JSON.stringify({ error: error?.message || String(error) }));
  process.exit(1);
}

function rawArgsIncludeOption(rawArgs = [], optionName) {
  return rawArgs.some((arg) => arg === optionName || String(arg).startsWith(`${optionName}=`));
}

function getResilientValueOptionError(rawArgs = []) {
  const deprecated = rawArgs.find((arg) => String(arg).startsWith('--resilient='));
  if (!deprecated) return null;
  return `Option --resilient does not accept a value. Use --resilient to enable retry mode or --no-resilient to disable it.`;
}

function rejectResilientValueOption(rawArgs = [], opts = {}) {
  const error = getResilientValueOptionError(rawArgs);
  if (!error) return false;
  if (opts.json) console.error(JSON.stringify({ error }));
  else console.error(`\n❌ ${error}\n`);
  process.exitCode = 1;
  return true;
}

function getDeprecatedAttemptOptionMessage(optionName, gameEntry = null) {
  if (optionName === '--runs' && gameEntry?.type === 'primes') {
    return 'Option --runs was renamed. Use --split for Primes because the wager is split across independent runs.';
  }
  if (optionName === '--runs' && ['beardice', 'blocks'].includes(gameEntry?.type)) {
    return `Option --runs was renamed. Use --survive for ${gameEntry.name} because each attempt risks the full current payout.`;
  }
  const hint = ATTEMPT_OPTION_GAME_HINTS[optionName] || 'Use --split or --survive depending on the game mechanics.';
  return `Option ${optionName} was renamed. ${hint}`;
}

function getAttemptOptionUsageError({ gameEntry = null, rawArgs = [], opts = {} } = {}) {
  for (const optionName of DEPRECATED_ATTEMPT_OPTIONS) {
    if (rawArgsIncludeOption(rawArgs, optionName)) {
      return getDeprecatedAttemptOptionMessage(optionName, gameEntry);
    }
  }

  if (rawArgsIncludeOption(rawArgs, '--spins') && (!gameEntry || gameEntry.type !== 'slots')) {
    return 'Option --spins is only a slot-game alias for --split. Use --split for non-slot split games.';
  }

  if (
    gameEntry?.type === 'slots'
    && opts.split !== undefined
    && opts.spins !== undefined
    && parseInt(opts.split, 10) !== parseInt(opts.spins, 10)
  ) {
    return 'Conflicting slot split count: --split and --spins must match, or only one may be provided.';
  }

  if (rawArgsIncludeOption(rawArgs, '--range') && gameEntry?.type === 'apestrong') {
    return 'Option --range was renamed for ApeStrong. Use --cover <cover> instead.';
  }

  if (
    rawArgsIncludeOption(rawArgs, '--cover')
    && gameEntry
    && !['apestrong', 'gimbozsmash'].includes(gameEntry.type)
  ) {
    return `Option --cover is only for ApeStrong and Gimboz Smash. ${gameEntry.name} does not support cover.`;
  }

  if (opts.survive !== undefined && gameEntry && !SURVIVE_GAME_TYPES.includes(gameEntry.type)) {
    return `Option --survive is only for Bear-A-Dice and Blocks. Use --split for ${gameEntry.name} if it has repeated independent attempts.`;
  }

  if (opts.split !== undefined && gameEntry && !SPLIT_GAME_TYPES.includes(gameEntry.type)) {
    if (SURVIVE_GAME_TYPES.includes(gameEntry.type)) {
      return `Option --split is for independent split-bet games. Use --survive for ${gameEntry.name}.`;
    }
    return `Option --split is only for Plinko, Primes, Speed Keno, and slots. ${gameEntry.name} does not support repeated split attempts.`;
  }

  return null;
}

function validateStatefulAmount(amount, gameKey) {
  if (!isPositiveApeToken(amount)) {
    throw new Error(`Invalid ${gameKey} bet amount.`);
  }
  if (gameKey === 'video-poker') {
    const value = Number(amount);
    if (![1, 5, 10, 25, 50, 100].includes(value)) {
      throw new Error('Invalid video-poker bet amount. Valid bets: 1, 5, 10, 25, 50, 100 APE.');
    }
  }
}

function validatePositiveNumberOption(value, optionName, { allowZero = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new Error(`Invalid ${optionName} value: "${value}". Must be a ${allowZero ? 'non-negative' : 'positive'} number.`);
  }
}

function validateStatefulAutoMode(opts, {
  optionName = '--auto',
  validModes = undefined,
} = {}) {
  if (opts.auto === undefined) return;
  if (normalizeAutoMode(opts.auto, validModes) === null) {
    throw new Error(`Invalid ${optionName} mode: "${opts.auto}". Valid values: ${formatAutoModes(validModes)}.`);
  }
}

function validateHiLoNebulaSolverMode(opts) {
  if (opts.solver === undefined) return;
  const mode = opts.solver === true || String(opts.solver).trim() === ''
    ? AUTO_MODE_BEST
    : normalizeAutoMode(opts.solver, HI_LO_NEBULA_VALIDATE_AUTO_MODES);
  if (mode === null) {
    throw new Error(`Invalid --solver mode: "${opts.solver}". Valid values: ${formatAutoModes(HI_LO_NEBULA_VALIDATE_AUTO_MODES)}.`);
  }
}

function validateBlackjackSolverMode(opts) {
  if (opts.solver === undefined) return;
  const mode = opts.solver === true || String(opts.solver).trim() === ''
    ? AUTO_MODE_BEST
    : normalizeAutoMode(opts.solver, BLACKJACK_VALIDATE_AUTO_MODES);
  if (mode === null) {
    throw new Error(`Invalid --solver mode: "${opts.solver}". Valid values: ${formatAutoModes(BLACKJACK_VALIDATE_AUTO_MODES)}.`);
  }
}

function validateCashDashTile(value) {
  if (value === undefined) return;
  const input = String(value).trim().toLowerCase();
  if (input === 'random') return;
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 7) {
    throw new Error(`Invalid --tile value: "${value}". Must be 1-7 or random.`);
  }
}

function validateStatefulStartOptions(gameKey, opts = {}) {
  parseLoopTerminalOptions(opts);
  if (opts.delay !== undefined) validatePositiveNumberOption(opts.delay, '--delay');
  if (opts.maxBet !== undefined) validatePositiveNumberOption(opts.maxBet, '--max-bet');
  if (opts.minBet !== undefined) validatePositiveNumberOption(opts.minBet, '--min-bet');
  if (opts.gpApe !== undefined) normalizeGpPerApe(opts.gpApe);

  switch (gameKey) {
    case 'blackjack':
      validateStatefulAutoMode(opts, { validModes: BLACKJACK_VALIDATE_AUTO_MODES });
      validateBlackjackSolverMode(opts);
      validatePositiveNumberOption(opts.side ?? 0, '--side', { allowZero: true });
      parseSolverMaxStatesForValidation(opts.solverMaxStates);
      parseSolverTimeoutMsForValidation(opts.solverTimeoutMs);
      break;
    case 'cash-dash':
      validateStatefulAutoMode(opts);
      validateCashDashTile(opts.tile);
      if (opts.cashoutAfter !== undefined) parsePositiveIntegerForValidation(opts.cashoutAfter, '--cashout-after');
      break;
    case 'hi-lo-nebula':
      validateStatefulAutoMode(opts, { validModes: HI_LO_NEBULA_VALIDATE_AUTO_MODES });
      validateHiLoNebulaSolverMode(opts);
      break;
    case 'video-poker':
      validateStatefulAutoMode(opts);
      break;
    default:
      throw new Error(`Unsupported stateful game: ${gameKey}`);
  }
}

function parsePositiveIntegerForValidation(value, optionName) {
  const text = String(value ?? '').trim();
  const parsed = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${optionName} value: "${value}". Must be a positive integer.`);
  }
  return parsed;
}

function parseSolverMaxStatesForValidation(value) {
  if (value === undefined || value === null || value === '') return null;
  return parsePositiveIntegerForValidation(value, '--solver-max-states');
}

function parseSolverTimeoutMsForValidation(value) {
  if (value === undefined || value === null || value === '') return null;
  return parsePositiveIntegerForValidation(value, '--solver-timeout-ms');
}

function validateStatefulPlayDispatch(dispatch) {
  if (!dispatch?.game) {
    throw new Error('No stateful game selected.');
  }

  if (isStatefulStartAction(dispatch.action)) {
    const betAmount = dispatch.action || dispatch.amount;
    if (!betAmount && !allowsMissingStatefulStartAmount(dispatch.opts)) {
      throw new Error(`Bet amount required for ${dispatch.game.key}.`);
    }
    if (betAmount) validateStatefulAmount(betAmount, dispatch.game.key);
    validateStatefulStartOptions(dispatch.game.key, dispatch.opts);
    return formatPlayValidationPayload({
      game: dispatch.game.key,
      type: 'stateful',
      action: 'start',
    });
  }

  const action = String(dispatch.action || '').trim().toLowerCase();
  const validActions = {
    blackjack: ['hit', 'stand', 'double', 'split', 'insurance', 'surrender', 'resume', 'status', 'clear'],
    'cash-dash': ['resume', 'status', 'payouts', 'table', 'clear', 'guess', 'tile', 'pick'],
    'hi-lo-nebula': ['resume', 'status', 'payouts', 'table', 'clear'],
    'video-poker': ['resume', 'status', 'payouts', 'table', 'clear'],
  }[dispatch.game.key] || [];

  if (!validActions.includes(action)) {
    throw new Error(`Unknown ${dispatch.game.key} action: ${dispatch.action}`);
  }

  return formatPlayValidationPayload({
    game: dispatch.game.key,
    type: 'stateful',
    action,
  });
}

function validateNumberSelection(input, {
  label,
  min,
  max,
  minCount,
  maxCount,
} = {}) {
  if (input === undefined || input === null || String(input).trim() === '') return;
  if (String(input).trim().toLowerCase() === 'random') return;

  const parts = String(input)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set();

  for (const part of parts) {
    const parsed = Number(part);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new Error(`Invalid ${label} number: "${part}". Must be ${min}-${max}.`);
    }
    if (seen.has(parsed)) {
      throw new Error(`Duplicate ${label} number: ${parsed}.`);
    }
    seen.add(parsed);
  }

  if (parts.length < minCount || parts.length > maxCount) {
    throw new Error(`Must pick ${minCount}-${maxCount} ${label} numbers. You picked ${parts.length}.`);
  }
}

function validateResolvedGameConfig(gameEntry, gameConfig = {}, { amountInput = '1' } = {}) {
  const configEntries = gameEntry?.config && typeof gameEntry.config === 'object'
    ? Object.entries(gameEntry.config)
    : [];

  for (const [field, config] of configEntries) {
    const value = getResolvedGameConfigValidationValue(gameEntry, field, gameConfig);
    if (value === undefined || config?.min === undefined || config?.max === undefined) {
      continue;
    }
    ensureIntRange(
      value,
      getGameConfigCliName(gameEntry, field),
      config.min,
      config.max,
    );
  }

  if (gameEntry.type === 'keno') {
    validateNumberSelection(gameConfig.numbers, {
      label: 'keno',
      min: 1,
      max: 40,
      minCount: 1,
      maxCount: 10,
    });
  } else if (gameEntry.type === 'speedkeno') {
    validateNumberSelection(gameConfig.numbers, {
      label: 'speed keno',
      min: 1,
      max: 20,
      minCount: 1,
      maxCount: 5,
    });
  } else if (gameEntry.type === 'roulette') {
    parseRouletteBets(gameConfig.bet, gameEntry);
  } else if (gameEntry.type === 'baccarat') {
    parseBaccaratBet(gameConfig.bet, parseEther(String(amountInput || '1')));
  } else if (gameEntry.type === 'gimbozsmash') {
    parseGimbozSmashInput({
      range: gameConfig.targets,
      outRange: gameConfig.outRange,
    });
  }
}

function getResolvedGameConfigValidationValue(gameEntry, field, gameConfig = {}) {
  if (['balls', 'games', 'spins'].includes(field)) {
    return gameConfig.split ?? gameConfig[field];
  }
  if (field === 'runs') {
    if (gameEntry?.type === 'blocks') {
      return gameConfig.survive ?? gameConfig.runs;
    }
    if (gameEntry?.type === 'primes') {
      return gameConfig.split ?? gameConfig.runs;
    }
  }
  if (field === 'rolls') {
    return gameConfig.survive ?? gameConfig.rolls;
  }
  return gameConfig[field];
}

function resolveValidationGameConfig({
  fixedGame,
  opts,
  positionalConfig,
  loopMode,
}) {
  if (!fixedGame) return {};

  const strategy = normalizeStrategy(opts.strategy || 'balanced');
  const strategyConfig = getStrategyConfig(strategy);
  const preferGameDefault = Boolean(fixedGame && !loopMode);
  const getConfig = configGetters[fixedGame.type];
  return getConfig
    ? getConfig(
        opts,
        positionalConfig,
        fixedGame,
        strategyConfig,
        randomIntInclusive,
        { preferGameDefault },
      )
    : { ...positionalConfig };
}

function validateStatelessPlayTarget({
  fixedGame,
  opts,
  positionalConfig,
  amountInput,
  loopMode,
}) {
  if (amountInput !== undefined && !isPositiveApeToken(amountInput)) {
    throw new Error('Invalid amount.');
  }

  parseLoopTerminalOptions(opts);
  if (opts.maxBet !== undefined) validatePositiveNumberOption(opts.maxBet, '--max-bet');
  if (opts.minBet !== undefined) validatePositiveNumberOption(opts.minBet, '--min-bet');
  if (opts.gpApe !== undefined) normalizeGpPerApe(opts.gpApe);

  const gameConfig = resolveValidationGameConfig({
    fixedGame,
    opts,
    positionalConfig,
    loopMode,
  });
  if (fixedGame) {
    validateResolvedGameConfig(fixedGame, gameConfig, { amountInput });
  }

  return formatPlayValidationPayload({
    game: fixedGame?.key || null,
    type: fixedGame ? 'stateless' : 'auto',
    config: fixedGame ? gameConfig : null,
  });
}

function formatAvailableGameGroups() {
  return getGameCatalogGroups()
    .filter((group) => group.games.length > 0)
    .map((group) => `${group.title}: ${group.games.map((game) => game.key).join(' | ')}`)
    .join('\n');
}

function printGameCatalogGroup(title, games) {
  if (!Array.isArray(games) || games.length === 0) {
    return;
  }

  console.log(`   ${theme.subheader(`${title}:`)}`);
  console.log('');

  for (const game of games) {
    console.log(`   ${theme.gameName(game.displayName)} ${theme.dim(`(${game.key})`)}`);
    if (Array.isArray(game.aliases) && game.aliases.length > 0) {
      console.log(`      ${theme.dim(`Aliases: ${game.aliases.join(', ')}`)}`);
    }
    console.log(`      ${theme.value(game.description)}`);
    console.log('');
  }
}

const CLASSIC_SLOT_KEYS = Object.freeze([
  'bubblegum-heist',
  'dino-dough',
  'geez-diggerz',
  'sushi-showdown',
]);
const SUBGAME_SLOT_KEYS = Object.freeze(['reel-pirates']);

function getGameCatalogGroupId(game) {
  if (game?.type === 'stateful') return 'stateful';
  if (SURVIVE_GAME_TYPES.includes(game?.type)) return 'survive';
  if (SUBGAME_SLOT_KEYS.includes(game?.key)) return 'slot-subgame';
  if (CLASSIC_SLOT_KEYS.includes(game?.key)) return 'classic-slots';
  if (SPLIT_GAME_TYPES.includes(game?.type)) return 'split';
  return 'single-attempt';
}

function getGameCatalogGroups(games = listSupportedGameCatalogEntries()) {
  const groups = [
    { id: 'stateful', title: 'Stateful Games', games: [] },
    { id: 'single-attempt', title: 'Single Attempt Games', games: [] },
    { id: 'survive', title: 'Survive Games', games: [] },
    { id: 'split', title: 'Split Bet Games', games: [] },
    { id: 'classic-slots', title: 'Classic Slot Machines', games: [] },
    { id: 'slot-subgame', title: 'Slot Machines With Sub-Game', games: [] },
  ];
  const groupById = new Map(groups.map((group) => [group.id, group]));

  for (const game of games) {
    const group = groupById.get(getGameCatalogGroupId(game)) || groupById.get('single-attempt');
    group.games.push(game);
  }

  for (const group of groups) {
    group.games.sort(compareCatalogEntriesByTitle);
  }

  return groups;
}

function listGroupedGameCatalogEntries() {
  return getGameCatalogGroups().flatMap((group) => group.games);
}

function formatGameListParameters(game) {
  if (game?.type === 'stateful') {
    return '<ape> [--auto <mode>]';
  }

  const parameters = ['<ape>'];
  const configEntries = game?.config && typeof game.config === 'object'
    ? Object.entries(game.config).filter(([, entry]) => isPublicGameConfigEntry(entry))
    : [];

  for (const [field] of configEntries) {
    const cliName = getGameConfigCliName(game, field);
    parameters.push(`--${cliName} <${cliName}>`);
  }

  return parameters.join(' ');
}

function formatGameListLine(game) {
  return `[play] ${game.key} ${formatGameListParameters(game)}`.trim();
}

function normalizeHistoryBreakdownLookupInput(input) {
  return stripAbiVerifiedSymbol(String(input || '').trim()).toLowerCase();
}

function getHistoryBreakdownBaseName(entry) {
  const gameName = String(entry?.game || '').trim();
  const variantLabel = String(entry?.variant_label || '').trim();
  if (!variantLabel) {
    return stripAbiVerifiedSymbol(gameName);
  }

  const suffix = ` (${variantLabel})`;
  const baseName = gameName.endsWith(suffix)
    ? gameName.slice(0, -suffix.length).trim()
    : gameName;
  return stripAbiVerifiedSymbol(baseName);
}

function resolveHistoryBreakdownSelection(rawValue, historyBreakdown = []) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }

  const requested = rawValue.trim();
  const normalized = normalizeHistoryBreakdownLookupInput(requested);
  const resolvedGame = resolveCatalogGameEntry(requested);
  if (resolvedGame) {
    return {
      requested,
      gameKey: resolvedGame.key,
      displayName: getGameDisplayName(resolvedGame),
    };
  }

  const matchedEntry = historyBreakdown.find((entry) => (
    normalizeHistoryBreakdownLookupInput(entry?.game_key || '') === normalized
    || normalizeHistoryBreakdownLookupInput(getHistoryBreakdownBaseName(entry)) === normalized
    || normalizeHistoryBreakdownLookupInput(entry?.game || '') === normalized
  ));

  if (!matchedEntry) {
    return null;
  }

  return {
    requested,
    gameKey: String(matchedEntry.game_key || '').trim().toLowerCase() || null,
    displayName: getHistoryBreakdownBaseName(matchedEntry) || stripAbiVerifiedSymbol(matchedEntry.game) || requested,
  };
}

function filterHistoryBreakdown(gameStats, selection) {
  if (!Array.isArray(gameStats) || !selection) {
    return Array.isArray(gameStats) ? gameStats : [];
  }

  const selectedKey = normalizeHistoryBreakdownLookupInput(selection.gameKey || '');
  const selectedName = normalizeHistoryBreakdownLookupInput(selection.displayName || selection.requested || '');

  return gameStats.filter((entry) => {
    const entryKey = normalizeHistoryBreakdownLookupInput(entry?.game_key || '');
    const entryBaseName = normalizeHistoryBreakdownLookupInput(getHistoryBreakdownBaseName(entry));
    return (selectedKey && entryKey === selectedKey) || (selectedName && entryBaseName === selectedName);
  });
}

function formatUnfinishedGamesSection(unfinishedGames = []) {
  const lines = [
    formatHeader('Unfinished Games', '🧩'),
    '',
  ];

  if (!Array.isArray(unfinishedGames) || unfinishedGames.length === 0) {
    lines.push(`   ${theme.dim('No unfinished games.')}`);
    return lines.join('\n');
  }

  unfinishedGames.forEach((unfinished, index) => {
    lines.push(`   ${theme.gameName(unfinished.game)} ${theme.dim(`(${unfinished.unfinished_games})`)}`);
    for (const gameId of unfinished.game_ids) {
      lines.push(`     ${theme.dim('-')} ${theme.value(gameId)}`);
    }
    lines.push(`     ${theme.dim('To resume queue:')} ${theme.command(`$ ${unfinished.resume_command}`)}`);
    lines.push(`     ${theme.dim('To clear queue:')} ${theme.command(`$ ${unfinished.clear_command}`)}`);
    if (index < unfinishedGames.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n');
}

function formatNullablePercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return theme.warning('…');
  }

  return theme.value(`${Number(value).toFixed(2)}%`);
}

function padAnsiStart(text, width) {
  const source = String(text ?? '');
  return `${' '.repeat(Math.max(0, width - getVisibleWidth(source)))}${source}`;
}

function formatGameStatsCell(text, width, align = 'left') {
  return align === 'right'
    ? padAnsiStart(text, width)
    : fitAnsiText(text, width);
}

function splitGameStatsDisplay(game) {
  const variantLabel = String(game?.variant_label || '').trim();
  const displayGame = String(game?.game || 'Unknown').trim() || 'Unknown';
  if (!variantLabel) {
    return {
      gameName: displayGame,
      modeLabel: theme.warning('…'),
    };
  }

  const suffix = ` (${variantLabel})`;
  return {
    gameName: displayGame.endsWith(suffix)
      ? displayGame.slice(0, -suffix.length).trim()
      : displayGame,
    modeLabel: theme.value(variantLabel),
  };
}

function formatObservedMultiplier(value) {
  if (value === null || value === undefined || value === '') {
    return theme.warning('…');
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return theme.warning('…');
  }

  const display = numeric.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return theme.value(`${display}x`);
}

function formatGameStatsMaxPayout(reference) {
  if (!reference) {
    return theme.warning('…');
  }

  const numeric = Number(reference.value);
  if (!Number.isFinite(numeric)) {
    return formatMaxPayoutReference(reference);
  }

  const display = numeric.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const jackpotSuffix = String(reference.display || '').includes('💰') ? ' + 💰' : '';

  return theme.value(`${display}x${jackpotSuffix}`);
}

async function enrichStoredHistoryVariants(publicClient, history) {
  if (!history || !Array.isArray(history.games) || history.games.length === 0) {
    return history;
  }

  try {
    const enrichment = await inferSavedHistoryGameVariants(publicClient, history.games);
    if (!enrichment.changed) {
      return history;
    }

    const nextHistory = {
      ...history,
      games: enrichment.games,
    };
    try {
      saveHistory(nextHistory, nextHistory.wallet || history.wallet);
    } catch {
      // Best effort: keep the enriched in-memory view even if persistence fails.
    }
    return nextHistory;
  } catch {
    return history;
  }
}

function formatGameStatsTable(games = []) {
  const columns = [
    { key: 'game', header: 'game', align: 'left' },
    { key: 'mode', header: 'mode', align: 'left' },
    { key: 'plays', header: 'plays', align: 'right' },
    { key: 'net_profit', header: 'net profit', align: 'right' },
    { key: 'win_rate', header: 'win rate', align: 'right' },
    { key: 'expected_rtp', header: 'expected RTP', align: 'right' },
    { key: 'reported_rtp', header: 'reported RTP', align: 'right' },
    { key: 'current_rtp', header: 'current RTP', align: 'right' },
    { key: 'max_payout', header: 'max payout (x)', align: 'right' },
    { key: 'max_hit', header: 'max hit (x)', align: 'right' },
  ];

  const rows = games.map((game) => {
    const { gameName, modeLabel } = splitGameStatsDisplay(game);
    const resolvedGameKey = game.rtp_game || game.base_game_key || game.game;
    const hasResolvedVariant = Boolean(
      game.variant_label
      || game.rtp_config
      || (game.group_key && game.base_game_key && game.group_key !== game.base_game_key)
    );
    const variantExpectedReference = game.group_key === 'blackjack:mixed'
      ? null
      : getGameCalculatedVariantReference(game.group_key)?.calculated;
    const variantMaxPayoutReference = game.group_key === 'blackjack:mixed'
      ? null
      : getGameMaxPayoutVariantReference(game.group_key);
    const rtpCells = formatRtpTripletCells({
      game: resolvedGameKey,
      config: game.rtp_config || null,
      expectedReference: variantExpectedReference,
      currentRtp: game.rtp,
    });
    const maxPayoutReference = game.group_key === 'blackjack:mixed' && !game.rtp_config
      ? null
      : ((game.rtp_config
        ? getConfiguredGameMaxPayoutReference({
            game: resolvedGameKey,
            config: game.rtp_config || null,
          })
        : null)
      || variantMaxPayoutReference
      || (!hasResolvedVariant ? getUniformGameMaxPayoutReference(resolvedGameKey) : null));

    return {
      game: theme.gameName(gameName),
      mode: modeLabel,
      plays: theme.value(String(game.games_played)),
      net_profit: game.net_profit_ape === null ? theme.warning('…') : formatPnL(game.net_profit_ape, 2),
      win_rate: formatNullablePercent(game.win_rate),
      expected_rtp: rtpCells.expected,
      reported_rtp: rtpCells.reported,
      current_rtp: rtpCells.current,
      max_payout: formatGameStatsMaxPayout(maxPayoutReference),
      max_hit: formatObservedMultiplier(game.max_hit_x),
    };
  });

  const widths = Object.fromEntries(columns.map(({ key, header }) => [
    key,
    Math.max(
      header.length,
      ...rows.map((row) => getVisibleWidth(row[key]))
    ),
  ]));

  const renderRow = (row) => `   | ${columns
    .map(({ key, align }) => formatGameStatsCell(row[key], widths[key], align))
    .join(' | ')} |`;

  const headerRow = renderRow(Object.fromEntries(columns.map(({ key, header }) => [key, header])));
  const separatorRow = `   |-${columns.map(({ key }) => '-'.repeat(widths[key])).join('-|-')}-|`;

  return [
    headerRow,
    separatorRow,
    ...rows.map(renderRow),
    `   ${theme.dim('Legend:')} ${theme.value('📄 documented')}  ${theme.value('👌 exact formula')}  ${theme.value('🔮 statistical')}  ${theme.warning('… unavailable')}`,
  ].join('\n');
}

function formatWalletDownloadReport(downloadResult) {
  const { sync, stats } = downloadResult;
  const lines = [
    '',
    formatHeader('History Download', '📥'),
    '',
    `   ${theme.label('Address:')} ${formatAddress(sync.wallet)}`,
    `   ${theme.label('Blocks:')} ${theme.value(`${sync.from_block} -> ${sync.to_block}`)}`,
    `   ${theme.label('File:')} ${theme.dim(sync.file_path)}`,
    `   ${theme.label('Downloaded:')} ${sync.downloaded_games} supported game(s)`,
    `   ${theme.label('New:')} ${sync.new_games}`,
    `   ${theme.label('Saved:')} ${sync.saved_games}`,
  ];

  if (sync.missing_transaction_metadata > 0) {
    lines.push(`   ${theme.warning(`Missing tx metadata for ${sync.missing_transaction_metadata} game(s); gas/fees may be incomplete.`)}`);
  }

  if (sync.current_gp_per_ape !== null && sync.current_gp_per_ape !== undefined) {
    lines.push(`   ${theme.label('Current GP Rate:')} ${theme.yellow(`${formatGpPerApeValue(sync.current_gp_per_ape)} GP/APE`)} ${theme.dim('(latest on-chain tx)')}`);
  }

  lines.push(formatHistoryStatsReport(stats), '');
  return lines.join('\n');
}

function formatShortHash(hash, start = 10, end = 8) {
  const value = String(hash || '').trim();
  if (!value) {
    return 'n/a';
  }
  if (value.length <= start + end + 1) {
    return value;
  }
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function formatWalletDownloadProgressLine(progress) {
  const status = progress.lastSyncMsg && progress.lastSyncMsg !== 'ok'
    ? ` ${theme.warning(`[${progress.lastSyncMsg}]`)}`
    : '';
  return `   ${theme.dim(`(${progress.index}/${progress.total})`)} ${theme.gameName(progress.game || progress.gameKey || 'Unknown')} ${theme.txHash(formatShortHash(progress.txHash || progress.settlementTxHash))}${status}`;
}

function resolveHistoryTargetAddress(address) {
  const targetAddress = address || getWalletAddress();
  return targetAddress || null;
}

async function downloadHistoryForCli(targetAddress, opts = {}) {
  const { publicClient } = createClients();

  let fromBlock;
  let toBlock;
  let chunkSize;

  try {
    if (opts.fromBlock !== undefined) {
      fromBlock = BigInt(parseNonNegativeInt(opts.fromBlock, 'from-block'));
    }
    chunkSize = BigInt(parseNonNegativeInt(opts.chunkSize ?? DEFAULT_HISTORY_SYNC_CHUNK_SIZE.toString(), 'chunk-size'));
    if (chunkSize <= 0n) {
      throw new Error('chunk-size must be greater than 0.');
    }

    if (opts.toBlock !== undefined) {
      toBlock = BigInt(parseNonNegativeInt(opts.toBlock, 'to-block'));
    }

    if (fromBlock !== undefined && toBlock !== undefined && toBlock < fromBlock) {
      throw new Error('to-block must be greater than or equal to from-block.');
    }
  } catch (error) {
    throw new Error(sanitizeError(error));
  }

  return downloadWalletHistory(publicClient, targetAddress, {
    fromBlock,
    toBlock,
    chunkSize,
    rebuild: Boolean(opts.rebuildHistory && fromBlock === 0n),
    onTransactionProcessed: opts.json
      ? null
      : (progress) => {
          console.log(formatWalletDownloadProgressLine(progress));
        },
  });
}

function parseFeeAnalysisCapBytes(rawValue) {
  const numeric = Number(rawValue ?? (DEFAULT_FEE_ANALYSIS_CAP_BYTES / (1024 * 1024)));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('cap-mb must be a positive number.');
  }
  return Math.max(1, Math.floor(numeric * 1024 * 1024));
}

function parseFeeAnalysisScanOptions(opts = {}) {
  const chunkSize = BigInt(parseNonNegativeInt(
    opts.chunkSize ?? DEFAULT_FEE_ANALYSIS_CHUNK_SIZE.toString(),
    'chunk-size'
  ));
  if (chunkSize <= 0n) {
    throw new Error('chunk-size must be greater than 0.');
  }

  const maxChunks = parseNonNegativeInt(
    opts.maxChunks ?? DEFAULT_FEE_ANALYSIS_MAX_CHUNKS.toString(),
    'max-chunks'
  );
  const capBytes = parseFeeAnalysisCapBytes(opts.capMb);
  const parsed = {
    chunkSize,
    maxChunks,
    capBytes,
  };

  if (opts.fromBlock !== undefined) {
    parsed.fromBlock = BigInt(parseNonNegativeInt(opts.fromBlock, 'from-block'));
  }
  if (opts.toBlock !== undefined) {
    parsed.toBlock = BigInt(parseNonNegativeInt(opts.toBlock, 'to-block'));
  }
  if (opts.floorBlock !== undefined) {
    parsed.floorBlock = BigInt(parseNonNegativeInt(opts.floorBlock, 'floor-block'));
  }
  if (parsed.fromBlock !== undefined && parsed.toBlock !== undefined && parsed.toBlock < parsed.fromBlock) {
    throw new Error('to-block must be greater than or equal to from-block.');
  }
  if (parsed.floorBlock !== undefined && parsed.fromBlock !== undefined && parsed.floorBlock > parsed.fromBlock) {
    throw new Error('floor-block must be less than or equal to from-block.');
  }

  return parsed;
}

function parseFeeAnalysisReportOptions(opts = {}) {
  const minGames = parseNonNegativeInt(opts.minGames ?? '1', 'min-games');
  if (minGames <= 0) {
    throw new Error('min-games must be greater than 0.');
  }

  return {
    minGames,
    capBytes: parseFeeAnalysisCapBytes(opts.capMb),
  };
}

function formatNullableApe(value, decimals = 6) {
  if (value === null || value === undefined) {
    return 'n.a.';
  }
  return formatPlainApe(value, decimals);
}

function formatNullableBps(value) {
  if (value === null || value === undefined) {
    return 'n.a.';
  }
  return `${Number(value).toFixed(2)} bps`;
}

function formatFeeMinMax(stats, { derived = false } = {}) {
  if (derived && stats.games > 0 && stats.min_fee_ape === null && stats.max_fee_ape === null) {
    return 'n.a. (not tracked for derived rest)';
  }
  return `${formatNullableApe(stats.min_fee_ape, 6)} / ${formatNullableApe(stats.max_fee_ape, 6)}`;
}

function formatFeeStatsBlock(label, stats, { derived = false } = {}) {
  return [
    `   ${theme.label(`${label}:`)}`,
    `      Games: ${stats.games} (${stats.wins}/${stats.pushes}/${stats.losses} W/P/L)`,
    `      Wager: ${formatPlainApe(stats.wager_ape, 6)} avg ${formatPlainApe(stats.avg_wager_ape, 6)}`,
    `      Fees: ${formatPlainApe(stats.fee_ape, 6)} avg ${formatPlainApe(stats.avg_fee_ape, 6)} (${formatNullableBps(stats.avg_fee_bps)})`,
    `      Min/Max fee: ${formatFeeMinMax(stats, { derived })}`,
    `      Gas: ${formatPlainApe(stats.gas_ape, 6)} avg ${formatPlainApe(stats.avg_gas_ape, 6)}`,
    `      Cost: ${formatPlainApe(stats.cost_ape, 6)} avg ${formatPlainApe(stats.avg_cost_ape, 6)} (${formatNullableBps(stats.avg_cost_bps)})`,
    `      Success rate: ${stats.win_rate.toFixed(2)}%`,
  ];
}

function formatFeeLeader(label, leader) {
  if (!leader) {
    return `   ${theme.label(`${label}:`)} n.a.`;
  }

  return `   ${theme.label(`${label}:`)} ${formatAddress(leader.wallet)} ${theme.dim(`${leader.games} game(s)`)} avg ${formatNullableBps(leader.avg_fee_bps)} win ${leader.win_rate.toFixed(2)}%`;
}

function formatFeeExtreme(label, extreme, valueFormatter = (value) => value) {
  if (!extreme) {
    return `   ${theme.label(`${label}:`)} n.a.`;
  }

  return `   ${theme.label(`${label}:`)} ${valueFormatter(extreme)} ${theme.dim(`block ${extreme.block_number} ${extreme.tx}`)} ${formatAddress(extreme.wallet)}`;
}

function formatFeeOutlier(outlier) {
  const extreme = outlier?.extreme;
  if (!extreme) {
    return null;
  }
  const location = theme.dim(`block ${extreme.block_number} ${extreme.tx}`);
  if (outlier.type === 'zero_fee') {
    return `      ${theme.warning('Zero observed fee:')} ${formatPlainApe(extreme.wager_ape, 6)} wager ${location} ${formatAddress(extreme.wallet)}`;
  }
  if (outlier.type === 'high_fee_bps') {
    return `      ${theme.warning('High fee/wager:')} ${formatNullableBps(outlier.value_bps)} on ${formatPlainApe(extreme.wager_ape, 6)} wager ${location} ${formatAddress(extreme.wallet)}`;
  }
  return null;
}

function formatFeesScanReport(scanResult) {
  const lines = [
    '',
    formatHeader('Fee Scan', '💸'),
    '',
    `   ${theme.label('Game:')} ${theme.gameName(scanResult.name)} ${theme.dim(`(${scanResult.game})`)}`,
    `   ${theme.label('Contract:')} ${scanResult.contract}`,
    `   ${theme.label('Blocks:')} ${scanResult.oldest_scanned_block || 'n.a.'} -> ${scanResult.latest_scanned_block || 'n.a.'}`,
    `   ${theme.label('Backfill floor:')} ${scanResult.floor_block || 'n.a.'}`,
    `   ${theme.label('Chunks:')} ${scanResult.scanned_chunks}/${scanResult.planned_chunks}`,
    `   ${theme.label('Observed games:')} ${scanResult.games}`,
    `   ${theme.label('Tracked wallets:')} ${scanResult.tracked_wallets}`,
    `   ${theme.label('File:')} ${theme.dim(scanResult.file_path)}`,
    `   ${theme.label('Size:')} ${(scanResult.file_size_bytes / 1024).toFixed(1)} KiB / ${(scanResult.cap_bytes / 1024 / 1024).toFixed(1)} MiB`,
  ];

  if (scanResult.target_wallet) {
    lines.push(`   ${theme.label('Target wallet:')} ${formatAddress(scanResult.target_wallet)}`);
    lines.push(`   ${theme.label('Target chunks:')} ${scanResult.target_scanned_chunks}`);
  }
  if (scanResult.stale_schema_version !== null && scanResult.stale_schema_version !== undefined) {
    lines.push(`   ${theme.warning(`Rebuilt fee log from stale schema v${scanResult.stale_schema_version}.`)}`);
  }
  if (scanResult.missing_transaction_metadata > 0) {
    lines.push(`   ${theme.warning(`Missing tx metadata for ${scanResult.missing_transaction_metadata} observed log(s).`)}`);
  }
  if (scanResult.scanned_chunks === 0) {
    lines.push(`   ${theme.dim('No uncovered chunks were available for the requested range.')}`);
  }

  lines.push('');
  return lines.join('\n');
}

async function confirmUnlimitedFeeScan(game, scanOpts, {
  targetWallet = null,
  json = false,
  yes = false,
} = {}) {
  if (Number(scanOpts.maxChunks) !== 0 || yes) {
    return true;
  }
  if (json) {
    throw new Error('fees scan with unlimited chunks requires --yes in JSON mode.');
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('fees scan with unlimited chunks requires --yes in non-interactive mode.');
  }

  const filePath = path.join(LOG_DIR, 'fees', `${game.key}.json`);
  const targetLabel = targetWallet ? formatAddress(targetWallet) : 'none';
  const fromLabel = scanOpts.fromBlock !== undefined ? scanOpts.fromBlock.toString() : 'automatic';
  const toLabel = scanOpts.toBlock !== undefined ? scanOpts.toBlock.toString() : 'latest chain block';
  const floorLabel = scanOpts.floorBlock !== undefined ? scanOpts.floorBlock.toString() : 'contract deployment block';
  const lines = [
    '',
    formatHeader('Full Fee Scan', '💸'),
    '',
    `   ${theme.label('Game:')} ${theme.gameName(getGameDisplayName(game))} ${theme.dim(`(${game.key})`)}`,
    `   ${theme.label('Contract:')} ${game.contract}`,
    `   ${theme.label('File:')} ${theme.dim(filePath)}`,
    `   ${theme.label('Target wallet:')} ${targetLabel}`,
    `   ${theme.label('Range:')} ${fromLabel} -> ${toLabel}`,
    `   ${theme.label('Backfill floor:')} ${floorLabel}`,
    `   ${theme.label('Chunk size:')} ${scanOpts.chunkSize.toString()} block(s)`,
    '',
    '   This scan will update the compact per-game fee log. It first fills the',
    '   delta from the newest locally scanned block to the current chain tip,',
    '   then continues backward from the oldest locally scanned block down to',
    '   the contract deployment block. Progress is saved after every chunk, so',
    '   the command can be interrupted and rerun to resume.',
    '',
  ];

  console.log(lines.join('\n'));
  const answer = await prompt('Proceed with full historical fee scan? (y/N) ');
  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

function formatFeesReport(report) {
  const lines = [
    '',
    formatHeader('Fee Report', '💸'),
    '',
    `   ${theme.label('Game:')} ${theme.gameName(report.name)} ${theme.dim(`(${report.game})`)}`,
    `   ${theme.label('Contract:')} ${report.contract}`,
    `   ${theme.label('File:')} ${theme.dim(report.file_path)}`,
    `   ${theme.label('Blocks:')} ${report.scan.oldest_scanned_block || 'n.a.'} -> ${report.scan.latest_scanned_block || 'n.a.'}`,
    `   ${theme.label('Observed games:')} ${report.global.games}`,
    `   ${theme.label('Tracked wallets:')} ${report.tracked_wallets}`,
  ];

  if (report.wallet) {
    lines.push(`   ${theme.label('Wallet:')} ${formatAddress(report.wallet)}`);
    if (!report.wallet_exact) {
      lines.push(`   ${theme.warning('This wallet is not fully tracked for every scanned range. Run fees scan with this wallet selected to fill the target aggregate.')}`);
    }
  }
  if (report.stale_schema_version !== null && report.stale_schema_version !== undefined) {
    lines.push(`   ${theme.warning(`Existing fee log schema v${report.stale_schema_version} was ignored. Run fees scan to rebuild it.`)}`);
  }

  lines.push('');
  lines.push(...formatFeeStatsBlock('Global', report.global));
  if (report.wallet) {
    lines.push('');
    lines.push(...formatFeeStatsBlock('Wallet', report.wallet_stats));
    lines.push('');
    lines.push(...formatFeeStatsBlock('Rest', report.rest_stats, { derived: true }));
  }

  if ((report.leaders?.retained_wallets || 0) >= 2) {
    lines.push('');
    lines.push(formatFeeLeader('Tracked cheapest avg fee', report.leaders.cheapest_avg_fee_wallet));
    lines.push(formatFeeLeader('Tracked highest avg fee', report.leaders.highest_avg_fee_wallet));
    lines.push(formatFeeLeader('Tracked best success', report.leaders.best_success_wallet));
  }
  lines.push('');
  lines.push(formatFeeExtreme('Min fee', report.extremes.min_fee, (extreme) => `${formatPlainApe(extreme.value_ape, 6)} (${formatNullableBps(extreme.fee_bps)})`));
  lines.push(formatFeeExtreme('Max fee', report.extremes.max_fee, (extreme) => `${formatPlainApe(extreme.value_ape, 6)} (${formatNullableBps(extreme.fee_bps)})`));
  lines.push(formatFeeExtreme('Min fee/wager', report.extremes.min_fee_bps, (extreme) => formatNullableBps(extreme.value)));
  lines.push(formatFeeExtreme('Max fee/wager', report.extremes.max_fee_bps, (extreme) => formatNullableBps(extreme.value)));
  const outlierLines = (report.outliers || [])
    .map(formatFeeOutlier)
    .filter(Boolean);
  if (outlierLines.length > 0) {
    lines.push('');
    lines.push(`   ${theme.label('Outliers:')}`);
    lines.push(...outlierLines);
  }
  lines.push('');

  return lines.join('\n');
}

// --- Helper: Get wallet account metadata / lazy local signer ---
async function getWalletWithPrompt(opts = {}) {
  if (!walletExists()) {
    const message = `No wallet found. Run: ${BINARY_NAME} install`;
    if (opts.json) console.error(JSON.stringify({ error: message }));
    else console.error(`
❌ ${message}
`);
    process.exit(1);
  }

  const meta = getWalletPublicMetadata();
  if (opts.gameplay) {
    const shouldContinue = await confirmGameplayPasswordPromptBehavior({
      json: opts.json,
      forcePrompt: opts.forceGameplayPrompt,
    });
    if (!shouldContinue) {
      process.exit(0);
    }
  }

  try {
    return getWallet();
  } catch (error) {
    const message = sanitizeError(error);
    if (opts.json) console.error(JSON.stringify({ error: message }));
    else console.error(`
❌ ${message}
`);
    process.exit(1);
  }
}

// ============================================================================
// COMMAND: INSTALL
// ============================================================================
program
  .command('install')
  .description('Setup the Ape Church agent with encrypted-only wallet storage')
  .option('--username <name>', 'Username for your bot')
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
  .option('-y, --quick', 'Skip optional interactive prompts, use defaults')
  .addHelpText('after', formatInstallHelpAppendix())
  .action(async (opts) => {
    const isInteractive = !opts.quick && !opts.username;

    ensureDir(APECHURCH_DIR);

    const existingWallet = loadWalletData();
    let address;
    let createdWallet = false;

    if (existingWallet && isWalletEncrypted()) {
      address = getWalletAddress();
      ensureWalletScopedData(address);
      console.log(`
✅ Using existing encrypted wallet: ${address}`);
    } else if (existingWallet) {
      console.error(`
❌ Selected wallet is not in a supported encrypted format.
   See LEGACY.md for the manual migration procedure.
`);
      process.exit(1);
    } else {
      const privateKey = await collectPrivateKeyForWalletImport();
      const password = await collectPasswordForWalletFile();
      const hints = await collectHintsIfInteractive({ interactive: isInteractive });

      try {
        const result = createEncryptedWalletFromPrivateKey(privateKey, password, hints);
        address = result.address;
        createdWallet = true;
        ensureWalletScopedData(address);
        console.log(`
✅ Imported wallet into encrypted-only storage: ${address}`);
      } catch (error) {
        console.error(`
❌ Invalid private key: ${sanitizeError(error)}
`);
        process.exit(1);
      }
    }

    if (!fs.existsSync(SKILL_TARGET_DIR)) {
      fs.mkdirSync(SKILL_TARGET_DIR, { recursive: true });
    }
    const skillSourceDirs = [
      path.join(__dirname, '..'),
      path.join(__dirname, '..', 'assets'),
    ];
    const skillBundleFiles = ['SKILL.md', 'HEARTBEAT.md', 'STRATEGY.md', 'skill.json'];
    for (const file of skillBundleFiles) {
      const source = skillSourceDirs
        .map((dir) => path.join(dir, file))
        .find((candidate) => fs.existsSync(candidate));
      if (source) {
        fs.copyFileSync(source, path.join(SKILL_TARGET_DIR, file));
      }
    }

    const localProfile = loadProfile();
    const persona = normalizeStrategy(opts.persona || localProfile.persona || 'balanced');
    let username;
    let usernameRegistered = false;

    if (opts.username) {
      try {
        username = normalizeUsername(opts.username);
      } catch (error) {
        console.error(`
❌ Invalid username: ${error.message}`);
        username = generateUsername();
        console.log(`   Using auto-generated username: ${username}`);
      }
    } else if (isInteractive) {
      console.log('\nChoose a username for your bot on Ape Church.');
      console.log('(Letters, numbers, underscores only. Max 32 characters. Leave blank for auto-generated.)');
      while (!username) {
        const usernameInput = await prompt('\nUsername: ');
        if (!usernameInput.trim()) {
          username = generateUsername();
          console.log(`Using auto-generated username: ${username}`);
          break;
        }
        try {
          username = normalizeUsername(usernameInput);
        } catch (error) {
          console.log(`❌ ${error.message}`);
        }
      }
    } else {
      username = generateUsername();
    }

    if (!opts.quick && username) {
      console.log(`
Registering \"${username}\"...`);
      try {
        const account = getWallet();
        await registerUsername({ account, username, persona });
        usernameRegistered = true;
        console.log('✅ Username registered!');
      } catch (error) {
        console.log(`⚠️  Registration failed: ${sanitizeError(error)}`);
        console.log(`   (You can try again later with: ${BINARY_NAME} register --username YOUR_NAME)`);
      }
    }

    if (!usernameRegistered) {
      saveProfile({ ...localProfile, username, persona });
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('                        SETUP COMPLETE                             ');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  AGENT ADDRESS: ${address}`);
    console.log(`  USERNAME:      ${username}`);
    if (!usernameRegistered) {
      console.log(`                 (Change anytime: ${BINARY_NAME} register --username <YOUR_NAME>)`);
    }
    console.log(`  PERSONA:       ${persona}`);
    console.log('');
    console.log(`  WALLET SELECTOR: ${WALLET_FILE}`);
    console.log(`  WALLET ENTRIES:  ${WALLETS_DIR}/<address>.json`);
    console.log('  STORAGE:       encrypted-only, no plaintext private key on disk');
    console.log('  SIGNING:       local-only, just-in-time decryption per signature');
    console.log('');
    console.log('  ⚠️  ACTION REQUIRED: Send APE to this address on ApeChain.');
    console.log('  ⚠️  Forgot password = permanent loss of access to signing with this local setup.');
    console.log('');
    console.log(`  For headless/agent use, set ${PASS_ENV_VAR} only on the local machine.`);
    console.log(`  Fresh install/reinstall prompts locally for the private key.`);
    console.log(`  Fallback for non-interactive install only: ${PRIVATE_KEY_ENV_VAR} on the local machine.`);
    console.log(`  To override the username/profile API, set ${PROFILE_URL_ENV_VAR} on the local machine.`);
    console.log('  Bridge APE:  https://relay.link/bridge/apechain');
    console.log('═══════════════════════════════════════════════════════════════════');

    if (new Date() < CONTEST_END_DATE) {
      console.log('');
      console.log('  🏆 AGENT CONTEST IS LIVE!');
      console.log('     Compete against other agents for prizes.');
      console.log(`     Run: ${BINARY_NAME} contest`);
      console.log('═══════════════════════════════════════════════════════════════════');
    }

    if (createdWallet && !process.env[PASS_ENV_VAR]) {
      console.log('');
      console.log('  🔐 PASSWORD PROMPTS');
      console.log('     Because no password env var is set, each signature will ask for the password locally.');
      console.log('═══════════════════════════════════════════════════════════════════');
      console.log('');
    }
  });

// ============================================================================
// COMMAND: UNINSTALL
// ============================================================================
program
  .command('uninstall')
  .description(`Remove local ${BINARY_NAME} data from this machine`)
  .option('-y, --yes', 'Skip confirmation')
  .addHelpText('after', formatUninstallHelpAppendix())
  .action(async (opts) => {
    if (!fs.existsSync(APECHURCH_DIR)) {
      console.log(`\nNo local ${BINARY_NAME} data found. Nothing to remove.\n`);
      return;
    }

    if (!opts.yes) {
      console.log('\n⚠️  This will delete:');
      console.log(`   - Wallet selector at ${WALLET_FILE}`);
      console.log(`   - Wallet entries, profiles, state, history, and unfinished games under ${APECHURCH_DIR}`);
      console.log('\n   Make sure you still control the original private key outside this local installation.');
      console.log(`   Reinstall will prompt for the private key on this local machine.`);
      console.log(`   Fallback for non-interactive reinstall only: ${PRIVATE_KEY_ENV_VAR}.\n`);
      
      const confirm = await prompt('Type "DELETE" to confirm: ');
      if (confirm.trim() !== 'DELETE') {
        console.log('\nCancelled.\n');
        return;
      }
    }

    try {
      fs.rmSync(APECHURCH_DIR, { recursive: true, force: true });
      console.log(`\n✅ ${BINARY_NAME} local data removed.\n`);
    } catch (error) {
      console.error(`\n❌ Failed to remove: ${error.message}\n`);
    }
  });

// ============================================================================
// COMMAND: BUCKET
// ============================================================================
program
  .command('bucket [action] [bucket]')
  .description('Cloudflare R2 bot log mirror config')
  .option('--json', 'JSON output')
  .option('-v, --verbose', 'Decrypt and show R2 endpoints plus bucket fallback environment values for status/list')
  .addHelpText('after', formatBucketHelpAppendix())
  .action(async (action = 'status', bucket, opts) => {
    const normalizedAction = String(action || 'status').trim().toLowerCase();

    function writeError(message) {
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exitCode = 1;
    }

    if (opts.verbose && !['status', 'list'].includes(normalizedAction)) {
      writeError('-v/--verbose is only supported with bucket status and bucket list.');
      return;
    }

    if (normalizedAction === 'status') {
      const payload = getR2PublicMetadata();
      let verboseDetails = null;
      if (opts.verbose && payload.enabled) {
        try {
          const selected = listStoredR2Configs().find((entry) => entry.isCurrent);
          const password = await collectR2PasswordForVerboseBucketOutput({
            commandLabel: `${BINARY_NAME} bucket status -v`,
          });
          verboseDetails = getR2VerboseBucketDetails(selected, password);
          payload.verbose = verboseDetails;
        } catch (error) {
          writeError(sanitizeError(error));
          return;
        }
      } else if (opts.verbose) {
        payload.verbose = null;
      }

      if (opts.json) {
        console.log(JSON.stringify(payload));
      } else {
        console.log('\n☁️  R2 Bot Log Mirror\n');
        console.log(`   Enabled:                ${payload.enabled ? 'Yes' : 'No'}`);
        console.log(`   Enabled bucket:         ${payload.enabled_bucket || 'N/A'}`);
        console.log(`   Stored bucket entries:  ${payload.configs_count}`);
        console.log(`   Password env var:       ${payload.password_env_var}`);
        console.log(`   Password env configured:${payload.password_env_configured ? ' Yes' : ' No'}`);
        console.log(`   Prefix env var:         ${payload.prefix_env_var}`);
        console.log(`   Prefix configured:      ${payload.prefix_configured ? 'Yes' : 'No'}`);
        if (opts.verbose) {
          if (verboseDetails) {
            console.log('');
            printR2VerboseBucketDetails(verboseDetails);
          } else {
            console.log('   Verbose details:        N/A (no enabled R2 bucket entry)');
          }
        }
        console.log('');
      }
      return;
    }

    if (normalizedAction === 'list') {
      const storedConfigs = listStoredR2Configs();
      let verboseByBucket = new Map();
      if (opts.verbose && storedConfigs.length > 0) {
        try {
          const password = await collectR2PasswordForVerboseBucketOutput({
            commandLabel: `${BINARY_NAME} bucket list -v`,
          });
          verboseByBucket = new Map(storedConfigs.map((entry) => {
            const details = getR2VerboseBucketDetails(entry, password);
            return [entry.bucket, details];
          }));
        } catch (error) {
          writeError(sanitizeError(error));
          return;
        }
      }

      const configs = storedConfigs.map((entry) => ({
        bucket: entry.bucket,
        enabled: Boolean(entry.isCurrent),
        ...(opts.verbose ? { verbose: verboseByBucket.get(entry.bucket) || null } : {}),
      }));
      if (opts.json) {
        console.log(JSON.stringify({ buckets: configs }));
      } else if (configs.length === 0) {
        console.log('\nNo R2 bucket entries configured.\n');
      } else {
        console.log('\nStored R2 bucket entries:\n');
        for (const entry of configs) {
          console.log(`  ${entry.enabled ? '*' : ' '} ${entry.bucket}`);
          if (opts.verbose && entry.verbose) {
            printR2VerboseBucketDetails(entry.verbose, { indent: '      ' });
          }
        }
        console.log('');
      }
      return;
    }

    if (normalizedAction === 'disable') {
      const result = disableSelectedR2Config();
      if (result.error) {
        writeError(result.error);
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify({ success: true, enabled: false }));
      } else {
        console.log('\n✅ R2 bot log mirroring disabled. Stored encrypted bucket entries were preserved.\n');
      }
      return;
    }

    if (normalizedAction === 'enable') {
      if (!bucket) {
        writeError(`Usage: ${BINARY_NAME} bucket enable <bucket>`);
        return;
      }

      let enabled;
      try {
        enabled = enableStoredR2Config(bucket);
      } catch (error) {
        writeError(sanitizeError(error));
        return;
      }
      if (enabled.error) {
        writeError(enabled.error);
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          action: 'enable',
          changed: enabled.changed,
          bucket: enabled.bucket,
        }));
      } else {
        console.log(enabled.changed
          ? `\n✅ Enabled R2 bucket entry: ${enabled.bucket}\n`
          : `\nR2 bucket entry already enabled: ${enabled.bucket}\n`);
      }
      return;
    }

    if (normalizedAction === 'install' || normalizedAction === 'reinstall') {
      let targetBucket;
      try {
        targetBucket = resolveR2BucketForInstall(bucket);
      } catch (error) {
        writeError(`Usage: ${BINARY_NAME} bucket ${normalizedAction} <bucket> or set ${R2_NAME_ENV_VAR}`);
        return;
      }

      try {
        const password = await collectPasswordForWalletFile({
          commandLabel: `${BINARY_NAME} bucket ${normalizedAction}`,
          promptLabel: 'R2 encryption password',
        });
        const credentials = await collectR2CredentialsForInstall(targetBucket, {
          commandLabel: `${BINARY_NAME} bucket ${normalizedAction}`,
        });
        const result = saveEncryptedR2Config(credentials, password);

        if (opts.json) {
          console.log(JSON.stringify({
            success: true,
            action: normalizedAction,
            bucket: result.bucket,
            enabled: true,
            config_file: result.filePath,
            selector_file: result.selectorFile,
          }));
        } else {
          console.log('\n✅ R2 bot log mirroring configured.');
          console.log(`   Bucket:        ${result.bucket}`);
          console.log('   Enabled:       Yes');
          console.log(`   Config file:   ${result.filePath}`);
          console.log(`   Selector file: ${result.selectorFile}`);
          console.log('   Remote path:   <prefix>/<bot>/<log>.json');
          console.log('');
        }
      } catch (error) {
        writeError(`Failed to configure R2 log mirroring: ${sanitizeError(error)}`);
      }
      return;
    }

    writeError(`Unknown R2 action: ${action}`);
  });

// ============================================================================
// COMMAND: WALLET
// ============================================================================
program
  .command('wallet [action] [address]')
  .description('Wallet management (status, new, select, download, rotate password, hints, reset)')
  .option('-y, --yes', 'Skip confirmation')
  .option('--list', 'List locally available wallet addresses')
  .option('--json', 'JSON output')
  .option('--from-block <n>', 'Start block for wallet history download or backfill')
  .option('--to-block <n>', 'End block for wallet history download (default latest)')
  .option('--chunk-size <n>', 'Block range per log query for wallet history download', DEFAULT_HISTORY_SYNC_CHUNK_SIZE.toString())
  .addHelpText('after', formatWalletHelpAppendix())
  .action(async (action, address, opts) => {
    if (opts.list) {
      const wallets = listStoredWallets();
      const payload = {
        wallets: wallets.map(wallet => ({
          address: wallet.address,
          current: Boolean(wallet.isCurrent),
        })),
      };

      if (opts.json) {
        console.log(JSON.stringify(payload));
      } else {
        printAddressList('Stored Wallets', wallets.map(wallet => wallet.address), {
          currentAddress: wallets.find(wallet => wallet.isCurrent)?.address || null,
        });
      }
      return;
    }

    const unsupportedActions = new Set(['export', 'decrypt', 'unlock', 'lock']);
    if (unsupportedActions.has(action)) {
      const message = `${action} is disabled in this hardened build. Plaintext key export/storage and cached unlock sessions are not allowed.`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`
❌ ${message}
`);
      process.exit(1);
    }

    if (action === 'download') {
      const targetAddress = resolveHistoryTargetAddress(address);
      if (!targetAddress) {
        const message = `No wallet address provided and no local wallet found. Use: ${BINARY_NAME} wallet download <address>`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }

      if (!isAddress(targetAddress)) {
        const message = `Invalid wallet address: ${targetAddress}`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }

      try {
        if (!opts.json) {
          console.log(`\n📥 Downloading history for ${targetAddress}${opts.fromBlock !== undefined ? ` from block ${opts.fromBlock}` : ''}${opts.toBlock !== undefined ? ` to block ${opts.toBlock}` : ' to latest'}...\n`);
        }

        const downloadResult = await downloadHistoryForCli(targetAddress, {
          ...opts,
          rebuildHistory: true,
        });

        if (opts.json) {
          console.log(JSON.stringify(downloadResult));
        } else {
          console.log(formatWalletDownloadReport(downloadResult));
        }
      } catch (error) {
        const message = `Failed to download wallet history: ${sanitizeError(error)}`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }

      return;
    }

    if (action === 'new') {
      const previousAddress = getWalletAddress();
      if (previousAddress) {
        prepareCurrentWalletForSwitch({ json: opts.json });
      }

      const privateKey = await collectPrivateKeyForWalletImport({ commandLabel: `${BINARY_NAME} wallet new` });
      const password = await collectPasswordForWalletFile({ commandLabel: `${BINARY_NAME} wallet new` });
      const hints = await collectHintsIfInteractive();

      try {
        const result = createEncryptedWalletFromPrivateKey(privateKey, password, hints);
        ensureWalletScopedData(result.address);

        if (opts.json) {
          console.log(JSON.stringify({
            success: true,
            action: 'new',
            address: result.address,
            previous_address: previousAddress || null,
            wallet_file: result.filePath || null,
            selector_file: WALLET_FILE,
          }));
        } else {
          console.log('\n✅ Wallet created and selected.');
          if (previousAddress) {
            console.log(`   Previous wallet saved: ${previousAddress}`);
          }
          console.log(`   Current wallet:        ${result.address}`);
          if (result.filePath) {
            console.log(`   Wallet file:           ${result.filePath}`);
          }
          console.log(`   Selector file:         ${WALLET_FILE}`);
          console.log('');
        }
      } catch (error) {
        const message = `Failed to create wallet: ${sanitizeError(error)}`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }

      return;
    }

    if (action === 'select') {
      const wallets = listStoredWallets();
      if (wallets.length === 0) {
        const message = `No wallets are available. Run: ${BINARY_NAME} install or ${BINARY_NAME} wallet new`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }

      let targetWallet = null;
      if (address) {
        targetWallet = findStoredWallet(address);
        if (!targetWallet) {
          const message = `Wallet not found: ${address}`;
          if (opts.json) {
            console.log(JSON.stringify({
              error: message,
              wallets: wallets.map(wallet => wallet.address),
            }));
          } else {
            console.error(`\n❌ ${message}\n`);
            printSelectableWallets(wallets);
          }
          process.exit(1);
        }
      } else {
        if (opts.json) {
          console.log(JSON.stringify({
            error: 'wallet select without <address> requires an interactive terminal.',
            wallets: wallets.map(wallet => wallet.address),
          }));
          process.exit(1);
        }

        try {
          targetWallet = await promptForWalletSelection(wallets);
        } catch (error) {
          const message = sanitizeError(error);
          console.error(`\n❌ ${message}\n`);
          process.exit(1);
        }
      }

      if (targetWallet.isCurrent) {
        if (opts.json) {
          console.log(JSON.stringify({
            success: true,
            action: 'select',
            changed: false,
            address: targetWallet.address,
          }));
        } else {
          console.log(`\nCurrent wallet remains ${targetWallet.address}\n`);
        }
        return;
      }

      const previousAddress = prepareCurrentWalletForSwitch({ json: opts.json });
      const result = selectStoredWallet(targetWallet.address);
      if (result.error) {
        if (opts.json) console.log(JSON.stringify({ error: result.error }));
        else console.error(`\n❌ ${result.error}\n`);
        process.exit(1);
      }

      ensureWalletScopedData(result.address);

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          action: 'select',
          changed: true,
          address: result.address,
          previous_address: previousAddress || null,
        }));
      } else {
        console.log('\n✅ Wallet switched.');
        if (previousAddress) {
          console.log(`   Previous wallet: ${previousAddress}`);
        }
        console.log(`   Current wallet:  ${result.address}\n`);
      }

      return;
    }

    if (action === 'password') {
      if (!walletExists()) {
        const message = `No wallet found. Run: ${BINARY_NAME} install`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }
      if (!isWalletEncrypted()) {
        const message = `Wallet file is invalid or not encrypted.`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }
      if (!process.stdin.isTTY || !process.stderr.isTTY) {
        const message = 'wallet password requires an interactive terminal for secure hidden prompts.';
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }

      let currentPassword;
      let newPassword;
      try {
        currentPassword = process.env[PASS_ENV_VAR] || await promptSecret('Current wallet password (input hidden): ');
        newPassword = await promptSecret('New wallet password (input hidden): ');
        if (!newPassword || newPassword.length < 8) {
          const message = 'New password must be at least 8 characters.';
          if (opts.json) console.log(JSON.stringify({ error: message }));
          else console.error(`\n❌ ${message}\n`);
          process.exit(1);
        }

        const confirm = await promptSecret('Confirm new wallet password (input hidden): ');
        if (newPassword !== confirm) {
          const message = 'New passwords do not match.';
          if (opts.json) console.log(JSON.stringify({ error: message }));
          else console.error(`\n❌ ${message}\n`);
          process.exit(1);
        }

        const result = rotateEncryptedWalletPassword(currentPassword, newPassword);
        if (result.error) {
          if (opts.json) console.log(JSON.stringify({ error: result.error }));
          else console.error(`\n❌ ${result.error}\n`);
          process.exit(1);
        }

        if (opts.json) {
          console.log(JSON.stringify({
            success: true,
            address: result.address,
            hints_count: result.hintsCount,
          }));
        } else {
          console.log('\n✅ Wallet password updated successfully!');
          console.log(`   Address: ${result.address}`);
          console.log(`   Password hints preserved: ${result.hintsCount}\n`);
        }
      } finally {
        currentPassword = null;
        newPassword = null;
      }

      return;
    }

    if (action === 'hints') {
      if (!walletExists()) {
        console.error(`
❌ No wallet found. Run: ${BINARY_NAME} install
`);
        process.exit(1);
      }
      if (!isWalletEncrypted()) {
        console.error('\n❌ Wallet is not encrypted. Hints apply only to encrypted wallets.\n');
        process.exit(1);
      }

      const currentHints = getWalletHints();
      console.log('\n📝 Password Hints\n');
      if (currentHints.length > 0) {
        console.log('   Current hints:');
        currentHints.forEach((h, i) => console.log(`     ${i + 1}. ${h}`));
      } else {
        console.log('   No hints set.');
      }

      const update = await prompt('\nUpdate hints? (y/N): ');
      if (update.toLowerCase() !== 'y') {
        console.log('');
        return;
      }

      console.log('\n   Set up to 3 hints (press Enter to skip):\n');
      const newHints = [];
      for (let i = 1; i <= 3; i++) {
        const hint = await prompt(`   Hint ${i}: `);
        if (hint.trim()) newHints.push(hint.trim());
      }

      try {
        setWalletHints(newHints);
      } catch (error) {
        console.error(`
❌ ${sanitizeError(error)}
`);
        process.exit(1);
      }

      console.log('\n✅ Hints updated.\n');
      return;
    }

    if (action === 'status') {
      const meta = getWalletPublicMetadata();
      const payload = {
        exists: walletExists(),
        encrypted: Boolean(meta?.encrypted),
        address: meta?.address || null,
        hints_count: meta?.hints?.length || 0,
        stored_wallets: listStoredWallets().length,
        session_caching: false,
        local_only_signing: true,
        password_env_var: PASS_ENV_VAR,
        password_env_configured: Boolean(process.env[PASS_ENV_VAR]),
      };

      if (opts.json) {
        console.log(JSON.stringify(payload));
      } else {
        console.log('\n🔐 Wallet Security Status\n');
        console.log(`   Exists:                 ${payload.exists ? 'Yes' : 'No'}`);
        console.log(`   Encrypted:              ${payload.encrypted ? 'Yes' : 'No'}`);
        console.log(`   Address:                ${payload.address || 'N/A'}`);
        console.log(`   Password hints:         ${payload.hints_count}`);
        console.log(`   Stored wallets:         ${payload.stored_wallets}`);
        console.log('   Session cache:          Disabled');
        console.log('   Signing:                Local only, decrypt-on-sign');
        console.log(`   Password env var:       ${payload.password_env_var}`);
        console.log(`   Password env configured:${payload.password_env_configured ? ' Yes' : ' No'}`);
        console.log('');
      }
      return;
    }

    if (action === 'reset') {
      console.log('\n' + '⚠️'.repeat(20));
      console.log('\n🚨 DANGER: LOCAL WALLET RESET 🚨\n');
      console.log('This will:');
      console.log('  • DELETE your local encrypted wallet file permanently');
      console.log('  • DELETE all game history');
      console.log('  • DELETE all local state');
      console.log('  • DELETE local skill installation files');
      console.log('  • NOT export or reveal the private key\n');
      console.log(`To reinstall afterwards rerun ${BINARY_NAME} install and enter the private key when prompted.`);
      console.log(`Fallback for non-interactive reinstall only: ${PRIVATE_KEY_ENV_VAR}.\n`);

      if (!opts.yes) {
        const confirm = await prompt('Type "RESET" to confirm permanent deletion: ');
        if (confirm.trim() !== 'RESET') {
          console.log('\nCancelled. Your local data is unchanged.\n');
          return;
        }
      }

      try {
        if (fs.existsSync(APECHURCH_DIR)) {
          fs.rmSync(APECHURCH_DIR, { recursive: true, force: true });
        }
      } catch (error) {
        console.error(`
❌ Failed to clear data: ${error.message}
`);
        process.exit(1);
      }

      console.log('\n✅ Local wallet and state deleted.\n');
      console.log(`   Next steps:`);
      console.log(`   1. Run: ${BINARY_NAME} install`);
      console.log(`   2. Enter the private key when prompted`);
      console.log(`   3. Fallback for non-interactive reinstall only: ${PRIVATE_KEY_ENV_VAR}\n`);
      return;
    }

    if (!action) {
      console.log(`Missing wallet action. Use: ${BINARY_NAME} wallet --list`);
      console.log('Available: status, new, select, download, password, hints, reset');
      return;
    }

    console.log(`Unknown wallet action: ${action}`);
    console.log('Available: status, new, select, download, password, hints, reset');
    process.exitCode = 1;
  });

// ============================================================================
// COMMAND: STATUS
// ============================================================================
program
  .command('status')
  .description('Show current wallet, balance, profile, and unfinished local games')
  .option('--json', 'Output JSON only')
  .addHelpText('after', formatStatusHelpAppendix())
  .action(async (opts) => {
    const account = await getWalletWithPrompt({ json: opts.json });
    const profile = loadProfile(account.address);
    const activeGames = loadActiveGames(account.address);
    const { publicClient } = createClients();

    const balancePromise = getBalanceWithRetry(publicClient, account.address, { attempts: 1 });
    const gpBalancePromise = GP_TOKEN_CONTRACT === ZERO_ADDRESS
      ? Promise.resolve(0n)
      : publicClient.readContract({
        address: GP_TOKEN_CONTRACT,
        abi: GP_TOKEN_ABI,
        functionName: 'getCurrentEXP',
        args: [account.address],
      });
    const houseBalancePromise = publicClient.readContract({
      address: HOUSE_CONTRACT,
      abi: HOUSE_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });

    const [balanceResult, gpBalanceResult, houseBalanceResult] = await Promise.allSettled([
      balancePromise,
      gpBalancePromise,
      houseBalancePromise,
    ]);

    if (balanceResult.status === 'rejected') {
      const err = { error: `Failed to fetch balance: ${sanitizeError(balanceResult.reason)}` };
      if (opts.json) console.log(JSON.stringify(err));
      else console.error('\n❌ ' + err.error + '\n');
      return;
    }

    const balance = balanceResult.value;
    const gpBalance = gpBalanceResult.status === 'fulfilled' ? gpBalanceResult.value : 0n;
    const houseBalance = houseBalanceResult.status === 'fulfilled' ? houseBalanceResult.value : 0n;
    const balanceApe = parseFloat(formatEther(balance));
    const houseBalanceApe = parseFloat(formatEther(houseBalance));
    const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
    const canPlay = availableApe >= 1 && !profile.paused;
    const unfinishedGames = summarizeUnfinishedGames(activeGames);
    const gpPerApeInfo = resolveGpPerApeInfo({ profile });

    const response = {
      address: account.address,
      balance: balanceApe.toFixed(4),
      available_ape: availableApe.toFixed(4),
      gas_reserve_ape: GAS_RESERVE_APE.toFixed(4),
      gp_balance: gpBalance.toString(),
      house_balance: houseBalanceApe.toFixed(4),
      paused: profile.paused,
      persona: profile.persona,
      username: profile.username,
      gp_rate: {
        base_gp_per_ape: gpPerApeInfo.baseGpPerApe,
        current_gp_per_ape: gpPerApeInfo.currentGpPerApe,
        effective_gp_per_ape: gpPerApeInfo.gpPerApe,
        source: gpPerApeInfo.source,
        source_label: gpPerApeInfo.sourceLabel,
      },
      can_play: canPlay,
      unfinished_games: unfinishedGames,
    };

    if (opts.json) {
      console.log(JSON.stringify(response));
    } else {
      console.log(`${formatHeader('Wallet Status', '👛')}\n`);
      console.log(formatField('Address', formatAddress(response.address)));
      console.log(formatField('Balance', formatBalance(response.balance)));
      console.log(formatField('GP', theme.yellow(`${response.gp_balance} GP`)));
      console.log(formatField('Current GP Rate', `${theme.yellow(`${formatGpPerApeValue(gpPerApeInfo.gpPerApe)} GP/APE`)} ${theme.dim(`(${gpPerApeInfo.sourceLabel})`)}`));
      if (houseBalanceApe > 0) {
        console.log(formatField('House', theme.staked(`${response.house_balance} APE`) + theme.dim(' (staked)')));
      }
      console.log(formatField('Username', response.username ? theme.accent(response.username) : theme.dim('(not set)')));
      console.log(formatField('Persona', theme.value(response.persona)));
      console.log(formatField('Paused', response.paused ? theme.warning('Yes') : theme.success('No')));
      console.log(formatField('Can Play', formatYesNo(response.can_play)));
      console.log('');

      console.log(formatUnfinishedGamesSection(unfinishedGames));
      console.log('');
    }
  });

// ============================================================================
// COMMAND: PAUSE / RESUME
// ============================================================================
program
  .command('pause')
  .description('Pause autonomous play')
  .addHelpText('after', formatPauseHelpAppendix())
  .action(() => {
    const profile = loadProfile();
    saveProfile({ ...profile, paused: true });
    console.log(JSON.stringify({ status: 'paused', message: 'Autonomous play paused.' }));
  });

program
  .command('continue')
  .description('Continue autonomous play')
  .addHelpText('after', formatContinueHelpAppendix())
  .action(() => {
    const profile = loadProfile();
    saveProfile({ ...profile, paused: false });
    console.log(JSON.stringify({ status: 'continued', message: 'Autonomous play continued.' }));
  });

// ============================================================================
// COMMAND: REGISTER
// ============================================================================
program
  .command('register')
  .description('Register or change username')
  .option('--username <name>', 'New username')
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
  .addHelpText('after', formatRegisterHelpAppendix())
  .action(async (opts) => {
    const account = await getWalletWithPrompt({ json: true });
    const profile = loadProfile();
    
    const username = opts.username ? normalizeUsername(opts.username) : profile.username || generateUsername();
    const persona = normalizeStrategy(opts.persona || profile.persona);

    try {
      const result = await registerUsername({ account, username, persona });
      console.log(JSON.stringify({
        status: 'registered',
        username,
        persona,
        address: account.address,
      }));
    } catch (error) {
      console.error(JSON.stringify({ error: sanitizeError(error) }));
      process.exit(1);
    }
  });

// ============================================================================
// COMMAND: PROFILE
// ============================================================================
program
  .command('profile [action]')
  .description('Profile management (show, set)')
  .addHelpText('after', formatProfileHelpAppendix())
  .option('--username <name>', `Register or change username (same as ${BINARY_NAME} register --username)`)
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
  .option('--referral <address>', 'Referral wallet address for future game transactions')
  .option('--card-display <mode>', 'Card display mode: full | simple | json')
  .option('--gp-ape <points>', 'Wallet-specific current GP per APE override')
  .option('--no-gp-ape', 'Clear the wallet-specific current GP per APE override')
  .option('--json', 'Output JSON')
  .action(async (action, opts) => {
    let profile = loadProfile();
    const rawArgs = process.argv.slice(2);
    const hasGpApeOverride = rawArgs.includes('--gp-ape');
    const hasNoGpApe = rawArgs.includes('--no-gp-ape');
    const hasMutatingOptions = Boolean(
      opts.username
      || opts.persona
      || opts.referral
      || opts.cardDisplay
      || hasGpApeOverride
      || hasNoGpApe
    );
    const resolvedAction = action || 'show';
    const effectiveGpPerApe = resolveGpPerApe({ profile });

    if (resolvedAction === 'show') {
      if (hasMutatingOptions) {
        console.error(JSON.stringify({
          error: `Mutating flags require "${BINARY_NAME} profile set ...".`,
        }));
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify({
          ...profile,
          baseGpPerApe: GP_PER_APE,
          effectiveGpPerApe,
        }));
      } else {
        console.log('\n📋 Profile\n');
        console.log(`   Username:     ${profile.username || '(not set)'}`);
        console.log(`   Persona:      ${profile.persona}`);
        console.log(`   Card Display: ${profile.cardDisplay || 'full'}`);
        console.log(`   Paused:       ${profile.paused ? 'Yes' : 'No'}`);
        console.log(`   Base GP Rate: ${GP_PER_APE} GP/APE`);
        console.log(`   Current GP Rate: ${profile.currentGpPerApe ?? '(not set)'}`);
        console.log(`   Effective GP Rate: ${effectiveGpPerApe} GP/APE`);
        console.log(`   Referral:     ${profile.referral || '(none)'}`);
        console.log('                 (used on future game transactions only)\n');
      }
    } else if (resolvedAction === 'set') {
      if (hasGpApeOverride && hasNoGpApe) {
        console.error(JSON.stringify({ error: 'Use either --gp-ape or --no-gp-ape, not both.' }));
        process.exit(1);
      }

      const requestedPersona = opts.persona ? normalizeStrategy(opts.persona) : null;
      if (opts.username) {
        const account = await getWalletWithPrompt({ json: true });
        const username = normalizeUsername(opts.username);
        const persona = requestedPersona || profile.persona;

        try {
          const result = await registerUsername({ account, username, persona });
          profile = result.profile;
        } catch (error) {
          console.error(JSON.stringify({ error: sanitizeError(error) }));
          process.exit(1);
        }
      }

      const updates = {};
      if (requestedPersona && !opts.username) updates.persona = requestedPersona;
      if (opts.cardDisplay) {
        const mode = opts.cardDisplay.toLowerCase();
        if (!['full', 'simple', 'json'].includes(mode)) {
          console.error(JSON.stringify({ error: 'Invalid card display mode. Use: full, simple, json' }));
          process.exit(1);
        }
        updates.cardDisplay = mode;
      }
      if (opts.referral) {
        // Validate it looks like an address
        const ref = opts.referral.trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(ref)) {
          console.error(JSON.stringify({ error: 'Invalid referral address. Must be a valid Ethereum address (0x...)' }));
          process.exit(1);
        }
        updates.referral = ref;
      }
      if (opts.gpApe !== undefined && opts.gpApe !== false) {
        try {
          updates.currentGpPerApe = normalizeGpPerApe(opts.gpApe);
        } catch (error) {
          console.error(JSON.stringify({ error: sanitizeError(error) }));
          process.exit(1);
        }
      } else if (opts.gpApe === false) {
        updates.currentGpPerApe = null;
      }

      const updated = Object.keys(updates).length > 0
        ? saveProfile({ ...profile, ...updates })
        : profile;
      console.log(JSON.stringify({
        status: opts.username ? 'registered' : 'updated',
        profile: updated,
      }));
    } else {
      console.log(`Unknown action: ${resolvedAction}. Use: show, set`);
    }
  });

// ============================================================================
// COMMAND: BET (Manual single bet)
// ============================================================================
program
  .command('bet')
  .description('Place one manual stateless-game wager')
  .requiredOption('--game <type>', GAME_LIST)
  .requiredOption('--amount <ape>', 'Wager amount')
  .option('--risk <risk>', 'Risk level for Bear Dice, Blocks, Plinko, Monkey Match, and Primes', '0')
  .option('--split <count>', 'Independent split attempts for Plinko, Primes, Speed Keno, and slots')
  .option('--survive <count>', 'All-or-nothing survival attempts for Bear Dice and Blocks')
  .option('--spins <count>', 'Slots-only alias for --split')
  .option('--bet <bet>', 'Roulette/Baccarat bet')
  .option('--cover <cover>', 'ApeStrong cover or Gimboz Smash random cover')
  .option('--range <range>', 'Gimboz Smash inside range')
  .option('--multiplier <x>', 'Glyde or Crash target multiplier')
  .option('--out-range <range>', 'Gimboz Smash outside range to exclude from the winning set (for example 45-50)')
  .option('--picks <picks>', 'Keno pick count', '5')
  .option('--numbers <numbers>', 'Keno numbers (comma-separated single token, or "random")')
  .addOption(new Option('--balls <balls>', 'Deprecated: use --split').hideHelp())
  .addOption(new Option('--games <games>', 'Deprecated: use --split').hideHelp())
  .addOption(new Option('--runs <runs>', 'Deprecated: use --split or --survive').hideHelp())
  .addOption(new Option('--rolls <rolls>', 'Deprecated: use --survive').hideHelp())
  .option('--timeout <ms>', 'Max wait for result (0 = no wait)', '0')
  .option('--x-gameId <uint256>', 'Expert: override generated gameId in gameData')
  .option('--x-ref <address>', 'Expert: override referral address in gameData')
  .option('--x-userRandomWord <bytes32>', 'Expert: override generated userRandomWord in gameData')
  .option('--resilient', 'Retry transient network/RPC failures with conservative backoff')
  .option('--no-resilient', 'Disable inherited resilient retry mode')
  .option('--gp-ape <points>', 'Override GP earned per APE for this run')
  .addHelpText('after', formatBetHelpAppendix())
  .action(async (opts) => {
    const gameEntry = resolveGame(opts.game);
    const rawCliArgs = process.argv.slice(2);
    if (rejectResilientValueOption(rawCliArgs, { json: true })) {
      return;
    }
    const attemptOptionUsageError = getAttemptOptionUsageError({ gameEntry, rawArgs: rawCliArgs, opts });
    if (attemptOptionUsageError) {
      console.error(JSON.stringify({ error: attemptOptionUsageError }));
      process.exit(1);
    }
    const explicitGimbozRange = rawArgsIncludeOption(rawCliArgs, '--range') ? opts.range : undefined;
    const explicitGimbozCover = rawArgsIncludeOption(rawCliArgs, '--cover') ? opts.cover : undefined;
    if (gameEntry?.type === 'gimbozsmash' && (explicitGimbozRange !== undefined || opts.outRange !== undefined || explicitGimbozCover !== undefined)) {
      try {
        parseGimbozSmashInput({
          range: explicitGimbozRange,
          outRange: opts.outRange,
          cover: explicitGimbozCover,
        });
      } catch (error) {
        console.error(JSON.stringify({ error: sanitizeError(error) }));
        process.exit(1);
      }
    }

    if (gameEntry?.type === 'speedcrash' && opts.multiplier !== undefined) {
      try {
        const multiplierBasisPoints = parseGlydeOrCrashTargetMultiplierInput(opts.multiplier);
        opts.multiplier = formatGlydeOrCrashTargetMultiplier(multiplierBasisPoints);
      } catch (error) {
        console.error(JSON.stringify({ error: sanitizeError(error) }));
        process.exit(1);
      }
    }

    const account = await getWalletWithPrompt({ json: true, gameplay: true, forceGameplayPrompt: true });
    const { publicClient } = createClients();
    
    let balance;
    try {
      balance = await getBalanceWithRetry(publicClient, account.address);
    } catch (error) {
      console.error(JSON.stringify({ error: `Failed to fetch balance: ${sanitizeError(error)}` }));
      process.exit(1);
    }
    
    const balanceApe = parseFloat(formatEther(balance));
    const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
    
    if (availableApe <= 0) {
      console.log(JSON.stringify({
        status: 'skipped',
        reason: 'insufficient_balance',
        balance_ape: balanceApe.toFixed(6),
        available_ape: '0.000000',
      }));
      return;
    }
    
    const timeoutMs = parseNonNegativeInt(opts.timeout, 'timeout');
    const profile = loadProfile();
    let gpPerApe;

    try {
      gpPerApe = resolveGpPerApe({ cliGpPerApe: opts.gpApe, profile });
    } catch (error) {
      console.error(JSON.stringify({ error: sanitizeError(error) }));
      process.exit(1);
    }
    
    try {
      const response = await playGame({
        account,
        game: opts.game,
        amountApe: opts.amount,
        risk: opts.risk,
        split: opts.split,
        survive: opts.survive,
        spins: opts.spins,
        bet: opts.bet,
        range: gameEntry?.type === 'apestrong' ? opts.cover : (gameEntry?.type === 'gimbozsmash' ? explicitGimbozRange : undefined),
        cover: gameEntry?.type === 'gimbozsmash' ? explicitGimbozCover : undefined,
        multiplier: opts.multiplier,
        outRange: opts.outRange,
        picks: opts.picks,
        numbers: opts.numbers,
        timeoutMs,
        referral: profile.referral,
        xGameId: opts.xGameId,
        xRef: opts.xRef,
        xUserRandomWord: opts.xUserRandomWord,
        gpPerApe,
        resilient: Boolean(opts.resilient),
      });
      console.log(JSON.stringify(response));
    } catch (error) {
      console.error(JSON.stringify({ error: error.message }));
      process.exit(1);
    }
  });

// ============================================================================
// COMMAND: PLAY (Recommended - auto or manual)
// ============================================================================
program
  .command('play')
  .argument('[game]', 'Game to play (optional)')
  .argument('[amount]', 'Amount to wager (optional)')
  .argument('[config...]', 'Game-specific config (optional)')
  .description('Play a stateless or stateful game (random stateless selection with --auto)')
  .option('--auto [mode]', 'Stateless random selection, or stateful auto-play mode')
  .option('--game <name>', 'Game to play')
  .option('--amount <ape>', 'Amount to wager')
  .option('--risk <risk>', 'Risk level for Bear Dice, Blocks, Plinko, Monkey Match, and Primes')
  .option('--split <count>', 'Independent split attempts for Plinko, Primes, Speed Keno, and slots')
  .option('--survive <count>', 'All-or-nothing survival attempts for Bear Dice and Blocks')
  .option('--spins <count>', 'Slots-only alias for --split')
  .option('--bet <bet>', 'Roulette/Baccarat bet')
  .option('--cover <cover>', 'ApeStrong cover or Gimboz Smash random cover')
  .option('--range <range>', 'Gimboz Smash inside range')
  .option('--multiplier <x>', 'Glyde or Crash target multiplier')
  .option('--out-range <range>', 'Gimboz Smash outside range to exclude from the winning set (for example 45-50)')
  .option('--picks <picks>', 'Keno pick count')
  .option('--numbers <numbers>', 'Keno numbers (comma-separated single token, or "random")')
  .addOption(new Option('--balls <balls>', 'Deprecated: use --split').hideHelp())
  .addOption(new Option('--games <games>', 'Deprecated: use --split').hideHelp())
  .addOption(new Option('--runs <runs>', 'Deprecated: use --split or --survive').hideHelp())
  .addOption(new Option('--rolls <rolls>', 'Deprecated: use --survive').hideHelp())
  .option('--timeout <ms>', 'Max wait for a stateless game result (0 = no wait)', '30000')
  .option('--x-gameId <uint256>', 'Expert: override generated gameId in gameData')
  .option('--x-ref <address>', 'Expert: override referral address in gameData')
  .option('--x-userRandomWord <bytes32>', 'Expert: override generated userRandomWord in gameData')
  .option('--game-id <id>', 'Stateful game ID for resume/action when using play <stateful-game>')
  .option('--display <mode>', 'Stateful display mode: full, simple, json')
  .option('--side <ape>', 'Blackjack player side bet amount')
  .option('--solver-max-states <n>', 'Blackjack best/max EV search state cap (defaults 50000/150000)')
  .option('--solver-timeout-ms <ms>', 'Blackjack best/max EV worker timeout (defaults 5000/30000)')
  .option('--solver [mode]', 'Show solver suggestions in supported stateful games')
  .option('--tile <tile>', 'Cash Dash opening tile: 1-7 or random')
  .option('--cashout-after <rows>', 'Cash Dash auto-play cashes out after N safe rows')
  .option('--strategy <name>', 'conservative | balanced | aggressive | degen')
  .option('--loop', 'Play continuously')
  .option('--resilient', 'Retry transient network/RPC failures with conservative backoff')
  .option('--no-resilient', 'Disable inherited resilient retry mode')
  .option('--delay <seconds>', 'Fixed delay between looped games')
  .addOption(new Option('--human [range]', 'Add humanized random timing (default 3-9s, e.g. 2-17); if --delay is set, it is added on top').hideHelp())
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--take-profit <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--min-profit <ape>', 'Stop when session P&L reaches +this amount or better (use with --loop)')
  .option('--target-x <x>', 'Stop when a single game pays at least this multiplier (use with --loop)')
  .option('--target-profit <ape>', 'Stop when a single game pays at least this much APE (use with --loop)')
  .option('--retrace <ape>', 'Stop when a single game loses at least this much APE (use with --loop)')
  .option('--recover-loss <ape>', 'Arm when net session P&L reaches -<ape>; stop at break-even/profit (use with --loop)')
  .option('--giveback-profit <ape>', 'Arm when net session P&L reaches +<ape>; stop at break-even/loss (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .option('--max-loss <ape>', 'Stop when session P&L reaches -this amount or worse (use with --loop)')
  .option('--bankroll <ape>', 'Alias for --max-loss')
  .option('--bet-strategy <name>', 'Betting strategy: flat, martingale, reverse-martingale, fibonacci, dalembert, bankroll-fraction=<0..1>')
  .option('--max-bet <ape>', 'Maximum bet amount (safety cap for progressive strategies)')
  .option('--min-bet <ape>', 'Minimum bet amount floor for dynamic strategies')
  .option('--gp-ape <points>', 'Override GP earned per APE for this run')
  .option('-v, --verbose', 'Show technical progress logs')
  .option('--json', 'JSON output only')
  .addOption(new Option('--validate-only', 'Validate play arguments without starting a game').hideHelp())
  .addHelpText('after', formatPlayHelpAppendix())
  .action(async (gameArg, amountArg, configArgs, opts) => {
    if (rejectResilientValueOption(process.argv.slice(2), opts)) {
      return;
    }

    const loopMode = Boolean(opts.loop);
    let humanTiming;
    let loopDelaySeconds;
    try {
      humanTiming = normalizeHumanTiming(opts.human);
      loopDelaySeconds = resolveLoopDelaySeconds({
        rawDelay: opts.delay,
        human: humanTiming,
        defaultDelaySeconds: 3,
      });
    } catch (error) {
      const err = { error: error.message };
      if (opts.json) console.error(JSON.stringify(err));
      else console.error(`\n❌ ${err.error}\n`);
      return;
    }
    const playCommand = program.commands.find((command) => command.name() === 'play');
    const hasPositionalInput = Boolean(gameArg || amountArg || (configArgs && configArgs.length > 0));
    const explicitPlayFlags = new Set([
      '--auto',
      '--game',
      '--amount',
      '--risk',
      '--split',
      '--survive',
      '--balls',
      '--spins',
      '--bet',
      '--cover',
      '--range',
      '--multiplier',
      '--out-range',
      '--picks',
      '--numbers',
      '--games',
      '--runs',
      '--rolls',
      '--x-gameId',
      '--x-ref',
      '--x-userRandomWord',
      '--game-id',
      '--display',
      '--side',
      '--solver-max-states',
      '--solver-timeout-ms',
      '--solver',
      '--tile',
      '--cashout-after',
      '--strategy',
      '--loop',
      '--resilient',
      '--no-resilient',
      '--delay',
      '--human',
      '--max-games',
      '--take-profit',
      '--min-profit',
      '--target-x',
      '--target-profit',
      '--retrace',
      '--recover-loss',
      '--giveback-profit',
      '--stop-loss',
      '--max-loss',
      '--bankroll',
      '--bet-strategy',
      '--max-bet',
      '--min-bet',
      '--gp-ape',
    ]);
    const hasExplicitAutoSelectionInput = process.argv.slice(2).some((arg) => explicitPlayFlags.has(arg));

    if (!hasPositionalInput && !hasExplicitAutoSelectionInput) {
      if (opts.json) {
        console.log(JSON.stringify({
          error: `No game selection provided. Use ${BINARY_NAME} play --auto for automatic random play, or pass an explicit game/amount.`,
        }));
      } else if (playCommand) {
        console.log(playCommand.helpInformation());
      }
      return;
    }

    const statefulDispatch = resolveStatefulPlayDispatch({ gameArg, amountArg, configArgs, opts });
    if (statefulDispatch) {
      if (opts.validateOnly) {
        try {
          console.log(JSON.stringify(validateStatefulPlayDispatch(statefulDispatch)));
        } catch (error) {
          failPlayValidation(error);
        }
        return;
      }
      return runStatefulGameCommand(
        statefulDispatch.game.key,
        statefulDispatch.action,
        statefulDispatch.amount,
        statefulDispatch.opts
      );
    }

    // Parse and validate loop parameters
    let targetBalance;
    let minProfit;
    let stopLoss;
    let maxLoss;
    let maxGames;
    let targetX;
    let targetPayoutApe;
    let retrace;
    let recoverLoss;
    let givebackProfit;
    const maxBet = opts.maxBet ? parseFloat(opts.maxBet) : null;
    const minBet = opts.minBet ? parseFloat(opts.minBet) : null;
    let cliGpPerApe = null;
    let playTimeoutMs;

    try {
      ({
        targetBalance,
        minProfit,
        stopLoss,
        maxLoss,
        maxGames,
        targetX,
        targetProfit: targetPayoutApe,
        retrace,
        recoverLoss,
        givebackProfit,
      } = parseLoopTerminalOptions(opts));
      playTimeoutMs = parseNonNegativeInt(opts.timeout, 'timeout');
    } catch (error) {
      console.error(JSON.stringify({ error: error.message }));
      process.exit(1);
    }
    if (opts.maxBet !== undefined && (isNaN(maxBet) || maxBet <= 0)) {
      console.error(JSON.stringify({ error: `Invalid --max-bet value: "${opts.maxBet}". Must be a positive number (e.g., --max-bet 100)` }));
      process.exit(1);
    }
    if (opts.minBet !== undefined && (isNaN(minBet) || minBet <= 0)) {
      console.error(JSON.stringify({ error: `Invalid --min-bet value: "${opts.minBet}". Must be a positive number (e.g., --min-bet 5)` }));
      process.exit(1);
    }
    if (opts.gpApe !== undefined) {
      try {
        cliGpPerApe = normalizeGpPerApe(opts.gpApe);
      } catch (error) {
        console.error(JSON.stringify({ error: sanitizeError(error) }));
        process.exit(1);
      }
    }

    // Betting strategy setup
    const { betStrategyName, betStrategy } = resolveBetStrategyOrExit(opts.betStrategy, { json: true });
    
    let startingBalance = null;
    let gamesPlayed = 0;
    let lastGameResult = null; // Track for betting strategy
    const loopStats = createLoopStats();
    const loopTerminalState = createLoopTerminalState();
    let loopEstimateShown = false;

    const gameInput = gameArg || opts.game;
    let amountInput = amountArg || opts.amount;
    let normalizedConfigArgs = Array.isArray(configArgs) ? [...configArgs] : [];
    
    let fixedGame = null;
    if (gameInput) {
      fixedGame = resolveGame(gameInput);
      if (!fixedGame) {
        console.error(JSON.stringify({ error: `Unknown game: ${gameInput}. Available: ${GAME_LIST}` }));
        process.exit(1);
      }
    }

    if (
      isBankrollFractionStrategy(betStrategy)
      && fixedGame
      && opts.amount === undefined
      && amountArg !== undefined
      && !isPositiveApeToken(amountArg)
    ) {
      amountInput = undefined;
      normalizedConfigArgs = [amountArg, ...normalizedConfigArgs];
    }

    const attemptOptionUsageError = getAttemptOptionUsageError({
      gameEntry: fixedGame,
      rawArgs: process.argv.slice(2),
      opts,
    });
    if (attemptOptionUsageError) {
      console.error(JSON.stringify({ error: attemptOptionUsageError }));
      process.exit(1);
    }

    const betStrategyUsageError = getBetStrategyUsageError(betStrategy, {
      loopMode,
      hasBaseBet: amountInput !== undefined,
      stopLoss,
      maxLoss,
    });
    if (betStrategyUsageError) {
      console.error(JSON.stringify({ error: betStrategyUsageError }));
      process.exit(1);
    }
    
    // Parse positional config args based on game type
    let positionalConfig = {};
    if (fixedGame && normalizedConfigArgs.length > 0) {
      if (fixedGame.type === 'plinko') {
        if (normalizedConfigArgs[0]) positionalConfig.risk = normalizedConfigArgs[0];
        if (normalizedConfigArgs[1]) positionalConfig.balls = parseInt(normalizedConfigArgs[1]);
      } else if (fixedGame.type === 'slots') {
        if (normalizedConfigArgs[0]) positionalConfig.spins = parseInt(normalizedConfigArgs[0]);
      } else if (fixedGame.type === 'roulette' || fixedGame.type === 'baccarat') {
        positionalConfig.bet = normalizedConfigArgs.join(',');
      } else if (fixedGame.type === 'apestrong') {
        if (normalizedConfigArgs[0]) positionalConfig.range = parseInt(normalizedConfigArgs[0]);
      } else if (fixedGame.type === 'speedcrash') {
        if (normalizedConfigArgs[0]) positionalConfig.multiplier = normalizedConfigArgs[0];
      } else if (fixedGame.type === 'gimbozsmash') {
        positionalConfig.range = normalizedConfigArgs.join(',');
      } else if (fixedGame.type === 'keno') {
        // For keno: configArgs can be [picks] or [numbers] or [picks, numbers]
        // If first arg is a small number (1-10), treat as picks; otherwise as numbers
        if (normalizedConfigArgs[0]) {
          const first = normalizedConfigArgs[0];
          const num = parseInt(first);
          if (!isNaN(num) && num >= 1 && num <= 10 && !first.includes(',')) {
            positionalConfig.picks = num;
            if (normalizedConfigArgs[1]) positionalConfig.numbers = normalizedConfigArgs.slice(1).join(',');
          } else {
            // Treat as numbers
            positionalConfig.numbers = normalizedConfigArgs.join(',');
          }
        }
      } else if (fixedGame.type === 'speedkeno') {
        // For speed keno: configArgs can be [games], [games, picks], [games, numbers], etc.
        // First arg (1-20 without comma) = games, second (1-5 without comma) = picks, or numbers with comma
        if (normalizedConfigArgs[0]) {
          const first = normalizedConfigArgs[0];
          const num = parseInt(first);
          if (!isNaN(num) && num >= 1 && num <= 20 && !first.includes(',')) {
            positionalConfig.games = num;
            if (normalizedConfigArgs[1]) {
              const second = normalizedConfigArgs[1];
              const pickNum = parseInt(second);
              if (!isNaN(pickNum) && pickNum >= 1 && pickNum <= 5 && !second.includes(',')) {
                positionalConfig.picks = pickNum;
                if (normalizedConfigArgs[2]) positionalConfig.numbers = normalizedConfigArgs.slice(2).join(',');
              } else {
                positionalConfig.numbers = normalizedConfigArgs.slice(1).join(',');
              }
            }
          } else if (first.includes(',')) {
            // Treat as numbers
            positionalConfig.numbers = normalizedConfigArgs.join(',');
          }
        }
      } else if (fixedGame.type === 'beardice') {
        // For bear dice: configArgs can be [risk] or [risk, rolls]
        if (normalizedConfigArgs[0]) positionalConfig.risk = normalizedConfigArgs[0];
        if (normalizedConfigArgs[1]) positionalConfig.rolls = parseInt(normalizedConfigArgs[1]);
      } else if (fixedGame.type === 'blocks') {
        // For blocks: configArgs can be [risk] or [risk, runs]
        if (normalizedConfigArgs[0]) positionalConfig.risk = normalizedConfigArgs[0];
        if (normalizedConfigArgs[1]) positionalConfig.runs = parseInt(normalizedConfigArgs[1]);
      } else if (fixedGame.type === 'primes') {
        // For primes: configArgs can be [risk] or [risk, runs]
        if (normalizedConfigArgs[0]) positionalConfig.risk = normalizedConfigArgs[0];
        if (normalizedConfigArgs[1]) positionalConfig.runs = parseInt(normalizedConfigArgs[1]);
      } else if (fixedGame.type === 'monkeymatch') {
        // For monkey match: configArgs can be [risk]
        if (normalizedConfigArgs[0]) positionalConfig.risk = normalizedConfigArgs[0];
      }
    }

    if (fixedGame?.type === 'apestrong') {
      const explicitCover = opts.cover ?? positionalConfig.range;
      if (explicitCover !== undefined) {
        try {
          const normalizedCover = ensureIntRange(
            explicitCover,
            'cover',
            fixedGame.config.range.min,
            fixedGame.config.range.max
          );
          positionalConfig.range = normalizedCover;
        } catch (error) {
          console.error(JSON.stringify({ error: sanitizeError(error) }));
          process.exit(1);
        }
      }
    }

    if (fixedGame?.type === 'speedcrash') {
      const explicitMultiplier = opts.multiplier ?? positionalConfig.multiplier;
      if (explicitMultiplier !== undefined) {
        try {
          const multiplierBasisPoints = parseGlydeOrCrashTargetMultiplierInput(explicitMultiplier);
          positionalConfig.multiplier = formatGlydeOrCrashTargetMultiplier(multiplierBasisPoints);
        } catch (error) {
          const message = sanitizeError(error);
          if (opts.json) console.error(JSON.stringify({ error: message }));
          else console.error(`\n❌ ${message}\n`);
          process.exit(1);
        }
      }
    }

    if (fixedGame?.type === 'gimbozsmash') {
      const explicitRange = opts.range ?? positionalConfig.range;
      const explicitOutRange = opts.outRange ?? positionalConfig.outRange;
      const explicitCover = opts.cover ?? positionalConfig.cover;
      if (explicitRange !== undefined || explicitOutRange !== undefined || explicitCover !== undefined) {
        try {
          parseGimbozSmashInput({
            range: explicitRange,
            outRange: explicitOutRange,
            cover: explicitCover,
          });
        } catch (error) {
          const message = sanitizeError(error);
          if (opts.json) console.error(JSON.stringify({ error: message }));
          else console.error(`\n❌ ${message}\n`);
          process.exit(1);
        }
      }
    }

    if (opts.validateOnly) {
      try {
        console.log(JSON.stringify(validateStatelessPlayTarget({
          fixedGame,
          opts,
          positionalConfig,
          amountInput,
          loopMode,
        })));
      } catch (error) {
        failPlayValidation(error);
      }
      return;
    }

    const account = await getWalletWithPrompt({ json: opts.json, gameplay: true });
    const profile = loadProfile(account.address);
    const gpPerApeInfo = resolveGpPerApeInfo({
      cliGpPerApe,
      profile,
    });
    const gpPerApe = gpPerApeInfo.gpPerApe;

    if (profile.paused) {
      const response = { action: 'play', status: 'skipped', reason: 'paused' };
      if (opts.json) console.log(JSON.stringify(response));
      else console.log(JSON.stringify(response, null, 2));
      return;
    }

    if (loopMode && !opts.json) {
      console.log(`${formatGpPerApeNotice({ info: gpPerApeInfo })}\n`);
      const gameInfo = fixedGame ? getGameDisplayName(fixedGame) : 'random games';
      const fixedDelayLabel = loopDelaySeconds > 0
        ? formatDelayMs(Math.round(loopDelaySeconds * 1000))
        : null;
      const humanDelayLabel = humanTiming ? `humanized ${formatHumanDelayRange(humanTiming)} delay` : null;
      const delayLabel = humanTiming
        ? (fixedDelayLabel ? `${fixedDelayLabel} + ${humanDelayLabel}` : humanDelayLabel)
        : `${fixedDelayLabel || '0s'} delay`;
      const strategyInfo = betStrategyName !== 'flat' ? ` | Strategy: ${betStrategyName}` : '';
      const maxBetInfo = maxBet ? ` | Max bet: ${maxBet} APE` : '';
      const minBetInfo = minBet ? ` | Min bet: ${minBet} APE` : '';
      console.log(`\n🔄 Loop mode: ${gameInfo} (${delayLabel}${strategyInfo}${maxBetInfo}${minBetInfo})`);
      if (targetBalance) console.log(`   🎯 Take-profit: ${targetBalance} APE`);
      if (minProfit) console.log(`   💰 Min-profit: ${minProfit} APE session P&L`);
      if (targetX) console.log(`   🎯 Target multiplier: ${targetX}x`);
      if (targetPayoutApe) console.log(`   💰 Target payout: ${targetPayoutApe} APE`);
      if (retrace) console.log(`   📉 Retrace: ${retrace} APE single-game loss`);
      if (recoverLoss) console.log(`   🛟 Recover-loss: ${recoverLoss} APE drawdown`);
      if (givebackProfit) console.log(`   📉 Giveback-profit: ${givebackProfit} APE run-up`);
      if (stopLoss) console.log(`   🛑 Stop-loss: ${stopLoss} APE`);
      if (maxLoss) console.log(`   🛑 Max-loss: ${maxLoss} APE session P&L`);
      if (maxGames) console.log(`   🏁 Max games: ${maxGames}`);
      console.log('─'.repeat(50));
    }

    async function playOnce(betOverride = null) {
      const state = loadState();
      const freshProfile = loadProfile();
      
      if (freshProfile.paused) {
        return {
          shouldStop: true,
          reason: 'paused',
          gameId: null,
          gameResult: null,
          playedGameKey: null,
          playedConfig: null,
          counted: false,
          completed: false,
        };
      }

      const strategy = normalizeStrategy(opts.strategy || freshProfile.persona);
      const strategyConfig = applyProfileOverrides(
        getStrategyConfig(strategy),
        freshProfile.overrides
      );

      const { publicClient } = createClients();
      let balance;
      try {
        balance = await getBalanceWithRetry(publicClient, account.address);
      } catch (error) {
        console.error(JSON.stringify({ error: `Failed to fetch balance: ${sanitizeError(error)}` }));
        return {
          shouldStop: true,
          reason: 'balance_error',
          gameId: null,
          gameResult: null,
          playedGameKey: null,
          playedConfig: null,
          counted: false,
          completed: false,
        };
      }

      const balanceApe = parseFloat(formatEther(balance));
      const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);

      if (stopLoss !== null && balanceApe <= stopLoss) {
        const response = {
          action: 'play',
          status: 'skipped',
          reason: 'stop_loss',
          balance_ape: balanceApe.toFixed(6),
          stop_loss_ape: stopLoss.toFixed(6),
        };
        if (opts.json) console.log(JSON.stringify(response));
        else console.log(JSON.stringify(response, null, 2));
        return {
          shouldStop: true,
          reason: 'stop_loss',
          gameId: null,
          gameResult: null,
          playedGameKey: null,
          playedConfig: null,
          counted: false,
          completed: false,
        };
      }

      if (availableApe <= 0 || availableApe < strategyConfig.minBetApe) {
        const response = {
          action: 'play',
          status: 'skipped',
          reason: 'insufficient_balance',
          balance_ape: balanceApe.toFixed(6),
          available_ape: availableApe.toFixed(6),
        };
        if (opts.json) console.log(JSON.stringify(response));
        else console.log(JSON.stringify(response, null, 2));
        return {
          shouldStop: true,
          reason: 'insufficient_balance',
          gameId: null,
          gameResult: null,
          playedGameKey: null,
          playedConfig: null,
          counted: false,
          completed: false,
        };
      }

      // Determine wager (betOverride from betting strategy takes precedence in loop mode)
      let wagerApe;
      if (betOverride !== null) {
        wagerApe = betOverride;
        // Cap at available balance
        if (wagerApe > availableApe) {
          wagerApe = availableApe;
          if (!opts.json) console.log(`   ⚠️  Bet capped to available balance: ${wagerApe.toFixed(2)} APE`);
        }
      } else if (amountInput) {
        wagerApe = parseFloat(amountInput);
        if (isNaN(wagerApe) || wagerApe <= 0) {
          console.error(JSON.stringify({ error: 'Invalid amount.' }));
          return {
            shouldStop: true,
            reason: 'invalid_amount',
            gameId: null,
            gameResult: null,
            playedGameKey: null,
            playedConfig: null,
            counted: false,
            completed: false,
          };
        }
        if (wagerApe > availableApe) {
          console.error(JSON.stringify({ error: `Insufficient balance. Available: ${availableApe.toFixed(4)} APE` }));
          return {
            shouldStop: true,
            reason: 'insufficient_balance',
            gameId: null,
            gameResult: null,
            playedGameKey: null,
            playedConfig: null,
            counted: false,
            completed: false,
          };
        }
      } else {
        wagerApe = calculateWager(availableApe, strategyConfig);
      }

      // Determine game and config
      let gameEntry;
      let gameConfig = {};
      const preferGameDefault = Boolean(fixedGame && !loopMode);
      try {
        if (fixedGame) {
          gameEntry = fixedGame;
          const getConfig = configGetters[gameEntry.type];
          gameConfig = getConfig
            ? getConfig(
                opts,
                positionalConfig,
                gameEntry,
                strategyConfig,
                randomIntInclusive,
                { preferGameDefault }
              )
            : { ...positionalConfig };
        } else {
          const selection = selectGameAndConfig(strategyConfig);
          gameEntry = resolveGame(selection.game);
          gameConfig = {
            mode: selection.mode,
            split: selection.split
              ?? (gameEntry?.type === 'plinko' ? selection.balls : undefined)
              ?? (gameEntry?.type === 'slots' ? selection.spins : undefined)
              ?? (gameEntry?.type === 'speedkeno' ? selection.games : undefined)
              ?? (gameEntry?.type === 'primes' ? selection.runs : undefined),
            survive: selection.survive
              ?? (gameEntry?.type === 'beardice' ? selection.rolls : undefined)
              ?? (gameEntry?.type === 'blocks' ? selection.runs : undefined),
            bet: selection.bet,
            range: selection.range,
            multiplier: selection.multiplier,
            difficulty: selection.difficulty,
          };
        }

        // Apply CLI opts/positional/strategy defaults for loop/auto flows.
        if (!preferGameDefault && gameEntry.type === 'plinko') {
          if (opts.risk !== undefined) gameConfig.mode = parseGameConfigValue(gameEntry, 'mode', opts.risk, { numericKind: 'public' });
          else if (positionalConfig.risk !== undefined) gameConfig.mode = parseGameConfigValue(gameEntry, 'mode', positionalConfig.risk, { numericKind: 'public' });
          else if (gameConfig.mode === undefined) gameConfig.mode = gameEntry.config.mode.default;
          if (opts.split !== undefined) gameConfig.split = parseInt(opts.split, 10);
          else if (positionalConfig.balls !== undefined) gameConfig.split = positionalConfig.balls;
          else if (gameConfig.split === undefined) {
            const [min, max] = clampRange(
              strategyConfig.plinko?.balls?.[0] ?? gameEntry.config.balls.default,
              strategyConfig.plinko?.balls?.[1] ?? gameEntry.config.balls.default,
              gameEntry.config.balls.min,
              gameEntry.config.balls.max
            );
            gameConfig.split = randomIntInclusive(min, max);
          }
        } else if (!preferGameDefault && gameEntry.type === 'slots') {
          if (gameConfig.split === undefined) {
            gameConfig = {
              ...gameConfig,
              ...resolveSlotsConfig({
                opts,
                positionalConfig,
                strategyConfig,
                randomIntInclusive,
                gameEntry,
                preferGameDefault: Boolean(fixedGame && !loopMode),
              }),
            };
          }
        } else if (!preferGameDefault && gameEntry.type === 'roulette') {
          if (opts.bet) gameConfig.bet = opts.bet;
          else if (positionalConfig.bet) gameConfig.bet = positionalConfig.bet;
          else if (!gameConfig.bet) {
            const cfg = strategyConfig.roulette || { defaultBet: 'random' };
            gameConfig.bet = cfg.defaultBet === 'random' ? (Math.random() < 0.5 ? 'RED' : 'BLACK') : cfg.defaultBet;
          }
        } else if (!preferGameDefault && gameEntry.type === 'baccarat') {
          if (opts.bet) gameConfig.bet = opts.bet;
          else if (positionalConfig.bet) gameConfig.bet = positionalConfig.bet;
          else if (!gameConfig.bet) {
            const cfg = strategyConfig.baccarat || { defaultBet: 'random' };
            gameConfig.bet = cfg.defaultBet === 'random' ? (Math.random() < 0.5 ? 'PLAYER' : 'BANKER') : cfg.defaultBet;
          }
        } else if (!preferGameDefault && gameEntry.type === 'apestrong') {
          if (opts.cover !== undefined) gameConfig.range = parseInt(opts.cover, 10);
          else if (positionalConfig.range !== undefined) gameConfig.range = positionalConfig.range;
          else if (gameConfig.range === undefined) {
            const [min, max] = strategyConfig.apestrong?.range || [40, 60];
            gameConfig.range = randomIntInclusive(min, max);
          }
        } else if (!preferGameDefault && gameEntry.type === 'speedcrash') {
          const getConfig = configGetters[gameEntry.type];
          gameConfig = getConfig
            ? getConfig(
                opts,
                positionalConfig,
                gameEntry,
                strategyConfig,
                randomIntInclusive,
                { preferGameDefault: false }
              )
            : gameConfig;
        } else if (!preferGameDefault && gameEntry.type === 'gimbozsmash') {
          if (
            opts.cover !== undefined
            || opts.range !== undefined
            || opts.outRange !== undefined
            || positionalConfig.range !== undefined
            || positionalConfig.cover !== undefined
            || positionalConfig.outRange !== undefined
            || gameConfig.targets === undefined
          ) {
            const getConfig = configGetters[gameEntry.type];
            gameConfig = getConfig
              ? getConfig(
                  opts,
                  positionalConfig,
                  gameEntry,
                  strategyConfig,
                  randomIntInclusive,
                  { preferGameDefault: false }
                )
              : gameConfig;
          }
        } else if (!preferGameDefault && gameEntry.type === 'keno') {
          if (opts.numbers) gameConfig.numbers = opts.numbers;
          else if (positionalConfig.numbers) gameConfig.numbers = positionalConfig.numbers;
          if (gameConfig.numbers && gameConfig.numbers.toLowerCase() !== 'random') {
            gameConfig.picks = gameConfig.numbers.split(',').filter(s => s.trim()).length;
          } else if (opts.picks !== undefined) {
            gameConfig.picks = parseInt(opts.picks);
          } else if (positionalConfig.picks !== undefined) {
            gameConfig.picks = positionalConfig.picks;
          } else if (gameConfig.picks === undefined) {
            const [min, max] = strategyConfig.keno?.picks || [3, 6];
            gameConfig.picks = randomIntInclusive(min, max);
          }
        } else if (!preferGameDefault && gameEntry.type === 'speedkeno') {
          if (opts.split !== undefined) gameConfig.split = parseInt(opts.split, 10);
          else if (positionalConfig.games !== undefined) gameConfig.split = positionalConfig.games;
          else if (gameConfig.split === undefined) {
            const [min, max] = strategyConfig.speedKeno?.games || [5, 10];
            gameConfig.split = randomIntInclusive(min, max);
          }
          if (opts.numbers) gameConfig.numbers = opts.numbers;
          else if (positionalConfig.numbers) gameConfig.numbers = positionalConfig.numbers;
          if (gameConfig.numbers && gameConfig.numbers.toLowerCase() !== 'random') {
            gameConfig.picks = gameConfig.numbers.split(',').filter(s => s.trim()).length;
          } else if (opts.picks !== undefined) {
            gameConfig.picks = parseInt(opts.picks);
          } else if (positionalConfig.picks !== undefined) {
            gameConfig.picks = positionalConfig.picks;
          } else if (gameConfig.picks === undefined) {
            const [min, max] = strategyConfig.speedKeno?.picks || [2, 4];
            gameConfig.picks = randomIntInclusive(min, max);
          }
        } else if (!preferGameDefault && gameEntry.type === 'beardice') {
          gameConfig = resolveBearDiceConfig(
            gameConfig,
            opts,
            positionalConfig,
            strategyConfig,
            randomIntInclusive,
            { gameEntry }
          );
        } else if (!preferGameDefault && gameEntry.type === 'monkeymatch') {
          if (opts.risk !== undefined) gameConfig.mode = parseGameConfigValue(gameEntry, 'mode', opts.risk, { numericKind: 'public' });
          else if (positionalConfig.risk !== undefined) gameConfig.mode = parseGameConfigValue(gameEntry, 'mode', positionalConfig.risk, { numericKind: 'public' });
          else if (gameConfig.mode === undefined) gameConfig.mode = gameEntry.config.mode.default;
        } else if (!preferGameDefault && gameEntry.type === 'blocks') {
          if (opts.risk !== undefined) gameConfig.mode = parseGameConfigValue(gameEntry, 'mode', opts.risk, { numericKind: 'public' });
          else if (positionalConfig.risk !== undefined) gameConfig.mode = parseGameConfigValue(gameEntry, 'mode', positionalConfig.risk, { numericKind: 'public' });
          else if (gameConfig.mode === undefined) gameConfig.mode = gameEntry.config.mode.default;

          if (opts.survive !== undefined) gameConfig.survive = parseInt(opts.survive, 10);
          else if (positionalConfig.runs !== undefined) gameConfig.survive = positionalConfig.runs;
          else if (gameConfig.survive === undefined) {
            const [min, max] = clampRange(
              strategyConfig.blocks?.runs?.[0] ?? gameEntry.config.runs.default,
              strategyConfig.blocks?.runs?.[1] ?? gameEntry.config.runs.default,
              gameEntry.config.runs.min,
              gameEntry.config.runs.max
            );
            gameConfig.survive = randomIntInclusive(min, max);
          }
        } else if (!preferGameDefault && gameEntry.type === 'primes') {
          if (opts.risk !== undefined) gameConfig.difficulty = parseGameConfigValue(gameEntry, 'difficulty', opts.risk, { numericKind: 'public' });
          else if (positionalConfig.risk !== undefined) gameConfig.difficulty = parseGameConfigValue(gameEntry, 'difficulty', positionalConfig.risk, { numericKind: 'public' });
          else if (gameConfig.difficulty === undefined) gameConfig.difficulty = gameEntry.config.difficulty.default;

          if (opts.split !== undefined) gameConfig.split = parseInt(opts.split, 10);
          else if (positionalConfig.runs !== undefined) gameConfig.split = positionalConfig.runs;
          else if (gameConfig.split === undefined) {
            const [min, max] = clampRange(
              strategyConfig.primes?.runs?.[0] ?? gameEntry.config.runs.default,
              strategyConfig.primes?.runs?.[1] ?? gameEntry.config.runs.default,
              gameEntry.config.runs.min,
              gameEntry.config.runs.max
            );
            gameConfig.split = randomIntInclusive(min, max);
          }
        }
      } catch (error) {
        const message = sanitizeError(error);
        if (opts.json) console.error(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        return {
          shouldStop: true,
          reason: 'invalid_config',
          completed: false,
          counted: false,
          gameId: null,
          gameResult: null,
          error: false,
          playedGameKey: null,
          playedConfig: null,
        };
      }

      const wagerApeString = formatApeAmount(wagerApe);

      // Build description for human output
      let gameDesc = getGameDisplayName(gameEntry);
      if (gameEntry.type === 'plinko') {
        const riskLabel = getGameOptionLabel(gameEntry, 'mode', gameConfig.mode, `Risk ${gameConfig.mode}`);
        gameDesc += ` (${riskLabel}, ${gameConfig.split} split)`;
      } else if (gameEntry.type === 'slots') {
        gameDesc += ` (${gameConfig.split} split)`;
      } else if (gameEntry.type === 'roulette' || gameEntry.type === 'baccarat') {
        gameDesc += ` — ${gameConfig.bet}`;
      } else if (gameEntry.type === 'apestrong') {
        gameDesc += ` (${gameConfig.range}% chance)`;
      } else if (gameEntry.type === 'speedcrash') {
        gameDesc += ` (${gameConfig.multiplier})`;
      } else if (gameEntry.type === 'gimbozsmash') {
        gameDesc += gameConfig.outRange ? ` (outside ${gameConfig.outRange})` : ` (${gameConfig.targets})`;
      } else if (gameEntry.type === 'keno') {
        gameDesc += ` (${gameConfig.picks} picks)`;
      } else if (gameEntry.type === 'speedkeno') {
        gameDesc += ` (${gameConfig.split} split, ${gameConfig.picks} picks)`;
      } else if (gameEntry.type === 'beardice') {
        const riskLabel = getGameOptionLabel(gameEntry, 'difficulty', gameConfig.difficulty, 'Easy');
        gameDesc += ` (${riskLabel}, ${gameConfig.survive} survive)`;
      } else if (gameEntry.type === 'monkeymatch') {
        const riskLabel = getGameOptionLabel(gameEntry, 'mode', gameConfig.mode, 'Low');
        gameDesc += ` (${riskLabel})`;
      } else if (gameEntry.type === 'blocks') {
        const riskLabel = getGameOptionLabel(gameEntry, 'mode', gameConfig.mode, 'Low');
        gameDesc += ` (${riskLabel}, ${gameConfig.survive} survive)`;
      } else if (gameEntry.type === 'primes') {
        const riskLabel = getGameOptionLabel(gameEntry, 'difficulty', gameConfig.difficulty, 'Easy');
        gameDesc += ` (${riskLabel}, ${gameConfig.split} split)`;
      }

      // Human-friendly output: show what we're playing
      if (loopMode && fixedGame && !opts.json && !loopEstimateShown) {
        try {
          const vrfFeeApe = await getConfiguredGameVrfFeeApe({
            publicClient,
            gameEntry,
            config: gameConfig,
          });
          const sessionStopLossApe = maxLoss !== null ? Math.max(balanceApe - maxLoss, 0) : null;
          const estimateStopLossApe = stopLoss !== null && sessionStopLossApe !== null
            ? Math.max(stopLoss, sessionStopLossApe)
            : (stopLoss ?? sessionStopLossApe);
          const estimateLine = formatLoopRunoutEstimate(
            estimateConfiguredGameLoopRunout({
              balanceApe,
              availableApe,
              stopLossApe: estimateStopLossApe,
              gameEntry,
              wagerApe,
              config: gameConfig,
              vrfFeeApe,
            })
          );

          loopEstimateShown = true;
          const promptText = estimateLine ? `\n${estimateLine}. Proceed? (Y/n) ` : '\nProceed? (Y/n) ';
          const answer = await prompt(promptText);
          if (answer.trim().toLowerCase() === 'n') {
            console.log('\nLoop cancelled.\n');
            return { shouldStop: true, reason: 'cancelled', gameResult: null, error: false, playedGameKey: null, playedConfig: null, counted: false };
          }
        } catch {
          loopEstimateShown = true;
          const answer = await prompt('\nProceed? (Y/n) ');
          if (answer.trim().toLowerCase() === 'n') {
            console.log('\nLoop cancelled.\n');
            return { shouldStop: true, reason: 'cancelled', gameResult: null, error: false, playedGameKey: null, playedConfig: null, counted: false };
          }
        }
      }

      if (!opts.json) {
        if (!loopMode) {
          console.log(`${formatGpPerApeNotice({ info: gpPerApeInfo })}\n`);
          console.log(formatBalanceSnapshot({
            label: 'Balance before game',
            currentBalanceApe: balanceApe,
          }));
        }
        console.log(`\n🎰 ${gameDesc}`);
        console.log(`   Betting ${parseFloat(wagerApeString).toFixed(2)} APE\n`);
        if (gameEntry.type === 'beardice') {
          console.log('   All-or-nothing: the first losing sum ends the game and zeroes the payout.');
          console.log('   There is no cash-out or keep-the-current-payout option in the live contract.\n');
        }
      }

      try {
        const playResponse = await playGame({
          account,
          game: gameEntry.key,
          amountApe: wagerApeString,
          risk: gameConfig.risk,
          mode: gameConfig.mode,
          split: gameConfig.split
            ?? (gameEntry.type === 'plinko' ? gameConfig.balls : undefined)
            ?? (gameEntry.type === 'slots' ? gameConfig.spins : undefined)
            ?? (gameEntry.type === 'speedkeno' ? gameConfig.games : undefined)
            ?? (gameEntry.type === 'primes' ? gameConfig.runs : undefined),
          survive: gameConfig.survive
            ?? (gameEntry.type === 'beardice' ? gameConfig.rolls : undefined)
            ?? (gameEntry.type === 'blocks' ? gameConfig.runs : undefined),
          spins: gameEntry.type === 'slots' ? gameConfig.spins : undefined,
          bet: gameConfig.bet,
          range: gameEntry.type === 'gimbozsmash'
            ? (gameConfig.outRange ? undefined : gameConfig.targets)
            : gameConfig.range,
          multiplier: gameConfig.multiplier,
          targets: gameEntry.type === 'gimbozsmash' ? undefined : gameConfig.targets,
          outRange: gameConfig.outRange,
          picks: gameConfig.picks,
          numbers: gameConfig.numbers,
          difficulty: gameConfig.difficulty,
          timeoutMs: playTimeoutMs,
          referral: freshProfile.referral,
          xGameId: opts.xGameId,
          xRef: opts.xRef,
          xUserRandomWord: opts.xUserRandomWord,
          gpPerApe,
          resilient: Boolean(opts.resilient),
        });

        // Update state based on result
        state.lastPlay = Date.now();
        
        const hasResult = playResponse?.result?.payout_wei !== undefined;
        let won = false;
        let pnlApe = 0;
        
        if (hasResult) {
          const pnlWei = BigInt(playResponse.result.payout_wei) - BigInt(playResponse.result.buy_in_wei);
          pnlApe = parseFloat(formatEther(pnlWei));
          won = pnlWei > 0n;
          
          // Update session state
          if (won) {
            state.sessionWins += 1;
            state.consecutiveWins += 1;
            state.consecutiveLosses = 0;
          } else {
            state.sessionLosses += 1;
            state.consecutiveLosses += 1;
            state.consecutiveWins = 0;
          }
          state.totalPnLWei = addBigIntStrings(state.totalPnLWei, pnlWei.toString());
        }
        saveState(state);

        let jsonPayload = null;

        // Output
        if (opts.json) {
          // Full JSON for agents/scripts
          jsonPayload = {
            status: playResponse.status,
            game: gameEntry.key,
            tx: playResponse.tx,
            game_url: playResponse.game_url,
            wager_ape: wagerApeString,
            config: playResponse.config,
            result: playResponse.result ? {
              payout_ape: playResponse.result.payout_ape,
              won,
              pnl_ape: pnlApe.toFixed(6),
              details: playResponse.result.details || null,
            } : null,
          };
          console.log(JSON.stringify(jsonPayload));
          if (hasResult && won) {
            queueWinChimeFromWei({
              payoutWei: playResponse.result.payout_wei,
              wagerWei: playResponse.result.buy_in_wei,
              isJson: true,
            });
          }
        } else {
          // Human-friendly output
          if (hasResult) {
            const payoutApe = parseFloat(playResponse.result.payout_ape);
            const wagerApeNum = parseFloat(wagerApeString);
            const outcomeIcon = formatOutcomeIcon(pnlApe);
            const outcomeLabel = pnlApe > 0
              ? theme.win('WON!')
              : pnlApe < 0
                ? theme.loss('LOST')
                : theme.push('PUSH');
            const outcomeLine = `${outcomeIcon} ${outcomeLabel} ${theme.amount(`${wagerApeNum.toFixed(2)} APE`)} → ${theme.balance(`${payoutApe.toFixed(2)} APE`)} ${formatNetProfitLabel(pnlApe, 2)}`;
            const detailLines = playResponse.game === 'beardice'
              ? formatBearDiceResultLines(playResponse.result.details)
              : (playResponse.game === 'glyde-or-crash'
                  ? formatGlydeOrCrashResultLines(playResponse.result.details)
                  : []);

            console.log(outcomeLine);
            for (const line of detailLines) {
              console.log(line);
            }
            console.log('');
            if (won) {
              queueWinChimeFromWei({
                payoutWei: playResponse.result.payout_wei,
                wagerWei: playResponse.result.buy_in_wei,
                isJson: false,
              });
            }
          } else {
            // Result pending (rare - if event didn't fire in time)
            console.log(`${theme.pending('⏳ Pending')} — watch result: ${theme.command(playResponse.game_url)}\n`);
          }
        }

        if (!loopMode && !opts.json) {
          try {
            const endingBalance = await getBalanceWithRetry(publicClient, account.address);
            const endingBalanceApe = parseFloat(formatEther(endingBalance));
            console.log(formatBalanceSnapshot({
              label: 'Balance after game',
              currentBalanceApe: endingBalanceApe,
              startingBalanceApe: balanceApe,
            }));
            console.log('');
          } catch (balanceError) {
            console.error(`   ⚠️  Failed to fetch final balance: ${sanitizeError(balanceError)}`);
          }
        }

        // Return game result for betting strategy
        const gameResult = hasResult ? {
          won,
          bet: parseFloat(wagerApeString),
          payout: parseFloat(playResponse.result.payout_ape),
          exactPayout: true,
        } : null;
        
        return {
          shouldStop: false,
          completed: hasResult,
          gameId: playResponse.gameId,
          gameResult,
          error: false,
          playedGameKey: gameEntry.key,
          playedConfig: playResponse.config ? { ...playResponse.config } : { ...gameConfig },
          jsonPayload,
        };
      } catch (error) {
        if (opts.json) {
          console.error(JSON.stringify({ error: error.message }));
        } else {
          console.error(`\n❌ Error: ${error.message}\n`);
        }
        // Return error indicator - let loop decide whether to stop
        return {
          shouldStop: false,
          reason: 'error',
          completed: false,
          counted: false,
          gameId: null,
          gameResult: null,
          error: true,
          playedGameKey: null,
          playedConfig: null,
        };
      }
    }

    // Execute
    if (loopMode) {
      // Initialize betting strategy
      const baseBet = amountInput ? parseFloat(amountInput) : 10; // Default base bet
      let betStrategyState = betStrategy.init(baseBet, { maxBet, minBet, fraction: betStrategy.fraction });
      
      // Track consecutive errors - stop loop after 3 in a row
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 3;
      let lastPlayedGameKey = fixedGame?.key || null;
      let lastPlayedConfig = fixedGame ? { ...positionalConfig } : null;
      const loopGamePayloads = [];
      
      while (true) {
        // Check balance for target/stop-loss
        const { publicClient } = createClients();
        const balance = await getBalanceWithRetry(publicClient, account.address);
        const balanceApe = parseFloat(formatEther(balance));
        const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
        
        // Track starting balance and validate parameters on first iteration
        if (startingBalance === null) {
          startingBalance = balanceApe;
          const derivedLossControls = deriveLoopLossControls({
            stopLoss,
            maxLoss,
            startingBalanceApe: startingBalance,
          });
          stopLoss = derivedLossControls.stopLoss;
          maxLoss = derivedLossControls.maxLoss;

          const bankrollFractionRuntimeError = getBankrollFractionRuntimeError(betStrategy, { maxLoss });
          if (bankrollFractionRuntimeError) {
            console.error(JSON.stringify({ error: bankrollFractionRuntimeError }));
            process.exit(1);
          }

          if (!opts.json) {
            const notice = formatDerivedLoopLossNotice(derivedLossControls);
            if (notice) console.log(`   ${notice}`);
          }
          
          // Validate target is achievable (higher than current balance)
          if (targetBalance !== null && targetBalance <= balanceApe) {
            console.log(`\n⚠️  Take-profit (${targetBalance} APE) is already reached! Current balance: ${balanceApe.toFixed(2)} APE`);
            console.log(`   Use a higher take-profit or omit --take-profit to play without one.\n`);
            break;
          }
          
          // Validate stop-loss makes sense (lower than current balance)
          if (stopLoss !== null && stopLoss >= balanceApe) {
            console.log(`\n⚠️  Stop-loss (${stopLoss} APE) is at or above current balance (${balanceApe.toFixed(2)} APE)!`);
            console.log(`   Use a lower stop-loss value.\n`);
            break;
          }
          
          // Warn if max-bet is very low compared to base bet
          if (maxBet !== null && amountInput && maxBet < parseFloat(amountInput)) {
            console.log(`\n⚠️  Warning: --max-bet (${maxBet}) is less than your base bet (${amountInput}).`);
            console.log(`   Bets will be capped to ${maxBet} APE.\n`);
          }
        }
        
        const preGameTerminalCondition = getBalanceLoopTerminalCondition({
          currentBalanceApe: balanceApe,
          startingBalanceApe: startingBalance,
          targetBalance,
          minProfit,
          stopLoss,
          maxLoss,
          maxGames,
          recoverLoss,
          givebackProfit,
          gamesPlayed,
          state: loopTerminalState,
        });
        if (preGameTerminalCondition) {
          console.log('');
          console.log(formatLoopTerminalConditionMessage(preGameTerminalCondition, {
            currentBalanceApe: balanceApe,
            startingBalanceApe: startingBalance,
            gamesPlayed,
          }));
          console.log('');
          break;
        }
        
        // Calculate next bet using betting strategy
        const bankrollRemainingApe = getRemainingBankrollApe({
          currentBalanceApe: balanceApe,
          startingBalanceApe: startingBalance,
          maxLoss,
        });
        const { bet: nextBet, state: newState, capped } = calculateNextBet(
          betStrategy, betStrategyState, lastGameResult, 
          { maxBet, minBet, availableBalance: availableApe, bankrollRemainingApe }
        );
        betStrategyState = newState;
        
        // Show bet info for progressive strategies
        if (!opts.json && betStrategyName !== 'flat') {
          const betInfo = capped ? ` (capped from ${betStrategyState.currentBet?.toFixed(2) || nextBet.toFixed(2)})` : '';
          console.log(`   📊 ${betStrategyName}: betting ${nextBet.toFixed(2)} APE${betInfo}`);
        }
        
        const result = await playOnce(nextBet);
        if (result.counted !== false) {
          gamesPlayed++;
        }

        if (opts.json && result.completed && result.jsonPayload) {
          loopGamePayloads.push({
            game_n: gamesPlayed,
            ...result.jsonPayload,
          });
        }

        if (result.playedGameKey) {
          lastPlayedGameKey = result.playedGameKey;
          lastPlayedConfig = result.playedConfig || null;
        }
        
        // Track result for betting strategy
        if (result.gameResult) {
          lastGameResult = result.gameResult;
          recordLoopGame(loopStats, {
            won: result.gameResult.won,
            wageredApe: result.gameResult.bet,
            payoutApe: result.gameResult.payout,
            rtpGame: result.playedGameKey || lastPlayedGameKey,
            rtpConfig: result.playedConfig || lastPlayedConfig,
          });
          consecutiveErrors = 0; // Reset on success
        }
        
        // Handle errors with consecutive tracking
        if (result.error) {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            if (!opts.json) {
              console.log(`\n🛑 Stopping: ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
              console.log(`   Games played: ${gamesPlayed}\n`);
            }
            break;
          }
          if (!opts.json) {
            console.log(`   ⚠️  Retrying next game in 5s (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS} consecutive errors)...\n`);
          }
          await sleep(5000);
          continue;
        }
        
        if (result.shouldStop) break;

        if (!opts.json && result.completed) {
          console.log('');
          console.log(formatLoopGameCompletion({
            currentGame: gamesPlayed,
            maxGames,
            gameId: result.gameId,
          }));
          console.log('');
        }

        const singleGameTerminalCondition = getSingleGameLoopTerminalCondition({
          gameResult: lastGameResult,
          targetX,
          targetProfit: targetPayoutApe,
          retrace,
        });
        const { publicClient: pc } = createClients();
        const currentBal = await getBalanceWithRetry(pc, account.address);
        const currentApe = parseFloat(formatEther(currentBal));
        const sessionTerminalCondition = getBalanceLoopTerminalCondition({
          currentBalanceApe: currentApe,
          startingBalanceApe: startingBalance,
          targetBalance,
          minProfit,
          stopLoss,
          maxLoss,
          maxGames,
          recoverLoss,
          givebackProfit,
          gamesPlayed,
          state: loopTerminalState,
        });

        // Show balance and countdown before next game
        if (!opts.json) {
          const nextDelayMs = getLoopDelayMs({ delaySeconds: loopDelaySeconds, human: humanTiming });
          const terminalConditionReached = singleGameTerminalCondition || sessionTerminalCondition;
          console.log('');
          console.log(formatLoopProgress({
            currentBalanceApe: currentApe,
            startingBalanceApe: startingBalance,
            stats: loopStats,
            rtpGame: lastPlayedGameKey,
            rtpConfig: lastPlayedConfig,
            gpPerApe,
            nextDelayLabel: terminalConditionReached ? null : formatDelayMs(nextDelayMs),
          }));
          if (singleGameTerminalCondition) {
            console.log('');
            console.log(formatLoopTerminalConditionMessage(singleGameTerminalCondition, { gamesPlayed }));
            console.log('');
            break;
          }
          if (sessionTerminalCondition) {
            console.log('');
            console.log(formatLoopTerminalConditionMessage(sessionTerminalCondition, {
              currentBalanceApe: currentApe,
              startingBalanceApe: startingBalance,
              gamesPlayed,
            }));
            console.log('');
            break;
          }
          if (terminalConditionReached) continue;
          await sleep(nextDelayMs);
          continue;
        }
        if (singleGameTerminalCondition || sessionTerminalCondition) break;
        await sleep(getLoopDelayMs({ delaySeconds: loopDelaySeconds, human: humanTiming }));
      }

      if (opts.json) {
        const netResultApe = loopStats.totalPayoutApe - loopStats.totalWageredApe;
        const totalWagerApe = formatApeAmount(loopStats.totalWageredApe);
        const totalPayoutApe = formatApeAmount(loopStats.totalPayoutApe);
        const completedGames = loopStats.completedGames;
        console.log(JSON.stringify({
          status: completedGames > 0 ? 'complete' : 'loop_control_reached',
          loop: true,
          game: lastPlayedGameKey,
          games_played: gamesPlayed,
          completed_games: completedGames,
          total_wager_ape: totalWagerApe,
          total_payout_ape: totalPayoutApe,
          games_detail: loopGamePayloads,
          result: completedGames > 0 ? {
            wager_ape: totalWagerApe,
            payout_ape: totalPayoutApe,
            pnl_ape: formatApeAmount(netResultApe),
            won: netResultApe > 0,
          } : null,
          loop_control: completedGames > 0 ? null : { kind: 'no_completed_loop_games' },
        }));
      }
    } else {
      await playOnce();
    }
  });

// ============================================================================
// COMMAND: BOT (External bot loader)
// ============================================================================
const botCommand = program
  .command('bot [name] [args...]')
  .description('Run an external bot from the configured bots directory')
  .allowUnknownOption(true)
  .helpOption(false)
  .option('-h, --help', 'Show bot loader help, or pass help through to a named bot')
  .option('--list', 'List discovered bots')
  .addOption(new Option('--validate-only', 'Validate bot arguments without running').hideHelp())
  .addHelpText('after', formatBotHelpAppendix())
  .action(async (name, args, opts) => {
    if (opts.help && !name) {
      botCommand.outputHelp();
      return;
    }

    if (opts.list || !name) {
      printBotList();
      return;
    }

    const bot = findBotByCommand(name);
    if (!bot) {
      process.exitCode = 1;
      console.error(`\n❌ Unknown bot: ${name}\n`);
      printBotList();
      return;
    }

    try {
      const rawArgs = Array.isArray(args) ? [...args] : [];
      if (opts.help) {
        rawArgs.push('--help');
      }

      if (rejectResilientValueOption(rawArgs, {
        json: rawArgs.includes('--json'),
      })) {
        return;
      }

      if (opts.validateOnly) {
        try {
          const payload = await validateBotInvocation(bot, rawArgs);
          console.log(JSON.stringify(payload));
        } catch (error) {
          process.exitCode = 1;
          console.error(JSON.stringify({ error: sanitizeError(error) }));
        }
        return;
      }

      const exitCode = await runBot(bot, {
        cliPath,
        rawArgs,
      });
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    } catch (error) {
      process.exitCode = 1;
      console.error(`\n❌ Bot "${bot.command}" failed: ${sanitizeError(error)}\n`);
    }
  });

// ============================================================================
// COMMAND: CONTEST
// ============================================================================
program
  .command('contest [action]')
  .description('Agent contest info and registration')
  .option('--json', 'JSON output')
  .addHelpText('after', formatContestHelpAppendix())
  .action(async (action, opts) => {
    const now = new Date();
    const contestEnded = now >= CONTEST_END_DATE;
    
    // Check if action is 'register'
    if (action === 'register') {
      if (contestEnded) {
        const msg = { error: 'Contest has ended.', endDate: CONTEST_END_DATE.toISOString() };
        if (opts.json) console.log(JSON.stringify(msg));
        else console.log('\n❌ Contest has ended. Registration is closed.\n');
        return;
      }
      
      const account = await getWalletWithPrompt({ json: opts.json });
      const { publicClient, walletClient } = createClients(account);

      // Check if already registered
      let isRegistered;
      try {
        isRegistered = await publicClient.readContract({
          address: CONTEST_REGISTER_CONTRACT,
          abi: REGISTER_AGENT_ABI,
          functionName: 'isRegistered',
          args: [account.address],
        });
      } catch (error) {
        const msg = { error: `Failed to check registration: ${sanitizeError(error)}` };
        if (opts.json) console.log(JSON.stringify(msg));
        else console.error('\n❌ ' + msg.error + '\n');
        return;
      }

      if (isRegistered) {
        const msg = { status: 'already_registered', message: 'You are already registered for the contest!' };
        if (opts.json) console.log(JSON.stringify(msg));
        else console.log('\n✅ You are already registered for the contest!\n');
        return;
      }

      // Check total wagered
      let totalWagered;
      try {
        totalWagered = await publicClient.readContract({
          address: USER_INFO_CONTRACT,
          abi: USER_INFO_ABI,
          functionName: 'getTotalWagered',
          args: [account.address],
        });
      } catch (error) {
        const msg = { error: `Failed to check wager history: ${sanitizeError(error)}` };
        if (opts.json) console.log(JSON.stringify(msg));
        else console.error('\n❌ ' + msg.error + '\n');
        return;
      }

      const totalWageredApe = parseFloat(formatEther(totalWagered));
      if (totalWageredApe >= CONTEST_WAGER_LIMIT) {
        const msg = {
          error: 'Not eligible - wagered too much',
          total_wagered_ape: totalWageredApe.toFixed(2),
          limit_ape: CONTEST_WAGER_LIMIT,
          message: `You have wagered ${totalWageredApe.toFixed(2)} APE. Limit is ${CONTEST_WAGER_LIMIT} APE.`,
        };
        if (opts.json) console.log(JSON.stringify(msg));
        else {
          console.log('\n❌ Not eligible for contest.');
          console.log(`   Total wagered: ${totalWageredApe.toFixed(2)} APE`);
          console.log(`   Limit: ${CONTEST_WAGER_LIMIT} APE`);
          console.log('   (Contest is for new agents only)\n');
        }
        return;
      }

      // Check balance
      let balance;
      try {
        balance = await getBalanceWithRetry(publicClient, account.address);
      } catch (error) {
        const msg = { error: `Failed to fetch balance: ${sanitizeError(error)}` };
        if (opts.json) console.log(JSON.stringify(msg));
        else console.error('\n❌ ' + msg.error + '\n');
        return;
      }

      const balanceApe = parseFloat(formatEther(balance));
      if (balanceApe < CONTEST_ENTRY_FEE + GAS_RESERVE_APE) {
        const msg = {
          error: 'Insufficient balance',
          balance_ape: balanceApe.toFixed(4),
          required_ape: CONTEST_ENTRY_FEE + GAS_RESERVE_APE,
          message: `Need ${CONTEST_ENTRY_FEE} APE + gas. You have ${balanceApe.toFixed(4)} APE.`,
        };
        if (opts.json) console.log(JSON.stringify(msg));
        else {
          console.log('\n❌ Insufficient balance.');
          console.log(`   Need: ${CONTEST_ENTRY_FEE} APE + gas`);
          console.log(`   Have: ${balanceApe.toFixed(4)} APE\n`);
        }
        return;
      }

      // Register!
      if (!opts.json) console.log('\n🎰 Registering for contest...');
      
      try {
        const txHash = await walletClient.writeContract({
          address: CONTEST_REGISTER_CONTRACT,
          abi: REGISTER_AGENT_ABI,
          functionName: 'register',
          value: parseEther(String(CONTEST_ENTRY_FEE)),
        });

        const msg = {
          status: 'registered',
          tx: txHash,
          entry_fee_ape: CONTEST_ENTRY_FEE,
          message: 'Successfully registered for the contest!',
        };
        if (opts.json) console.log(JSON.stringify(msg));
        else {
          console.log('✅ Registered for contest!');
          console.log(`   Entry fee: ${CONTEST_ENTRY_FEE} APE`);
          console.log(`   TX: ${txHash}`);
          console.log('\n   Good luck! 🦍🏆\n');
        }
      } catch (error) {
        const msg = { error: `Registration failed: ${sanitizeError(error)}` };
        if (opts.json) console.log(JSON.stringify(msg));
        else console.error('\n❌ ' + msg.error + '\n');
      }
      return;
    }

    // Default action: show contest info
    if (!walletExists()) {
      if (opts.json) {
        console.log(JSON.stringify({
          contest_active: !contestEnded,
          end_date: CONTEST_END_DATE.toISOString(),
          entry_fee_ape: CONTEST_ENTRY_FEE,
          wager_limit_ape: CONTEST_WAGER_LIMIT,
          wallet: null,
        }));
      } else {
        console.log('\n═══════════════════════════════════════════════════════════════════');
        console.log('  🏆 APE CHURCH AGENT CONTEST');
        console.log('═══════════════════════════════════════════════════════════════════\n');
        if (contestEnded) {
          console.log('  ⏰ Contest has ended.\n');
        } else {
          console.log('  Compete against other agents for prizes!\n');
          console.log(`  Entry Fee:     ${CONTEST_ENTRY_FEE} APE (one-time)`);
          console.log(`  Eligibility:   Must have wagered < ${CONTEST_WAGER_LIMIT} APE total`);
          console.log(`  Ends:          ${CONTEST_END_DATE.toDateString()}\n`);
          console.log(`  Run: ${BINARY_NAME} install  (to set up your agent first)`);
        }
        console.log('═══════════════════════════════════════════════════════════════════\n');
      }
      return;
    }

    const account = await getWalletWithPrompt({ json: opts.json });
    const { publicClient } = createClients();

    // Fetch registration status and wagered amount
    let isRegistered = false;
    let totalWagered = BigInt(0);
    let balance = BigInt(0);

    try {
      [isRegistered, totalWagered, balance] = await Promise.all([
        publicClient.readContract({
          address: CONTEST_REGISTER_CONTRACT,
          abi: REGISTER_AGENT_ABI,
          functionName: 'isRegistered',
          args: [account.address],
        }),
        publicClient.readContract({
          address: USER_INFO_CONTRACT,
          abi: USER_INFO_ABI,
          functionName: 'getTotalWagered',
          args: [account.address],
        }),
        getBalanceWithRetry(publicClient, account.address),
      ]);
    } catch (error) {
      // Continue with defaults if fetch fails
    }

    const totalWageredApe = parseFloat(formatEther(totalWagered));
    const balanceApe = parseFloat(formatEther(balance));
    const isEligible = totalWageredApe < CONTEST_WAGER_LIMIT;
    const canAfford = balanceApe >= CONTEST_ENTRY_FEE + GAS_RESERVE_APE;

    if (opts.json) {
      console.log(JSON.stringify({
        contest_active: !contestEnded,
        end_date: CONTEST_END_DATE.toISOString(),
        entry_fee_ape: CONTEST_ENTRY_FEE,
        wager_limit_ape: CONTEST_WAGER_LIMIT,
        address: account.address,
        registered: isRegistered,
        total_wagered_ape: totalWageredApe.toFixed(2),
        eligible: isEligible,
        balance_ape: balanceApe.toFixed(4),
        can_afford: canAfford,
      }));
      return;
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  🏆 APE CHURCH AGENT CONTEST');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    if (contestEnded) {
      console.log('  ⏰ Contest has ended.\n');
      if (isRegistered) {
        console.log('  ✅ You were registered. Check results at ape.church!\n');
      }
    } else {
      console.log('  Compete against other agents for prizes!\n');
      console.log(`  Entry Fee:     ${CONTEST_ENTRY_FEE} APE (one-time)`);
      console.log(`  Eligibility:   Must have wagered < ${CONTEST_WAGER_LIMIT} APE total`);
      console.log(`  Ends:          ${CONTEST_END_DATE.toDateString()}\n`);
      
      console.log('  YOUR STATUS');
      console.log('  ─────────────────────────────────────────────────────────────────');
      console.log(`  Registered:    ${isRegistered ? '✅ Yes' : 'No'}`);
      console.log(`  Total Wagered: ${totalWageredApe.toFixed(2)} APE`);
      console.log(`  Eligible:      ${isEligible ? '✅ Yes' : '❌ No (wagered too much)'}`);
      console.log(`  Balance:       ${balanceApe.toFixed(4)} APE ${canAfford ? '' : '(need ' + CONTEST_ENTRY_FEE + ' APE)'}`);
      console.log('');

      if (isRegistered) {
        console.log('  🎉 You\'re in! Good luck!\n');
      } else if (!isEligible) {
        console.log('  ❌ Not eligible - wagered too much before registering.\n');
      } else if (!canAfford) {
        console.log(`  ⚠️  Fund your wallet with ${CONTEST_ENTRY_FEE}+ APE to register.\n`);
      } else {
        console.log(`  → Run: ${BINARY_NAME} contest register\n`);
      }
    }
    console.log('═══════════════════════════════════════════════════════════════════\n');
  });

// ============================================================================
// COMMAND: HISTORY
// ============================================================================
program
  .command('history [address]')
  .description('Read cached per-wallet history, recent games, stats, and optional scoreboards')
  .option('--list', 'List wallet addresses with local cached history files')
  .option('--limit <n>', 'Number of recent cached games to show', '10')
  .option('--all', 'Show all cached games instead of the recent slice')
  .option('--ids', 'Show game IDs in history lines and scoreboard tables')
  .option('--stats', 'Show only history stats')
  .option('--breakdown [game]', 'Show history stats split by game, optionally filtered to one game')
  .option('--leaderboard', 'Show weekly wAPE wagered leaderboard')
  .option('--scoreboard', 'Append the wallet scoreboard derived from cached history')
  .option('--url', 'Show scoreboard game URLs in terminal output')
  .option('--offline', 'Read local cache only; skip RPC enrichment and balance reads')
  .option('--refresh', 'Refresh local history from chain before showing it')
  .option('--from-block <n>', 'Start block for --refresh sync or backfill')
  .option('--to-block <n>', 'End block for --refresh sync (default latest)')
  .option('--chunk-size <n>', 'Block range per log query for --refresh sync', DEFAULT_HISTORY_SYNC_CHUNK_SIZE.toString())
  .option('--json', 'JSON output')
  .addHelpText('after', formatHistoryHelpAppendix())
  .action(async (address, opts, command) => {
    if (opts.list) {
      const addresses = listHistoryWalletAddresses();
      const currentAddress = getWalletAddress();
      if (opts.json) {
        console.log(JSON.stringify({
          wallets: addresses,
          current_wallet: currentAddress || null,
        }));
      } else {
        printAddressList('Cached History Wallets', addresses, { currentAddress });
      }
      return;
    }

    const targetAddress = resolveHistoryTargetAddress(address);
    if (!targetAddress) {
      const message = `No wallet address provided and no local wallet found. Use: ${BINARY_NAME} history <address>`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exit(1);
    }

    if (!isAddress(targetAddress)) {
      const message = `Invalid wallet address: ${targetAddress}`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exit(1);
    }

    if (opts.offline && opts.refresh) {
      const message = '--offline cannot be combined with --refresh';
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exit(1);
    }

    let history;
    let refreshResult = null;

    if (opts.refresh) {
      try {
        if (!opts.json) {
          console.log(`\n📥 Refreshing history for ${targetAddress}...\n`);
        }
        refreshResult = await downloadHistoryForCli(targetAddress, opts);
        history = refreshResult.history;
      } catch (error) {
        const message = `Failed to refresh history: ${sanitizeError(error)}`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }
    } else {
      history = loadHistory(targetAddress);
    }

    const historyFilePath = getHistoryFilePath(targetAddress);
    const hasDownloadedHistory = Boolean(history.last_download_on) || history.games.length > 0;
    if (!hasDownloadedHistory) {
      const message = `No downloaded history for this wallet. Run: ${BINARY_NAME} wallet download ${targetAddress}`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.log(`\n${message}\n`);
      return;
    }

    if (opts.leaderboard) {
      const leaderboard = buildHistoryWapeLeaderboard(history);

      if (opts.json) {
        console.log(JSON.stringify({
          wallet: targetAddress.toLowerCase(),
          history_file: historyFilePath,
          meta: {
            version: history.version,
            chain_id: history.chain_id,
            last_synced_block: history.last_synced_block,
            last_download_on: history.last_download_on,
          },
          sync: refreshResult?.sync || null,
          leaderboard,
        }));
      } else {
        console.log(`\n${formatHistoryWapeLeaderboardReport(leaderboard)}\n`);
      }
      return;
    }

    let publicClient = null;
    if (!opts.offline) {
      ({ publicClient } = createClients());
      history = await enrichStoredHistoryVariants(publicClient, history);
    }
    const scoreboard = opts.scoreboard
      ? saveScoresFromHistory(history, targetAddress, {
          updatedOn: new Date().toISOString(),
        })
      : null;
    const scoreboardFilePath = scoreboard ? getScoreFilePath(targetAddress) : null;
    let currentBalances = {
      current_gp_balance_raw: null,
      current_gp_balance_display: null,
      current_wape_balance_wei: null,
      current_wape_balance_ape: null,
    };
    if (publicClient) {
      try {
        currentBalances = await readCurrentHistoryBalances(publicClient, targetAddress);
      } catch {
        currentBalances = {
          current_gp_balance_raw: null,
          current_gp_balance_display: null,
          current_wape_balance_wei: null,
          current_wape_balance_ape: null,
        };
      }
    }

    const stats = summarizeHistoryGames(history, currentBalances);
    const historyBreakdown = summarizeHistoryGamesByGame(history);
    const breakdownSelection = typeof opts.breakdown === 'string'
      ? resolveHistoryBreakdownSelection(opts.breakdown, historyBreakdown)
      : null;
    if (typeof opts.breakdown === 'string' && !breakdownSelection) {
      const message = `Unknown game for --breakdown: ${opts.breakdown}`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exit(1);
    }
    const breakdown = opts.breakdown
      ? filterHistoryBreakdown(historyBreakdown, breakdownSelection)
      : [];
    const localWalletAddress = getWalletAddress();
    const includeActiveGames = Boolean(localWalletAddress)
      && localWalletAddress.toLowerCase() === targetAddress.toLowerCase();
    const activeGames = includeActiveGames ? loadActiveGames(localWalletAddress) : {};
    const unfinishedGames = includeActiveGames ? summarizeUnfinishedGames(activeGames) : [];
    const gameStatus = buildHistoryGameStatusSummary({
      historyBreakdown,
      activeGames,
    });
    const limit = parseInt(opts.limit) || 10;
    const recentGames = selectHistoryGames(history.games, {
      limit,
      all: Boolean(opts.all),
    });
    const scoreboardReferenceMode = resolveScoreboardReferenceMode(command, opts);

    const numberedResults = recentGames.map((result, index) => ({
      ...result,
      game: resolveGameDisplayName({
        gameKey: result.game_key || null,
        contract: result.contract,
        fallbackName: result.game || resolveHistoryGameName(result.contract),
      }),
      settled: result.settled ?? Boolean(result.last_sync_on && typeof result.payout_wei === 'string'),
      historyIndex: index + 1,
    }));

    if (opts.json) {
      console.log(JSON.stringify({
        wallet: targetAddress.toLowerCase(),
        history_file: historyFilePath,
        meta: {
          version: history.version,
          chain_id: history.chain_id,
          last_synced_block: history.last_synced_block,
          last_download_on: history.last_download_on,
        },
        stats,
        breakdown_filter: breakdownSelection ? {
          requested: breakdownSelection.requested,
          game_key: breakdownSelection.gameKey,
          game: breakdownSelection.displayName,
        } : null,
        unfinished_games: unfinishedGames,
        game_stats: gameStatus,
        breakdown,
        scoreboard: scoreboard ? {
          file_path: scoreboardFilePath,
          ...scoreboard,
        } : null,
        sync: refreshResult?.sync || null,
        games: opts.stats ? [] : numberedResults,
      }));
    } else {
      if (!opts.stats) {
        console.log(`\n${formatHeader('Recent Games', '👀')}\n`);
        if (numberedResults.length === 0) {
          console.log('   No saved games.\n');
        } else {
          for (const r of numberedResults) {
            console.log(formatHistoryLine(r, { showIds: opts.ids }));
          }
          console.log('');
        }
        if (includeActiveGames) {
          console.log(formatUnfinishedGamesSection(unfinishedGames));
          console.log('');
        }
      }
      console.log(formatHistoryStatsReport(stats));
      if (scoreboard) {
        console.log('');
        console.log(formatScoreboardReport(scoreboard, { referenceMode: scoreboardReferenceMode }));
      }
      if (!opts.stats && gameStatus.length > 0) {
        console.log('');
        console.log(`${formatHeader('Game Stats', '🎮')}\n`);
        console.log(formatGameStatsTable(gameStatus));
      }
      if (opts.breakdown) {
        console.log('');
        if (breakdown.length === 0 && breakdownSelection) {
          console.log(formatHeader('Breakdown', '🎮'));
          console.log('');
          console.log(`   ${theme.dim(`No saved games for ${breakdownSelection.displayName}.`)}`);
        } else {
          console.log(formatHistoryBreakdownReport(breakdown));
        }
      }
      console.log('');
    }
  });

// ============================================================================
// COMMAND: SCOREBOARD
// ============================================================================
program
  .command('scoreboard [address]')
  .description('Read cached per-wallet scoreboards derived from history')
  .option('--list', 'List wallet addresses with local cached scoreboards or history')
  .option('--ids', 'Show game IDs in the terminal scoreboard tables')
  .option('--url', 'Show game URLs in the terminal scoreboard tables')
  .option('--refresh', 'Refresh local history from chain before showing the scoreboard')
  .option('--from-block <n>', 'Start block for --refresh sync or backfill')
  .option('--to-block <n>', 'End block for --refresh sync (default latest)')
  .option('--chunk-size <n>', 'Block range per log query for --refresh sync', DEFAULT_HISTORY_SYNC_CHUNK_SIZE.toString())
  .option('--json', 'JSON output')
  .addHelpText('after', formatScoreboardHelpAppendix())
  .action(async (address, opts, command) => {
    if (opts.list) {
      const addresses = [...new Set([
        ...listHistoryWalletAddresses(),
        ...listScoreWalletAddresses(),
      ])].sort((left, right) => left.localeCompare(right));
      const currentAddress = getWalletAddress();
      if (opts.json) {
        console.log(JSON.stringify({
          wallets: addresses,
          current_wallet: currentAddress || null,
        }));
      } else {
        printAddressList('Scoreboard Wallets', addresses, { currentAddress });
      }
      return;
    }

    const targetAddress = resolveHistoryTargetAddress(address);
    if (!targetAddress) {
      const message = `No wallet address provided and no local wallet found. Use: ${BINARY_NAME} scoreboard <address>`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exit(1);
    }

    if (!isAddress(targetAddress)) {
      const message = `Invalid wallet address: ${targetAddress}`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exit(1);
    }

    let history;
    let refreshResult = null;

    if (opts.refresh) {
      try {
        if (!opts.json) {
          console.log(`\n📥 Refreshing history for ${targetAddress}...\n`);
        }
        refreshResult = await downloadHistoryForCli(targetAddress, opts);
        history = refreshResult.history;
      } catch (error) {
        const message = `Failed to refresh history: ${sanitizeError(error)}`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }
    } else {
      history = loadHistory(targetAddress);
    }

    const hasDownloadedHistory = Boolean(history.last_download_on) || history.games.length > 0;
    if (!hasDownloadedHistory) {
      const message = `No downloaded history for this wallet. Run: ${BINARY_NAME} wallet download ${targetAddress}`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.log(`\n${message}\n`);
      return;
    }

    const scoreboard = saveScoresFromHistory(history, targetAddress, {
      updatedOn: new Date().toISOString(),
    });
    const scoreboardFilePath = getScoreFilePath(targetAddress);

    if (opts.json) {
      console.log(JSON.stringify({
        wallet: targetAddress.toLowerCase(),
        scoreboard_file: scoreboardFilePath,
        meta: {
          version: scoreboard.version,
          chain_id: scoreboard.chain_id,
          updated_on: scoreboard.updated_on,
          history_last_download_on: scoreboard.history_last_download_on,
        },
        sync: refreshResult?.sync || null,
        highest_multipliers: scoreboard.highest_multipliers,
        biggest_payouts: scoreboard.biggest_payouts,
      }));
      return;
    }

    const lines = [
      '',
      formatHeader('Scoreboard', '🏆'),
      '',
      `   ${theme.label('Wallet:')} ${formatAddress(targetAddress)}`,
      `   ${theme.label('File:')} ${theme.dim(scoreboardFilePath)}`,
    ];

    if (scoreboard.history_last_download_on) {
      lines.push(`   ${theme.label('History Download:')} ${theme.dim(scoreboard.history_last_download_on)}`);
    }

    const scoreboardReferenceMode = resolveScoreboardReferenceMode(command, opts);
    lines.push('', formatScoreboardReport(scoreboard, {
      includeHeader: false,
      referenceMode: scoreboardReferenceMode,
    }), '');
    console.log(lines.join('\n'));
  });

// ============================================================================
// COMMAND: FEES
// ============================================================================
program
  .command('fees [action] [game]')
  .description('Scan or report compact observed fee aggregates by game')
  .option('--wallet <address>', 'Wallet to compare in reports (default current wallet)')
  .option('--from-block <n>', 'Start block for an explicit fee scan range')
  .option('--to-block <n>', 'End block for fee scan range (default latest)')
  .option('--floor-block <n>', 'Oldest block for automatic backfill (default contract deployment block)')
  .option('--chunk-size <n>', 'Block range per fee log query', DEFAULT_FEE_ANALYSIS_CHUNK_SIZE.toString())
  .option('--max-chunks <n>', 'Maximum chunks to scan this run; 0 means unlimited/full backfill', DEFAULT_FEE_ANALYSIS_MAX_CHUNKS.toString())
  .option('--min-games <n>', 'Minimum games for wallet leaderboards in reports', '1')
  .option('--cap-mb <n>', 'Per-game fee log cap in MiB', String(DEFAULT_FEE_ANALYSIS_CAP_BYTES / (1024 * 1024)))
  .option('-y, --yes', 'Skip the unlimited scan confirmation prompt')
  .option('--json', 'JSON output')
  .addHelpText('after', formatFeesHelpAppendix())
  .action(async (action = 'report', game, opts) => {
    const normalizedAction = String(action || 'report').trim().toLowerCase();
    if (!['scan', 'report'].includes(normalizedAction)) {
      const message = `Unknown fees action: ${action}. Available: scan, report`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exit(1);
    }

    if (!game) {
      const message = `Missing game. Use: ${BINARY_NAME} fees ${normalizedAction} <game>`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exit(1);
    }

    try {
      if (normalizedAction === 'scan') {
        const scanOpts = parseFeeAnalysisScanOptions(opts);
        const resolvedGame = resolveGame(game);
        if (!resolvedGame) {
          throw new Error(`Unknown game: ${game}`);
        }
        const targetWallet = opts.wallet || getWalletAddress() || null;
        if (targetWallet && !isAddress(targetWallet)) {
          throw new Error(`Invalid wallet address: ${targetWallet}`);
        }
        const confirmed = await confirmUnlimitedFeeScan(resolvedGame, scanOpts, {
          targetWallet,
          json: Boolean(opts.json),
          yes: Boolean(opts.yes),
        });
        if (!confirmed) {
          if (!opts.json) {
            console.log('\nFee scan cancelled.\n');
          }
          return;
        }
        if (!opts.json) {
          console.log(`\n💸 Scanning observed fees for ${getGameDisplayName(resolvedGame)} (${scanOpts.maxChunks === 0 ? 'unlimited chunks' : `${scanOpts.maxChunks} chunk(s)`})...\n`);
        }
        const { publicClient } = createClients();
        const result = await scanGameFees(publicClient, game, {
          ...scanOpts,
          targetWallet,
          onChunk: opts.json
            ? null
            : (chunk) => {
                const chunkLabel = chunk.target_only ? 'target' : 'global';
                console.log(`   ${theme.dim(`${chunk.from_block} -> ${chunk.to_block}`)} ${theme.dim(`[${chunkLabel}]`)} ${chunk.processed}/${chunk.logs} observed game(s)`);
              },
        });

        if (opts.json) {
          console.log(JSON.stringify(result));
        } else {
          console.log(formatFeesScanReport(result));
        }
        return;
      }

      const reportOpts = parseFeeAnalysisReportOptions(opts);
      const targetWallet = opts.wallet || getWalletAddress() || null;
      if (targetWallet && !isAddress(targetWallet)) {
        throw new Error(`Invalid wallet address: ${targetWallet}`);
      }
      const report = buildFeeReport(game, {
        wallet: targetWallet,
        ...reportOpts,
      });

      if (opts.json) {
        console.log(JSON.stringify(report));
      } else {
        console.log(formatFeesReport(report));
      }
    } catch (error) {
      const message = `Failed to ${normalizedAction} fee analysis: ${sanitizeError(error)}`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`\n❌ ${message}\n`);
      process.exit(1);
    }
  });

// ============================================================================
// COMMAND: GAMES
// ============================================================================
program
  .command('games')
  .description('List supported games')
  .option('-l, --list', 'Print a plain text list of play command forms')
  .option('--stats', 'Append the full Game Stats catalog, using local history when available')
  .option('--json', 'JSON output')
  .addHelpText('after', formatGamesHelpAppendix())
  .action(async (opts) => {
    const localWalletAddress = getWalletAddress();
    let history = loadHistory(localWalletAddress || undefined);
    if (opts.stats && localWalletAddress) {
      const { publicClient } = createClients();
      history = await enrichStoredHistoryVariants(publicClient, history);
    }
    const historyBreakdown = summarizeHistoryGamesByGame(history);
    const includeActiveGames = Boolean(localWalletAddress);
    const supportedGames = listSupportedGameCatalogEntries();
    const gameStats = opts.stats
      ? buildHistoryGameStatusSummary({
          historyBreakdown,
          activeGames: includeActiveGames ? loadActiveGames(localWalletAddress) : {},
          includeCatalog: true,
        })
      : [];

    const groupedGames = getGameCatalogGroups(supportedGames);
    const orderedGames = groupedGames.flatMap((group) => group.games);

    if (opts.list) {
      console.log(orderedGames.map((game) => formatGameListLine(game)).join('\n'));
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify({
        games: orderedGames,
        ...(opts.stats ? { game_stats: gameStats } : {}),
      }));
    } else {
      console.log(`\n${formatHeader('Available Games', '🎰')}\n`);
      for (const group of groupedGames) {
        printGameCatalogGroup(group.title, group.games);
      }

      if (opts.stats) {
        console.log(`${formatHeader('Game Stats', '🎮')}\n`);
        console.log(formatGameStatsTable(gameStats));
        console.log('');
      }
    }
  });

// ============================================================================
// COMMAND: GAME (single game details)
// ============================================================================
program
  .command('game <name>')
  .description('Show metadata and grammar for one game')
  .option('--json', 'JSON output')
  .addHelpText('after', formatGameHelpAppendix())
  .action((name, opts) => {
    const matchedCatalogEntry = resolveCatalogGameEntry(name);

    // Handle blackjack specially (stateful game)
    if (matchedCatalogEntry?.key === 'blackjack') {
      const blackjack = getBlackjackCatalogEntry();
      if (opts.json) {
        console.log(JSON.stringify(blackjack));
        return;
      }
      console.log(`
${'═'.repeat(60)}
  ${blackjack.displayName.toUpperCase()}
${'═'.repeat(60)}

  Classic H17 blackjack card game. Play against the dealer, aim for 21.
  Dealer hits soft 17. Includes auto-play bot with H17-aware strategy.

  Type:     ${blackjack.type}
  Key:      ${blackjack.key}
  Aliases:  ${blackjack.aliases.join(', ')}
  ABI verified: ${blackjack.abiVerified}
  Contract: ${blackjack.contract}

${'─'.repeat(60)}
  COMMANDS
${'─'.repeat(60)}

  ${BINARY_NAME} blackjack <amount>      Start new game with bet
  ${BINARY_NAME} blackjack resume        Resume unfinished games in queue
  ${BINARY_NAME} blackjack status        Check current game state

${'─'.repeat(60)}
  OPTIONS
${'─'.repeat(60)}

  --auto [mode]   Auto-play the hand
  --solver [mode] Show a suggested action in manual mode (default: best)
  --side <ape>    Player side bet amount
  --solver-max-states <n>
                 Best-EV search state cap; default 50000. Raise only if
                 complex hands hit the fallback warning; lower to bound CPU.
  --solver-timeout-ms <ms>
                 Best-EV worker timeout; default 5000. Timeout falls back
                 to simple strategy without blocking the main CLI process.
  --loop          Keep playing until balance runs out
  --take-profit <ape>  Stop when balance reaches this amount
  --min-profit <ape>  Stop when session P&L reaches this profit
  --target-x <x>  Stop when a hand pays at least this multiplier
  --target-profit <ape>  Stop when a hand pays at least this payout
  --retrace <ape>  Stop when a hand loses at least this amount
  --recover-loss <ape>  Arm at -<ape> net P&L; stop at break-even/profit
  --giveback-profit <ape>  Arm at +<ape> net P&L; stop at break-even/loss
  --stop-loss <ape>  Stop when balance drops to this amount
  --max-loss <ape>  Stop when session P&L reaches this loss
  --bankroll <ape>  Alias for --max-loss

${'─'.repeat(60)}
  GRAMMAR (BNF)
${'─'.repeat(60)}

  <amount> ::= <ape>
  <ape> ::= <number>            ; decimal APE amount; value > 0
  <side> ::= <number>           ; decimal APE amount; value >= 0
  <solver-states> ::= <integer> ; positive exact-EV search cap; defaults 50000/150000
  <solver-timeout-ms> ::= <integer> ; positive exact-EV worker timeout; defaults 5000/30000
  <auto-mode> ::= "simple" | "best" | "max"

${'─'.repeat(60)}
  ACTIONS (during game)
${'─'.repeat(60)}

  h / hit         Draw another card
  s / stand       Keep current hand
  d / double      Double bet, take one card, stand
  x / split       Split pair into two hands
  i / insurance   Take insurance (dealer shows Ace)
  r / surrender   Forfeit half bet, end hand

${'─'.repeat(60)}
  EXAMPLES
${'─'.repeat(60)}

  ${BINARY_NAME} blackjack 10                   Play one hand, 10 APE
  ${BINARY_NAME} blackjack 25 --side 1          Add 1 APE player side bet
  ${BINARY_NAME} blackjack 25 --auto            Bot plays one hand
  ${BINARY_NAME} blackjack 25 --auto best       Exact EV solver
  ${BINARY_NAME} blackjack 25 --auto best --solver-max-states 100000
                                           Give complex exact-EV branches more CPU budget
  ${BINARY_NAME} blackjack 25 --auto best --solver-timeout-ms 3000
                                           Cap exact-EV wall-clock latency
  ${BINARY_NAME} blackjack 25 --auto max        Exact EV solver with 150000 states / 30000 ms
  ${BINARY_NAME} blackjack 25 --solver max      Manual play with worker and simple suggestions
  ${BINARY_NAME} blackjack 25 --auto --loop     Bot grinds until broke
  ${BINARY_NAME} blackjack 10 --auto --loop --take-profit 500
                                           Bot plays until 500 APE balance
  ${BINARY_NAME} blackjack 10 --auto --loop --target-x 2.5
                                           Stop after any 2.5x-or-better hand
  ${BINARY_NAME} blackjack 10 --auto --loop --recover-loss 25
                                           Stop once a 25 APE drawdown returns to break-even/profit
  ${BINARY_NAME} blackjack 10 --auto --loop --min-profit 40
                                           Stop once session P&L reaches +40 APE

${'═'.repeat(60)}
`);
      return;
    }

    if (matchedCatalogEntry?.key === 'cash-dash') {
      const cashDash = getCashDashCatalogEntry();
      if (opts.json) {
        console.log(JSON.stringify(cashDash));
        return;
      }
      console.log(`
${'═'.repeat(60)}
  ${cashDash.displayName.toUpperCase()}
${'═'.repeat(60)}

  Stateful ladder game. Each row has one hidden death tile.
  A safe pick advances the run and compounds the available payout;
  a death tile ends the run. Cash out after any resolved safe row.

  Type:     ${cashDash.type}
  Key:      ${cashDash.key}
  Aliases:  ${cashDash.aliases.join(', ')}
  ABI verified: ${cashDash.abiVerified}
  Contract: ${cashDash.contract}

${'─'.repeat(60)}
  COMMANDS
${'─'.repeat(60)}

  ${BINARY_NAME} cash-dash <amount>    Start new run with bet
  ${BINARY_NAME} cash-dash resume      Resume unfinished games in queue
  ${BINARY_NAME} cash-dash status      Check current game state
  ${BINARY_NAME} cash-dash payouts     Show verified row payout table
  ${BINARY_NAME} cash-dash cashout     End the current run and collect
  ${BINARY_NAME} cash-dash guess <tile> Continue with a tile pick

${'─'.repeat(60)}
  OPTIONS
${'─'.repeat(60)}

  --tile <tile>   Opening tile: 1-7 or random; manual mode prompts when omitted
  --auto [mode]   Auto-play the run
  --cashout-after <rows> Auto-play cashes out after N safe rows
  --solver        Show the best continuation suggestion in manual mode
  --loop          Keep starting new runs until a stop condition triggers
  --max-games <count> Stop after N runs in loop mode
  --take-profit <ape> Stop when balance reaches this amount
  --min-profit <ape> Stop when session P&L reaches this profit
  --target-x <x> Stop when a run pays at least this multiplier
  --target-profit <ape> Stop when a run pays at least this payout
  --stop-loss <ape> Stop when balance drops to this amount
  --max-loss <ape> Stop when session P&L reaches this loss
  --bankroll <ape> Alias for --max-loss
  --retrace <ape> Stop when a run loses at least this amount
  --recover-loss <ape> Arm at -<ape> net P&L; stop at break-even/profit
  --giveback-profit <ape> Arm at +<ape> net P&L; stop at break-even/loss
  --bet-strategy <name> Betting strategy for loop mode; supports bankroll-fraction=<0..1>
  --max-bet <ape> Maximum bet amount for progressive strategies
  --min-bet <ape> Minimum bet amount floor for dynamic strategies
  --display <mode> Display mode: full, simple, json
  --game <id>     Specify game ID (for resume/action)

${'─'.repeat(60)}
  GRAMMAR (BNF)
${'─'.repeat(60)}

  <amount> ::= <ape>
  <ape> ::= <number>            ; decimal APE amount; value > 0
  <tile> ::= "random" | <integer>
  <auto-mode> ::= "simple" | "best"

${'─'.repeat(60)}
  ACTIONS (during game)
${'─'.repeat(60)}

  1..N / guess N  Pick a tile in the active row
  r / random      Pick a random tile
  c / cashout     Bank current winnings and end the run

${'─'.repeat(60)}
  EXAMPLES
${'─'.repeat(60)}

  ${BINARY_NAME} cash-dash 25                  Play one run, prompts for opening tile
  ${BINARY_NAME} cash-dash 25 --tile 3         Open with tile 3
  ${BINARY_NAME} cash-dash 25 --solver         Manual play with best suggestion
  ${BINARY_NAME} cash-dash 25 --auto           Auto cashes first safe row
  ${BINARY_NAME} cash-dash 25 --auto --cashout-after 3
                                        Auto targets three safe rows
  ${BINARY_NAME} cash-dash 25 --auto best --loop --max-games 20
                                        Continuous Cash Dash auto-play
  ${BINARY_NAME} cash-dash guess 2             Continue the current run with tile 2
  ${BINARY_NAME} cash-dash cashout             End the current run and collect

${'═'.repeat(60)}
`);
      return;
    }

    if (matchedCatalogEntry?.key === 'hi-lo-nebula') {
      const hiLoNebula = getHiLoNebulaCatalogEntry();
      if (opts.json) {
        console.log(JSON.stringify(hiLoNebula));
        return;
      }
      console.log(`
${'═'.repeat(60)}
  ${hiLoNebula.displayName.toUpperCase()}
${'═'.repeat(60)}

  Sequential rank-only card prediction game. Guess HIGHER, LOWER,
  or SAME against the current card. Each correct guess advances the
  streak and increases the next cashout value; a miss loses everything.
  The verified contract samples ranks 2..A uniformly with replacement.

  Type:     ${hiLoNebula.type}
  Key:      ${hiLoNebula.key}
  Aliases:  ${hiLoNebula.aliases.join(', ')}
  ABI verified: ${hiLoNebula.abiVerified}
  Contract: ${hiLoNebula.contract}

${'─'.repeat(60)}
  COMMANDS
${'─'.repeat(60)}

  ${BINARY_NAME} hi-lo-nebula <amount>  Start new game with bet
  ${BINARY_NAME} hi-lo-nebula resume    Resume unfinished games in queue
  ${BINARY_NAME} hi-lo-nebula status    Check current game state
  ${BINARY_NAME} hi-lo-nebula payouts   Show verified payout table

${'─'.repeat(60)}
  OPTIONS
${'─'.repeat(60)}

  --auto [mode]   Auto-play the run
  --solver [mode] Show a continuation suggestion in manual mode (default: best)
  --loop          Keep starting new runs until a stop condition triggers
  --max-games <count> Stop after N runs in loop mode
  --take-profit <ape>  Stop when balance reaches this amount
  --min-profit <ape> Stop when session P&L reaches this profit
  --target-x <x> Stop when a run pays at least this multiplier
  --target-profit <ape> Stop when a run pays at least this payout
  --stop-loss <ape> Stop when balance drops to this amount
  --max-loss <ape> Stop when session P&L reaches this loss
  --bankroll <ape> Alias for --max-loss
  --retrace <ape> Stop when a run loses at least this amount
  --recover-loss <ape> Arm at -<ape> net P&L; stop at break-even/profit
  --giveback-profit <ape> Arm at +<ape> net P&L; stop at break-even/loss
  --bet-strategy <name> Betting strategy for loop mode; supports bankroll-fraction=<0..1>
  --max-bet <ape> Maximum bet amount for progressive strategies
  --min-bet <ape> Minimum bet amount floor for dynamic strategies
  --display <mode> Display mode: full, simple, json
  --game <id>     Specify game ID (for resume/action)

${'─'.repeat(60)}
  GRAMMAR (BNF)
${'─'.repeat(60)}

  <amount> ::= <ape>
  <ape> ::= <number>            ; decimal APE amount; value > 0
  <auto-mode> ::= "simple" | "best" | "winston-ladder"

${'─'.repeat(60)}
  HI-LO AUTO / SOLVER MODES
${'─'.repeat(60)}

  simple          Cash first available payout; otherwise pick highest hit rate
  best            Net-EV continuation solver with VRF and jackpot snapshot
  winston-ladder  Two-game, seven-guess target ladder; ignores VRF in target

${'─'.repeat(60)}
  ACTIONS (during game)
${'─'.repeat(60)}

  h / high        Guess the next rank will be higher
  l / lower       Guess the next rank will be lower
  s / same        Guess the next rank will match
  c / cashout     Bank current winnings and end the round

${'─'.repeat(60)}
  EXAMPLES
${'─'.repeat(60)}

  ${BINARY_NAME} hi-lo-nebula 25                Play one run, 25 APE
  ${BINARY_NAME} hi-lo-nebula 25 --solver       Manual play with best suggestion
  ${BINARY_NAME} hi-lo-nebula 25 --solver winston-ladder
                                          Manual play with ladder suggestions
  ${BINARY_NAME} hi-lo-nebula 25 --auto         Simple auto-play
  ${BINARY_NAME} hi-lo-nebula 25 --auto best    Net-EV auto-play with VRF/jackpot snapshot
  ${BINARY_NAME} hi-lo-nebula 25 --auto winston-ladder
                                          Two-game target ladder auto-play
  ${BINARY_NAME} hi-lo-nebula 25 --auto best --loop --max-games 20
                                          Continuous Hi-Lo auto-play
  ${BINARY_NAME} hi-lo-nebula 25 --auto best --loop --max-loss 20
                                          Stop after a 20 APE session drawdown
  ${BINARY_NAME} hi-lo-nebula lower             Continue the current run with LOWER
  ${BINARY_NAME} hi-lo-nebula cashout           End the current run and collect

${'═'.repeat(60)}
`);
      return;
    }
    
    // Handle video-poker specially (stateful game)
    if (matchedCatalogEntry?.key === 'video-poker') {
      const videoPoker = getVideoPokerCatalogEntry();
      if (opts.json) {
        console.log(JSON.stringify(videoPoker));
        return;
      }
      console.log(`
${'═'.repeat(60)}
  ${videoPoker.displayName.toUpperCase()} (GIMBOZ POKER)
${'═'.repeat(60)}

  Jacks or Better video poker. Get dealt 5 cards, choose which
  to discard, and draw replacements. Pair of Jacks+ wins.
  Max bet (100 APE) qualifies for progressive jackpot on Royal Flush.

  Type:     ${videoPoker.type}
  Key:      ${videoPoker.key}
  Aliases:  ${videoPoker.aliases.join(', ')}
  ABI verified: ${videoPoker.abiVerified}
  Contract: ${videoPoker.contract}

${'─'.repeat(60)}
  COMMANDS
${'─'.repeat(60)}

  ${BINARY_NAME} video-poker <amount>    Start new game (1/5/10/25/50/100 APE)
  ${BINARY_NAME} video-poker resume      Resume unfinished games in queue
  ${BINARY_NAME} video-poker status      Check current game state
  ${BINARY_NAME} video-poker payouts     Show payout table

${'─'.repeat(60)}
  OPTIONS
${'─'.repeat(60)}

  --auto [mode]   Auto-play the hand
  --loop          Keep playing until balance runs out
  --take-profit <ape>  Stop when balance reaches this amount
  --min-profit <ape>  Stop when session P&L reaches this profit
  --target-x <x>  Stop when a hand pays at least this multiplier
  --target-profit <ape>  Stop when a hand pays at least this payout
  --retrace <ape>  Stop when a hand loses at least this amount
  --recover-loss <ape>  Arm at -<ape> net P&L; stop at break-even/profit
  --giveback-profit <ape>  Arm at +<ape> net P&L; stop at break-even/loss
  --stop-loss <ape>  Stop when balance drops to this amount
  --max-loss <ape>  Stop when session P&L reaches this loss
  --bankroll <ape>  Alias for --max-loss

${'─'.repeat(60)}
  GRAMMAR (BNF)
${'─'.repeat(60)}

  <amount> ::= "1" | "5" | "10" | "25" | "50" | "100"
  <auto-mode> ::= "simple" | "best"

${'─'.repeat(60)}
  PAYOUTS (multiplier x bet)
${'─'.repeat(60)}

  Royal Flush        250x  (+Jackpot at max bet)
  Straight Flush      50x
  Four of a Kind      25x
  Full House           9x
  Flush                6x
  Straight             4x
  Three of a Kind      3x
  Two Pair             2x
  Jacks or Better      1x

${'─'.repeat(60)}
  EXAMPLES
${'─'.repeat(60)}

  ${BINARY_NAME} video-poker 10              Play one hand, 10 APE
  ${BINARY_NAME} video-poker 100             Max bet (jackpot eligible)
  ${BINARY_NAME} video-poker 25 --auto          Bot plays one hand (simple)
  ${BINARY_NAME} video-poker 25 --auto best     Exact EV solver
  ${BINARY_NAME} video-poker 25 --auto --loop
                                        Bot grinds until broke
  ${BINARY_NAME} video-poker 25 --auto --loop --giveback-profit 40
                                        Stop once a 40 APE run-up is given back
  ${BINARY_NAME} video-poker 25 --auto --loop --min-profit 50
                                        Stop once session P&L reaches +50 APE

${'═'.repeat(60)}
`);
      return;
    }
    
    const game = resolveGame(matchedCatalogEntry?.key || name);
    if (!game) {
      const error = { error: `Unknown game: ${name}`, available: listAllSupportedGameKeys() };
      process.exitCode = 1;
      if (opts.json) console.log(JSON.stringify(error));
      else console.log(`\n❌ Unknown game: "${name}"\n${formatAvailableGameGroups()}\n`);
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify({
        ...game,
        displayName: getGameDisplayName(game),
        abiVerified: Boolean(game.abiVerified),
      }));
    } else {
      const displayName = getGameDisplayName(game);
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`  ${displayName.toUpperCase()}`);
      console.log(`${'═'.repeat(60)}\n`);
      console.log(`  ${game.description}\n`);
      console.log(`  Type:     ${game.type}`);
      console.log(`  Key:      ${game.key}`);
      if (Array.isArray(game.aliases) && game.aliases.length > 0) {
        console.log(`  Aliases:  ${game.aliases.join(', ')}`);
      }
      console.log(`  ABI verified: ${Boolean(game.abiVerified)}`);
      console.log(`  Contract: ${game.contract}\n`);
      
      if (game.config) {
        console.log(`${'─'.repeat(60)}`);
        console.log('  PARAMETERS');
        console.log(`${'─'.repeat(60)}\n`);
        for (const [param, cfg] of Object.entries(game.config).filter(([, entry]) => isPublicGameConfigEntry(entry))) {
          const cliName = getGameConfigCliName(game, param);
          const range = getGameConfigDisplayRange(game, param);
          const displayDefault = getGameConfigDisplayDefault(game, param);

          console.log(`  --${cliName}`);
          if (range.min !== undefined) console.log(`      Range:   ${range.min} - ${range.max}`);
          if (displayDefault !== undefined) console.log(`      Default: ${displayDefault}`);
          if (cfg.description) console.log(`      ${cfg.description}`);
          printConfigBnf(cfg);
          if (cfg.examples) {
            console.log('      Examples:');
            for (const ex of cfg.examples) {
              if (typeof ex === 'object' && ex.value !== undefined) {
                const parts = [];
                if (ex.value !== undefined) parts.push(`${ex.value}`);
                if (ex.winChance) parts.push(`${ex.winChance} win`);
                if (ex.payout) parts.push(`→ ${ex.payout}`);
                console.log(`        ${parts.join(' ')}`);
              } else {
                console.log(`        ${ex}`);
              }
            }
          }
          console.log('');
        }
      }
      console.log(`${'═'.repeat(60)}\n`);
    }
  });

// ============================================================================
// COMMAND: COMMANDS (help reference)
// ============================================================================
program
  .command('commands')
  .description('Show the compact command index')
  .addHelpText('after', formatCommandsHelpAppendix())
  .action(() => {
    console.log(`
🦍 APE CHURCH CLI - COMMAND INDEX

CANONICAL REFERENCE
  Full command, option, and shared BNF reference:
  README.md
  docs/COMMAND_REFERENCE.md
  docs/GAMES_REFERENCE.md

SETUP
  ${BINARY_NAME} install              Setup encrypted wallet and register
  ${BINARY_NAME} uninstall            Remove local data

WALLET
  ${BINARY_NAME} wallet status        Check wallet status
  ${BINARY_NAME} wallet --list        List locally available wallet addresses
  ${BINARY_NAME} wallet new           Create and select a new wallet
  ${BINARY_NAME} wallet select [address]
                                   Select a stored wallet
  ${BINARY_NAME} wallet download [address]  Download on-chain history into the local per-wallet cache
  ${BINARY_NAME} wallet password      Re-encrypt local wallet with a new password
  ${BINARY_NAME} wallet hints         View or update password hints (up to 3)
  ${BINARY_NAME} wallet reset         Delete local wallet data files (requires reinstall)
  ${BINARY_NAME} send APE <amt> <to>  Send APE (native currency) to an address
  ${BINARY_NAME} send GP <amt> <to>   Send GP (Gimbo Points, 0 decimals) to an address

R2 BOT LOG MIRROR
  ${BINARY_NAME} bucket install <bucket>
                                   Encrypt one R2 bucket config and enable it
  ${BINARY_NAME} bucket status [-v]  Show R2 mirror state; -v decrypts verbose values
  ${BINARY_NAME} bucket list [-v]    List stored R2 bucket entries; -v decrypts verbose values
  ${BINARY_NAME} bucket enable <bucket>
                                   Enable a stored R2 bucket entry
  ${BINARY_NAME} bucket disable      Disable remote mirroring; keep encrypted entries

THE HOUSE (Staking)
  ${BINARY_NAME} house                Show house stats and your position
  ${BINARY_NAME} house deposit <amt>  Deposit APE (15-min lock, 2% withdraw fee)
  ${BINARY_NAME} house withdraw <amt> Withdraw APE

STATUS
  ${BINARY_NAME} profile              Show profile
  ${BINARY_NAME} status               Check balance and state
  ${BINARY_NAME} profile show         Show profile
  ${BINARY_NAME} profile set          Update profile preferences
  ${BINARY_NAME} profile set --username <name>
                                   Register or change username from profile
  ${BINARY_NAME} profile set --gp-ape <points>
                                   Persist current GP/APE override for this wallet
  ${BINARY_NAME} profile set --no-gp-ape
                                   Clear the wallet-specific current GP/APE override

PLAY - STATELESS
  ${BINARY_NAME} play --auto          Play a random stateless game/config automatically
  ${BINARY_NAME} play <game> <amt>    Play a specific stateless game
  ${BINARY_NAME} bet --game X --amount Y   Manual stateless bet

PLAY - STATEFUL
  ${BINARY_NAME} play blackjack <amt> Stateful play surface for bots
  ${BINARY_NAME} play cash-dash <amt> Stateful play surface for bots
  ${BINARY_NAME} blackjack <amt>      Interactive blackjack (alias: bj)
  ${BINARY_NAME} cash-dash <amt>      Interactive Cash Dash (aliases: cashdash, dash)
  ${BINARY_NAME} hi-lo-nebula <amt>   Interactive Hi-Lo Nebula (aliases: hilonebula, hilo, nebula)
  ${BINARY_NAME} video-poker <amt>    Interactive video poker (alias: vp)

PLAY - SHARED LOOP CONTROLS
  ${BINARY_NAME} play <game> <amt> --loop
                                   Continuous play for selected stateless/stateful game

EXTERNAL BOTS
  ${BINARY_NAME} bot                List discovered bots and the active bots directory
  ${BINARY_NAME} bot <name> [args...]   Run one external bot through the helper surface

CONTROL
  ${BINARY_NAME} pause                Stop autonomous play
  ${BINARY_NAME} continue             Continue play
  ${BINARY_NAME} register --username <name>   Set or change username

INFO
  ${BINARY_NAME} games                List all games
  ${BINARY_NAME} game <name>          Game details
  ${BINARY_NAME} history --list       List wallets with local cached history
  ${BINARY_NAME} history [address]    Read cached history, recent games, and history stats
  ${BINARY_NAME} history [address] --leaderboard
                                   Show weekly wAPE wagered totals
  ${BINARY_NAME} history [address] --scoreboard
                                   Append the cached wallet scoreboard to history output
  ${BINARY_NAME} history [address] --scoreboard --ids
                                   Include game IDs in scoreboard terminal tables
  ${BINARY_NAME} history [address] --scoreboard --url
                                   Include game URLs in scoreboard terminal tables
  ${BINARY_NAME} scoreboard [address]
                                   Read cached scoreboards built from history
  ${BINARY_NAME} scoreboard [address] --ids
                                   Include game IDs in scoreboard terminal tables
  ${BINARY_NAME} scoreboard [address] --url
                                   Include game URLs in scoreboard terminal tables
  ${BINARY_NAME} commands             This help

CONTEST
  ${BINARY_NAME} contest              Contest info and your status
  ${BINARY_NAME} contest register     Register for the contest (5 APE)

ENVIRONMENT
  ${CONFIG_DIR_ENV_VAR}   Root config/data directory (default: ~/.apechurch-cli)
  ${BOTS_DIR_ENV_VAR}     External bots root (default: ${CONFIG_DIR_ENV_VAR}/bots)
  ${LOG_DIR_ENV_VAR}      Bot log directory (default: ${CONFIG_DIR_ENV_VAR}/log)
  ${PRIVATE_KEY_ENV_VAR}          Optional fallback for non-interactive install/reinstall
  ${PASS_ENV_VAR}        Wallet password for non-interactive install/signing
  ${R2_PREFIX_ENV_VAR}       Optional R2 object key prefix for mirrored bot logs
  ${R2_ACCOUNT_ID_ENV_VAR}   R2 install fallback: account ID
  ${R2_NAME_ENV_VAR}         R2 install fallback: bucket name
  ${R2_TOKEN_ENV_VAR}        R2 install fallback: API token
  ${R2_KEY_ENV_VAR}          R2 install fallback: access key ID
  ${R2_SECRET_ENV_VAR}       R2 install fallback: secret access key
  ${PROFILE_URL_ENV_VAR} Optional override for the username/profile API
  ${RPC_URL_ENV_VAR}             Custom ApeChain RPC URL(s); default RPC remains a fallback
  ${FORCE_COLOR_ENV_VAR}   Force ANSI color in plain output when set to 1
  ${NO_COLOR_ENV_VAR}                    Disable ANSI color when set
  ${FORCE_CHIME_ENV_VAR}   Force win chimes in JSON/nested bot flows when set to 1
  ${SUPPRESS_VERSION_BANNER_ENV_VAR}
                          Suppress the stderr version banner when set to 1

LOOP OPTIONS
  --loop                  Play continuously
  --take-profit <ape>     Stop when balance reaches target
  --min-profit <ape>      Stop when session P&L reaches the target profit
  --target-x <x>          Stop when one game pays at least Xx
  --target-profit <ape>   Stop when one game pays at least this payout
  --retrace <ape>         Stop when one game loses at least this amount
  --recover-loss <ape>    Arm at -<ape> net P&L; stop at break-even/profit
  --giveback-profit <ape> Arm at +<ape> net P&L; stop at break-even/loss
  --stop-loss <ape>       Stop when balance drops to limit
  --max-loss <ape>        Stop when session P&L reaches the loss limit
  --bankroll <ape>        Alias for --max-loss
  --max-games <count>     Stop after N games
  --bet-strategy <name>   Betting strategy (flat, martingale, bankroll-fraction=<0..1>, etc.)
  --max-bet <ape>         Maximum bet cap (for progressive strategies)
  --min-bet <ape>         Minimum bet floor for dynamic strategies
  --gp-ape <points>       Override local GP estimation for this run

BETTING STRATEGIES
  flat                    Same bet every time (default)
  martingale              Double on loss, reset on win
  reverse-martingale      Double on win, reset on loss
  fibonacci               Fibonacci sequence on loss
  dalembert               +1 unit on loss, -1 on win
  bankroll-fraction=<n>   Bet n of remaining bankroll each game

EXAMPLES
  ${BINARY_NAME} play jungle-plinko 10 2 50
  ${BINARY_NAME} play cosmic-plinko 10 1 10
  ${BINARY_NAME} play blocks 10 1 5
  ${BINARY_NAME} play primes 10 0 20
  ${BINARY_NAME} play roulette 50 RED
  ${BINARY_NAME} play ape-strong 10 --cover 50
  ${BINARY_NAME} play glyde-or-crash 10 2x

  # Loop with safety limits
  ${BINARY_NAME} play --loop --take-profit 200 --stop-loss 50

  # Stop on session P&L thresholds
  ${BINARY_NAME} play roulette 10 RED --loop --min-profit 25 --max-loss 20

  # Martingale: start at 10, double on loss, max 100
  ${BINARY_NAME} play roulette 10 RED --loop --bet-strategy martingale --max-bet 100

  # Bankroll fraction: no base bet; bet 9% of remaining bankroll
  ${BINARY_NAME} play roulette --bet RED --loop --bankroll 500 --bet-strategy bankroll-fraction=0.09 --max-bet 100 --min-bet 5

  # Blackjack with strategy
  ${BINARY_NAME} blackjack 5 --auto --loop --bet-strategy martingale --take-profit 100

  # Run exactly 20 games
  ${BINARY_NAME} play ape-strong 10 --loop --max-games 20

  ${BINARY_NAME} register --username my_bot_name
  ${BINARY_NAME} send APE 10 0x1234...abcd
  ${BINARY_NAME} wallet download 0x1234...abcd --json

GAME ALIASES
  ape-strong: apestrong, strong
  bear-dice: bear, dice
  bubblegum-heist: bubblegumheist, bubblegum, heist
  cosmic-plinko: cosmic
  dino-dough: dinodough, dino
  geez-diggerz: geezdiggerz, geez, diggerz
  gimboz-smash: gimbozsmash, smash
  glyde-or-crash: glyde, glyde-crash, glydecrash, speed-crash, speedcrash, crash
  jungle-plinko: jungleplinko, jungle
  monkey-match: monkeymatch, monkey
  speed-keno: speedkeno, skeno, speed
  sushi-showdown: sushishowdown, sushi
  blackjack: bj
  cash-dash: cashdash, dash
  hi-lo-nebula: hilonebula, hilo, nebula
  video-poker: vp

ASSETS
  APE    Native currency (18 decimals)
         - Used for betting, gas fees, and transfers
         - Check balance: ${BINARY_NAME} status

  wAPE   APE Wagered tracker (reporting only)
         - Current on-chain balance is shown in history reporting
         - Not transferable via this CLI

  GP     Gimbo Points (0 decimals, whole numbers only)
         - Earned as cashback from playing games
         - Every 10,000 GP equals 1 Level
         - Non-transferable until claimed (use getCurrentEXP to check)
         - Send to others: ${BINARY_NAME} send GP <amount> <address>

DETAILED HELP
  ${BINARY_NAME} help <topic>         Get detailed help on a topic

  Topics: loop, strategies, auto, wallet, history, house, commands
`);
  });

// ============================================================================
// COMMAND: HELP (Detailed topic help)
// ============================================================================
const HELP_TOPICS = {
  loop: `
${'═'.repeat(70)}
  LOOP MODE - Continuous Play
${'═'.repeat(70)}

  The --loop flag enables continuous play until a condition is met.
  Combine with safety controls to protect your bankroll.

${'─'.repeat(70)}
  BASIC USAGE
${'─'.repeat(70)}

  ${BINARY_NAME} play --loop                    # Loop until balance runs out
  ${BINARY_NAME} play roulette 10 RED --loop    # Loop specific game

${'─'.repeat(70)}
  SAFETY CONTROLS (Highly Recommended!)
${'─'.repeat(70)}

  --take-profit <ape>  Stop when balance REACHES this amount
                       Example: --take-profit 200 (stop at 200 APE)

  --min-profit <ape>   Stop when session P&L reaches +<ape> or better
                       Example: --min-profit 25 (stop at +25 APE session P&L)

  --target-x <x>       Stop when a single game pays at least this multiplier
                       Example: --target-x 10 (stop on any 10x+ hit)

  --target-profit <ape>  Stop when a single game pays at least this payout
                         Example: --target-profit 250 (stop on any 250+ APE payout)

  --retrace <ape>        Stop when a single game loses at least this amount
                         Example: --retrace 25 (stop on any 25+ APE loss)

  --recover-loss <ape>   Arm once net session P&L reaches -<ape> or worse;
                         stop once current net P&L returns to break-even/profit
                         Example: --recover-loss 25

  --giveback-profit <ape> Arm once net session P&L reaches +<ape> or better;
                          stop once current net P&L returns to break-even/loss
                          Example: --giveback-profit 40
                       
  --stop-loss <ape>    Stop when balance DROPS to this amount
                       Example: --stop-loss 50 (stop if you hit 50 APE)

  --max-loss <ape> / --bankroll <ape>
                       Stop when session P&L reaches -<ape> or worse
                       Example: --bankroll 20 (stop at -20 APE session P&L)
                       
  --max-games <n>      Stop after exactly N games
                       Example: --max-games 100 (play 100 games then stop)

  --gp-ape <points>    Override the loop points conversion for this run
                       Default base rate is 5 GP/APE unless a wallet-specific
                       current rate is set in profile

  Hidden timing flag:
    --human [range]    Add humanized random pacing (default 3-9s; e.g. 2-17)
                       If --delay is also set, it is added on top

  These can be combined:
    ${BINARY_NAME} play --loop --take-profit 200 --min-profit 25 --stop-loss 50 --max-loss 20 --max-games 500
    ${BINARY_NAME} play roulette 10 RED --loop --recover-loss 25
    ${BINARY_NAME} play roulette 10 RED --loop --human
    ${BINARY_NAME} play roulette 10 RED --loop --human 2-17

  Where loop game estimates are supported, startup also prints a pre-loop estimate.
  Games with a full Monte Carlo model show the typical run plus lucky / bad-run bounds:
    Estimate games before wallet squandering: ~8 ⚠️. On a lucky day, it could be 104 🍀; on a bad run, just 3 💀. Proceed? (Y/n)
  Other supported games fall back to an EV-based estimate:
    Estimate games before stop-loss ~17 games. Proceed? (Y/n)

${'─'.repeat(70)}
  BETTING STRATEGIES (use with --loop)
${'─'.repeat(70)}

  --bet-strategy <name>   Control how bet size changes after wins/losses
                          Options: flat, martingale, reverse-martingale,
                                   fibonacci, dalembert,
                                   bankroll-fraction=<0..1>
                          
  --max-bet <ape>         IMPORTANT: Cap maximum bet size
                          Prevents runaway betting in progressive strategies

  --min-bet <ape>         Minimum bet floor for dynamic strategies
                          
  Example - Martingale with safety:
    ${BINARY_NAME} play roulette 10 RED --loop \\
      --bet-strategy martingale \\
      --max-bet 100 \\
      --stop-loss 50

  Example - Bankroll fraction:
    ${BINARY_NAME} play roulette --bet RED --loop \\
      --bankroll 500 \\
      --bet-strategy bankroll-fraction=0.09 \\
      --max-bet 100 \\
      --min-bet 5

  See: ${BINARY_NAME} help strategies

${'─'.repeat(70)}
  DISPLAY DURING LOOP
${'─'.repeat(70)}

  Each iteration shows:
    • Current balance and session P&L
    • Game played and result
    • Bet amount (and if capped by --max-bet)
    • Running win/loss count

  Loop exits cleanly on:
    • Reaching --take-profit balance
    • Reaching --min-profit session P&L
    • Hitting --target-x on a single game
    • Hitting --target-profit on a single game
    • Hitting --retrace on a single game loss
    • Returning to break-even/profit after --recover-loss is armed
    • Returning to break-even/loss after --giveback-profit is armed
    • Hitting --stop-loss floor
    • Hitting --max-loss session P&L
    • Completing --max-games
    • Balance too low for minimum bet
    • Ctrl+C (manual interrupt)

${'─'.repeat(70)}
  WORKS WITH
${'─'.repeat(70)}

  Stateless games:
    • ${BINARY_NAME} play roulette 10 RED --loop
    • ${BINARY_NAME} play jungle-plinko 10 --risk 0 --split 100 --loop

  Stateful games:
    • ${BINARY_NAME} play blackjack 10 --loop --auto
    • ${BINARY_NAME} play cash-dash 10 --loop --auto
    • ${BINARY_NAME} play hi-lo-nebula 10 --loop --auto
    • ${BINARY_NAME} play video-poker 10 --loop --auto

${'═'.repeat(70)}
`,

  strategies: `
${'═'.repeat(70)}
  BETTING STRATEGIES
${'═'.repeat(70)}

  Betting strategies control how your wager changes based on wins/losses.
  Use with --loop for continuous play.

  SYNTAX:
    ${BINARY_NAME} play <game> <base-bet> --loop --bet-strategy <name> --max-bet <cap>
    ${BINARY_NAME} play <game> --loop --bankroll <ape> --bet-strategy bankroll-fraction=<0..1>

${'─'.repeat(70)}
  FLAT (Default) - Safest
${'─'.repeat(70)}

  Same bet every time regardless of wins or losses.
  
  • Risk: LOW
  • Bankroll Impact: Predictable, slow grind
  • Best For: Long sessions, learning games
  
  Example: ${BINARY_NAME} play roulette 10 RED --loop

${'─'.repeat(70)}
  MARTINGALE - High Risk
${'─'.repeat(70)}

  Double bet after each loss, reset to base on win.
  Theory: Eventually win and recover all losses + base profit.
  
  • Risk: HIGH - Can deplete bankroll fast
  • Progression: 10 → 20 → 40 → 80 → 160 → ...
  • 10 losses = 1024x base bet needed!
  
  ⚠️  ALWAYS use --max-bet to cap progression!
  
  Example:
    ${BINARY_NAME} play roulette 10 RED --loop \\
      --bet-strategy martingale --max-bet 100

${'─'.repeat(70)}
  REVERSE MARTINGALE (Anti-Martingale) - Medium Risk
${'─'.repeat(70)}

  Double bet after each WIN, reset to base on loss.
  Theory: Ride winning streaks, limit losses.
  
  • Risk: MEDIUM - Losses capped at base bet
  • Best For: Short aggressive sessions
  • Downside: One loss wipes streak gains
  
  Example:
    ${BINARY_NAME} play roulette 10 RED --loop \\
      --bet-strategy reverse-martingale --max-bet 80

${'─'.repeat(70)}
  FIBONACCI - Medium-High Risk
${'─'.repeat(70)}

  On loss: move forward in Fibonacci sequence (1,1,2,3,5,8,13,21...)
  On win: move back 2 steps
  
  • Risk: MEDIUM-HIGH - Slower than Martingale
  • Progression: 10 → 10 → 20 → 30 → 50 → 80 → ...
  • Recovery: Win jumps back 2 positions
  
  Example:
    ${BINARY_NAME} play roulette 10 RED --loop \\
      --bet-strategy fibonacci --max-bet 150

${'─'.repeat(70)}
  D'ALEMBERT - Low-Medium Risk
${'─'.repeat(70)}

  On loss: add 1 unit to bet
  On win: subtract 1 unit (minimum = base bet)
  
  • Risk: LOW-MEDIUM - Linear growth (safest progressive)
  • Progression: 10 → 20 → 30 → 40 (vs exponential)
  • Best For: Conservative players wanting some progression
  
  Example:
    ${BINARY_NAME} play roulette 10 RED --loop \\
      --bet-strategy dalembert --max-bet 100

${'─'.repeat(70)}
  BANKROLL FRACTION - Dynamic Bankroll Sizing
${'─'.repeat(70)}

  Bets a fixed fraction of the remaining session bankroll.
  Use bankroll-fraction=<decimal> where the decimal is strictly between 0 and 1.

  • Requires: --bankroll/--max-loss or --stop-loss
  • Conflicts with: explicit <base-bet> or --amount
  • Remaining bankroll: --bankroll plus session P&L, or current balance minus --stop-loss
  • Supports: --max-bet cap and --min-bet floor

  Example:
    ${BINARY_NAME} play roulette --bet RED --loop \\
      --bankroll 500 \\
      --bet-strategy bankroll-fraction=0.09 \\
      --max-bet 100 \\
      --min-bet 5

${'─'.repeat(70)}
  IMPORTANT: --max-bet / --min-bet
${'─'.repeat(70)}

  Progressive strategies can spiral quickly. ALWAYS set --max-bet.
  
  When bet would exceed --max-bet:
    • Bet is capped at max-bet value
    • Strategy state continues (doesn't reset)
    • Output shows "(capped)" when this happens

  --min-bet floors dynamic wagers, including bankroll-fraction, when the
  calculated bet gets too small.

${'═'.repeat(70)}
`,

  auto: `
${'═'.repeat(70)}
  AUTO-PLAY MODE
${'═'.repeat(70)}

  The --auto flag lets the CLI play without human input.
  Available on games that require decisions (Blackjack, Cash Dash, Hi-Lo Nebula, Video Poker).
  In manual Hi-Lo Nebula, --solver [mode] uses the same decision engines and defaults to best.

  Modes:
    • simple   Fast heuristic mode (default)
    • best     Exact EV mode where implemented
    • max      Blackjack exact EV mode with larger default solver limits
    • winston-ladder
               Hi-Lo Nebula two-game target ladder mode

${'─'.repeat(70)}
  BLACKJACK --auto
${'─'.repeat(70)}

  simple: Uses Basic Strategy based on:
    • Your hand total (hard/soft)
    • Dealer's up card
    • Available actions (hit, stand, double, split, etc.)
    • The live dealer-hits-soft-17 rule surface

  best: Exact EV solver on the live hand state:
    • Enumerates the remaining deck without replacement
    • Models early surrender, insurance, double, and split
    • Models the dealer hitting soft 17
    • Optimizes current-hand RTP under the contract's rules
    • Uses --solver-max-states to cap recursive search states
      (default 50000; raise for complex hands that fall back, lower to limit CPU)
    • Runs in a worker and uses --solver-timeout-ms to cap wall-clock latency
      (default 5000; timeout falls back to simple mode)

  max: Same exact EV solver as best, with higher default limits:
    • --solver-max-states 150000
    • --solver-timeout-ms 30000

  Manual solver suggestions:
    • --solver defaults to best and does not execute actions
    • --solver best and --solver max show both the worker choice and simple choice
  
  Commands:
    ${BINARY_NAME} blackjack 10 --auto              # One hand, auto-play
    ${BINARY_NAME} blackjack 10 --auto best         # Exact EV solver
    ${BINARY_NAME} blackjack 10 --auto max          # Exact EV solver, larger budget
    ${BINARY_NAME} blackjack 10 --auto best --solver-max-states 100000
    ${BINARY_NAME} blackjack 10 --auto best --solver-timeout-ms 3000
    ${BINARY_NAME} blackjack 10 --solver max        # Manual suggestions
    ${BINARY_NAME} blackjack 10 --auto --loop       # Continuous auto-play
    ${BINARY_NAME} blackjack 25 --side 1 --auto     # Auto-play with player side bet
  
  Strategy includes:
    • When to hit vs stand
    • When to double down
    • When to split pairs
    • When to surrender (if offered)
    • Insurance decisions from exact live EV
    • Opening side bets are independent from the in-hand auto solver

${'─'.repeat(70)}
  HI-LO NEBULA --auto
${'─'.repeat(70)}

  simple:
    • Banks the first available cashout
    • Otherwise picks the highest immediate hit rate

  best:
    • Uses the net-EV continuation solver
    • Subtracts future VRF fees from continuation value
    • Includes the live jackpot snapshot as the terminal bonus

  winston-ladder:
    • Plays up to two on-chain games with up to seven guesses each
    • Opens the first game with the highest hit-rate branch
    • Cashes the first game at 1.5x, otherwise compares continuing with
      banking and targeting the second game
    • The second game uses the same initial bet and targets 2.5x total
      payout across the ladder; VRF fees are ignored by the ladder target

  Commands:
    ${BINARY_NAME} hi-lo-nebula 10 --auto            # One run, auto-play
    ${BINARY_NAME} hi-lo-nebula 10 --auto best       # Net-EV solver
    ${BINARY_NAME} hi-lo-nebula 10 --auto winston-ladder
                                             # Two-game target ladder
    ${BINARY_NAME} hi-lo-nebula 10 --auto --loop     # Continuous auto-play
    ${BINARY_NAME} hi-lo-nebula 10 --solver          # Manual play with suggestions
    ${BINARY_NAME} hi-lo-nebula 10 --solver winston-ladder

${'─'.repeat(70)}
  CASH DASH --auto
${'─'.repeat(70)}

  simple:
    • Cashes out after the configured safe-row target
    • Otherwise picks a tile; hidden tiles are symmetric before reveal

  best:
    • Cashes out whenever continuation EV is dominated
    • Honors --cashout-after when you intentionally target deeper rows
    • Subtracts future VRF fees from continuation value

  Commands:
    ${BINARY_NAME} cash-dash 10 --auto                # One run, cash first safe row
    ${BINARY_NAME} cash-dash 10 --auto best           # Net-EV solver
    ${BINARY_NAME} cash-dash 10 --auto --cashout-after 3
    ${BINARY_NAME} cash-dash 10 --auto --loop         # Continuous auto-play
    ${BINARY_NAME} cash-dash 10 --solver              # Manual play with suggestions

${'─'.repeat(70)}
  VIDEO POKER --auto
${'─'.repeat(70)}

  simple:
    • Uses the existing priority-based hold strategy

  best:
    • Analyzes all 32 possible hold combinations
    • Enumerates all redraw outcomes
    • Picks the hold with highest expected value
    • Includes live jackpot bonus at max bet

  Commands:
    ${BINARY_NAME} video-poker 10 --auto            # One hand, auto-play
    ${BINARY_NAME} video-poker 10 --auto best       # Exact EV solver
    ${BINARY_NAME} video-poker 10 --auto --loop     # Continuous auto-play

${'─'.repeat(70)}
  STATELESS GAMES
${'─'.repeat(70)}

  Stateless games like Roulette, Plinko, etc. don't need stateful --auto because
  there are no mid-game decisions. Just use --loop for continuous play:
  
    ${BINARY_NAME} play roulette 10 RED --loop
    ${BINARY_NAME} play jungle-plinko 10 2 50 --loop

  The stateless use of --auto only selects a random stateless game/config:

    ${BINARY_NAME} play --auto

${'─'.repeat(70)}
  COMBINING WITH STRATEGIES
${'─'.repeat(70)}

  Auto-play works with all betting strategies:
  
    ${BINARY_NAME} blackjack 10 --auto --loop \\
      --bet-strategy martingale --max-bet 100 \\
      --take-profit 200 --stop-loss 50

${'─'.repeat(70)}
  TIMING EXAMPLE
${'─'.repeat(70)}

  For slower, less robotic pacing during loops:

    ${BINARY_NAME} play roulette 10 RED --loop --human
    ${BINARY_NAME} video-poker 10 --auto best --loop \\
      --delay 5 --human 2-17

${'─'.repeat(70)}
  DISPLAY MODES
${'─'.repeat(70)}

  --display full     ASCII card art (default for humans)
  --display simple   Text-only cards (less visual)
  --display json     Machine-readable (for AI agents)
  --json             Shortcut for --display json

${'═'.repeat(70)}
`,

  wallet: `
${'═'.repeat(70)}
  WALLET MANAGEMENT
${'═'.repeat(70)}

  Wallet selector:
    ${WALLET_FILE}

  Encrypted wallet entries:
    ${WALLETS_DIR}/<address>.json

  Config directory:
    ${APECHURCH_DIR}
    Override with ${CONFIG_DIR_ENV_VAR}.

  Security model in this hardened build:
    • The private key is stored only in encrypted form on disk
    • Signing happens only locally on this machine
    • No plaintext private key export is available
    • No unlock/session cache exists
    • Password is read from ${PASS_ENV_VAR} or prompted immediately before signing

${'─'.repeat(70)}
  SUPPORTED COMMANDS
${'─'.repeat(70)}

  ${BINARY_NAME} wallet status        Check wallet status
  ${BINARY_NAME} wallet new           Create and select a new wallet
  ${BINARY_NAME} wallet select [address]
                                   Select a stored wallet
  ${BINARY_NAME} wallet download [address]
                                   Download supported on-chain history into the local cache
  ${BINARY_NAME} wallet password      Re-encrypt the local wallet with a new password
  ${BINARY_NAME} wallet hints         View/update password hints
  ${BINARY_NAME} wallet reset         Delete local wallet data files

  Download examples:
    ${BINARY_NAME} wallet --list
    ${BINARY_NAME} wallet download
    ${BINARY_NAME} wallet download 0x1234...abcd --json
    ${BINARY_NAME} wallet download 0x1234...abcd --from-block 35000000 --to-block 35300000
    ${BINARY_NAME} wallet download 0x1234...abcd --from-block 0

  Download behavior:
    • If [address] is omitted, the local wallet address is used
    • Default sync is incremental from the cached last_synced_block + 1
    • Use --from-block 0 for a full backfill
    • Explicit backfills merge and deduplicate by contract + gameId
    • Gaps are not tracked automatically as ranges; backfill them explicitly

  Download options:
    --from-block <n>   Start block for sync or backfill
    --to-block <n>     End block (default latest)
    --chunk-size <n>   Block span per log query
    --json             Emit the machine-readable download report

  Download writes:
    ${path.join(APECHURCH_DIR, 'history')}/<wallet>_history.json

  History commands:
    ${BINARY_NAME} history --list
    ${BINARY_NAME} history [address]
    ${BINARY_NAME} history [address] --limit 25
    ${BINARY_NAME} history [address] --offline
    ${BINARY_NAME} history [address] --all
    ${BINARY_NAME} history [address] --stats
    ${BINARY_NAME} history [address] --leaderboard
    ${BINARY_NAME} history [address] --scoreboard
    ${BINARY_NAME} history [address] --scoreboard --ids
    ${BINARY_NAME} history [address] --scoreboard --url
    ${BINARY_NAME} history [address] --breakdown
    ${BINARY_NAME} history [address] --breakdown video-poker
    ${BINARY_NAME} history [address] --refresh
    ${BINARY_NAME} history [address] --refresh --from-block 0
    ${BINARY_NAME} scoreboard [address]
    ${BINARY_NAME} scoreboard [address] --ids
    ${BINARY_NAME} scoreboard [address] --url

  History stats output:
    🎰 Games                     Economically synced games included in totals
    💸 Contract fees paid        Fees effectively paid by the wallet
    ⛽️ Gas paid                  Network gas effectively paid by the wallet
    Net result                  Payout - wager - contract fees - gas
    ✌️ Win rate                 Wins / economically synced games
    🎲 RTP                      Total payout / total wagered
    🎟️  APE Wagered (wAPE)     Current online balance / total received on-chain
    🧮 Gimbo Points (GP)        Current online balance / total received on-chain
    🪜 Level rate               Every 10,000 GP = 1 Level

  History options:
    --list                     Show wallet addresses with local cached history files
    --limit <n>                Show N recent cached games (default 10)
    --all                      Show all cached games in the local file
    --ids                      Show game IDs in history lines and scoreboard tables
    --stats                    Show only aggregate history stats
    --leaderboard              Show weekly wAPE wagered totals
    --scoreboard               Append the cached wallet scoreboard
    --url                      Show scoreboard game URLs in terminal output
    --offline                  Read cache only; skip RPC enrichment and balances
    --breakdown [game]         Show the same stats split by game, optionally filtered
    --refresh                  Run wallet download first, then render
    --from-block <n>           Start block for --refresh
    --to-block <n>             End block for --refresh
    --chunk-size <n>           Block span per log query for --refresh
    --json                     Emit the cached report as JSON

  Coverage limits:
    • Economic totals only include games whose wager, payout, fees, gas, GP,
      and wAPE can be reconstructed exactly from on-chain data
    • Enumerates the games in the local registry that emit indexed GameEnded(user, ...)
    • Blackjack and Video Poker cannot be discovered from zero via raw RPC alone
    • Locally-saved Blackjack and Video Poker game IDs can still be rehydrated
      during refresh via getGameInfo
    • Sponsored transactions contribute zero contract fee and zero gas for the
      analyzed wallet

${'─'.repeat(70)}
  HISTORY FLOW
${'─'.repeat(70)}

  1. ${BINARY_NAME} wallet download [address]
     Syncs supported games from ApeChain into the local per-wallet file.

  2. ${BINARY_NAME} history [address]
     Reads that local file, shows recent games, and prints history stats.
     Use --offline to skip best-effort RPC enrichment and current balances.

  3. ${BINARY_NAME} history [address] --scoreboard
     Appends the cached wallet scoreboard to the history report.
     Use --url or --ids to add one reference column; if both are passed,
     the last option wins.

  4. ${BINARY_NAME} history [address] --leaderboard
     Shows weekly wAPE wagered totals grouped from Sunday 00:00 UTC.

  5. ${BINARY_NAME} history [address] --breakdown
     Adds a per-game split of the same economic stats.

  6. ${BINARY_NAME} history [address] --breakdown video-poker
     Restricts that split to one game family.

${'─'.repeat(70)}
  INSTALL / REINSTALL
${'─'.repeat(70)}

  Fresh install/reinstall prompts for the private key with hidden input:
    ${BINARY_NAME} install

  If ${WALLET_FILE} points to an encrypted wallet entry, install reuses
  that selected wallet and does not ask for the private key again.

  Optional non-interactive fallback:
    export ${PRIVATE_KEY_ENV_VAR}="0x..."

  In interactive installs, you will be asked for a wallet password.
  In non-interactive installs, ${PASS_ENV_VAR} is required.

${'─'.repeat(70)}
  PROFILE / USERNAME API
${'─'.repeat(70)}

  Default endpoint:
    https://www.ape.church/api/profile

  To override it locally:
    export ${PROFILE_URL_ENV_VAR}="https://your-endpoint.example/api/profile"

${'─'.repeat(70)}
  AUTOMATION
${'─'.repeat(70)}

  To avoid an interactive password prompt before each signature:
    export ${PASS_ENV_VAR}="your-password"

  Risk:
    • Environment variables remain local, but may still be exposed to other
      local processes/users depending on OS configuration.

${'─'.repeat(70)}
  IMPORTANT RISKS
${'─'.repeat(70)}

  • Forgetting the wallet password prevents local decryption/signing.
  • If you also lose the original private key, control of funds may be lost permanently.
  • ${BINARY_NAME} wallet reset irreversibly deletes local wallet data files.

${'═'.repeat(70)}
`,

  bucket: `
${'═'.repeat(70)}
  R2 BOT LOG MIRROR
${'═'.repeat(70)}

  Bot summary logs are always written locally first under ${LOG_DIR}.
  R2 mirroring is optional and best-effort. If R2 is not configured, if
  ${PASS_ENV_VAR} is not set during a bot run, or if upload fails, the local
  JSON log remains authoritative and the bot continues.

  Encrypted R2 entries:
    ${R2_DIR}/<bucket>.json

  Current selector:
    ${R2_DIR}/current.json

${'─'.repeat(70)}
  CONFIGURE
${'─'.repeat(70)}

  ${BINARY_NAME} bucket install <bucket>
    Prompts with hidden input for:
      • ${PASS_ENV_VAR}-compatible encryption password
      • API token
      • Secret access key

    Prompts in clear text for:
      • Account ID
      • Access key ID

  ${BINARY_NAME} bucket reinstall <bucket>
    Rewrites the encrypted bucket entry and enables it.

  install/reinstall auto-enable the installed bucket.

  Non-interactive install/reinstall fallbacks:
    ${R2_NAME_ENV_VAR} (bucket name)
    ${R2_ACCOUNT_ID_ENV_VAR}
    ${R2_TOKEN_ENV_VAR}
    ${R2_KEY_ENV_VAR}
    ${R2_SECRET_ENV_VAR}
    ${PASS_ENV_VAR}

${'─'.repeat(70)}
  OPERATE
${'─'.repeat(70)}

  ${BINARY_NAME} bucket status
  ${BINARY_NAME} bucket list
  ${BINARY_NAME} bucket status -v
  ${BINARY_NAME} bucket list -v
  ${BINARY_NAME} bucket enable <bucket>
  ${BINARY_NAME} bucket disable

  enable writes the current selector so future bot runs mirror logs to the
  stored bucket. It does not decrypt or print credentials.

  disable removes only the current selector so future bot runs stop R2
  mirroring. Encrypted bucket entries are preserved and can be enabled again.

  Normal status/list output and enable/disable never reveal account IDs, API tokens,
  access key IDs, or secret access keys.

  status -v and list -v intentionally decrypt with ${PASS_ENV_VAR} or an
  interactive password prompt, then print R2 API endpoints and fallback
  environment values for each shown bucket entry.

${'─'.repeat(70)}
  REMOTE PATHS
${'─'.repeat(70)}

  Object keys mirror the local path relative to ${LOG_DIR}.

  Local:
    ${LOG_DIR}/bob/bob.20260706120000.json

  Remote:
    <prefix>/bob/bob.20260706120000.json

  Set ${R2_PREFIX_ENV_VAR} to choose <prefix>. Leading and trailing slashes
  are ignored.

${'═'.repeat(70)}
`,

  history: `
${'═'.repeat(70)}
  HISTORY CACHE & REPORTING
${'═'.repeat(70)}

  The history system has two steps:
    • ${BINARY_NAME} wallet download [address]
      Reconstruct supported game history from ApeChain and write the local file.
    • ${BINARY_NAME} history [address]
      Read that local file offline and render recent games + history stats.

${'─'.repeat(70)}
  FILES
${'─'.repeat(70)}

  Per-wallet history files are stored at:
    ${path.join(APECHURCH_DIR, 'history')}/<wallet>_history.json

  Override the config/data root with ${CONFIG_DIR_ENV_VAR}.

  The local wallet address is used automatically if you omit [address].

  Games options:
    --stats                    Append the full Game Stats catalog after the game summary
    --json                     Emit the game registry as JSON

${'─'.repeat(70)}
  COMMON COMMANDS
${'─'.repeat(70)}

  ${BINARY_NAME} wallet download
  ${BINARY_NAME} wallet download 0x1234...abcd --from-block 35000000 --to-block 35300000
  ${BINARY_NAME} wallet download 0x1234...abcd --from-block 0
  ${BINARY_NAME} history
  ${BINARY_NAME} history --limit 25
  ${BINARY_NAME} history --offline
  ${BINARY_NAME} history --all
  ${BINARY_NAME} history --stats
  ${BINARY_NAME} history --leaderboard
  ${BINARY_NAME} history --scoreboard
  ${BINARY_NAME} history --scoreboard --ids
  ${BINARY_NAME} history --scoreboard --url
  ${BINARY_NAME} history --breakdown
  ${BINARY_NAME} history --breakdown jungle
  ${BINARY_NAME} history --refresh
  ${BINARY_NAME} scoreboard
  ${BINARY_NAME} scoreboard --ids
  ${BINARY_NAME} scoreboard --url

${'─'.repeat(70)}
  OUTPUT MODES
${'─'.repeat(70)}

  Default:
    • Recent cached games from the local file (10 by default)
    • Aggregate history stats
    • Compact game status split by game

  --limit <n>:
    • Increase or shrink the recent-games slice

  --all:
    • Show every cached game in the local file

  --stats:
    • Only aggregate history stats

  --offline:
    • Reads the local history file only
    • Skips RPC variant enrichment and current GP/wAPE balances
    • Cannot be combined with --refresh

  --scoreboard:
    • Appends the cached wallet leaderboard derived from history
    • Shows Highest Multipliers and Biggest Payouts top-20 tables
    • --url shows game links, --ids shows game IDs
    • If both are passed, the last option wins

  --leaderboard:
    • Shows Global plus weekly wAPE wagered totals
    • Weeks are grouped from Sunday 00:00 UTC and listed newest first

  --breakdown:
    • Per-game split of the same stats
    • If you pass [game], only rows for that game are shown

  --refresh:
    • Runs wallet download first, then reads the updated local file

  --json:
    • Returns wallet, file metadata, aggregate stats, optional breakdown,
      optional scoreboard, refresh metadata, and rendered game entries

${'─'.repeat(70)}
  ECONOMIC FIELDS
${'─'.repeat(70)}

  Contract fees paid:
    Fees effectively paid by the analyzed wallet, excluding network gas.

  Gas paid:
    Network gas effectively paid by the analyzed wallet.

  Net result:
    payout - wager - contract fees - gas

  RTP:
    total payout / total wagered

  wAPE / GP:
    current on-chain wallet balance / total received from synced games

${'─'.repeat(70)}
  SYNC BEHAVIOR
${'─'.repeat(70)}

  • If [address] is omitted, the local wallet address is used.
  • wallet download is incremental by default from the cached
    last_synced_block + 1.
  • Use --from-block 0 for a full backfill.
  • Explicit backfills merge and deduplicate by contract + gameId.
  • Gaps are not tracked automatically as synced ranges; fill them with
    explicit backfill commands when needed.

${'─'.repeat(70)}
  LIMITS
${'─'.repeat(70)}

  • Only games that can be reconstructed exactly from on-chain data are
    included in economic totals.
  • Blackjack and Video Poker entries may exist in the local file with only
    contract, gameId, and timestamp until a generic on-chain fetch path exists.
  • Sponsored transactions count as zero contract fee and zero gas for the
    analyzed wallet.

${'═'.repeat(70)}
`,

  house: `
${'═'.repeat(70)}
  THE HOUSE - Be the Casino
${'═'.repeat(70)}

  The House is a decentralized liquidity pool that backs all games.
  When you deposit, you become "the house" and share in player outcomes.
  
  • Players win → House loses (you lose proportionally)
  • Players lose → House wins (you earn proportionally)
  • Long-term: House has mathematical edge (~2-10% depending on game)

${'─'.repeat(70)}
  CHECK STATUS
${'─'.repeat(70)}

  ${BINARY_NAME} house
  
  Shows:
    • Total House liquidity
    • Your HOUSE tokens (your share)
    • Your APE equivalent value
    • Unlock status (15-min lock after deposit)
    • Your all-time profits/losses

${'─'.repeat(70)}
  DEPOSIT
${'─'.repeat(70)}

  ${BINARY_NAME} house deposit <amount>
  
  Example: ${BINARY_NAME} house deposit 100
  
  • You send APE, receive HOUSE tokens
  • HOUSE tokens = your share of the pool
  • 15-MINUTE LOCK after deposit (prevents flash-loan attacks)
  • Price fluctuates based on House P&L

${'─'.repeat(70)}
  WITHDRAW
${'─'.repeat(70)}

  ${BINARY_NAME} house withdraw <amount>
  
  Example: ${BINARY_NAME} house withdraw 50
  
  • Burns HOUSE tokens, returns APE
  • 2% WITHDRAWAL FEE (protocol revenue)
  • Must be unlocked (15 min after last deposit)
  • Amount is in APE, not HOUSE tokens

${'─'.repeat(70)}
  RISK PROFILE
${'─'.repeat(70)}

  Being the House is NOT risk-free:
  
  ✓ Long-term edge: Games favor the house mathematically
  ✗ Short-term variance: Lucky players can hurt the pool
  ✗ 2% fee on withdrawals
  ✗ 15-min lock (can't exit immediately)
  
  Good for: Long-term passive income, believers in the protocol
  Bad for: Short-term traders, risk-averse investors

${'─'.repeat(70)}
  HOW PRICING WORKS
${'─'.repeat(70)}

  HOUSE token price = Total APE in House / Total HOUSE supply
  
  • If players lose → APE increases → HOUSE price goes UP
  • If players win → APE decreases → HOUSE price goes DOWN
  
  Your position value = Your HOUSE tokens × Current price

${'─'.repeat(70)}
  YIELD VS APY
${'─'.repeat(70)}

  • "House Yield" shown by apechurch-cli house is the current HOUSE token
    price multiplier from calculatePrice(), displayed as gain/loss
    since launch. It is NOT an annualized APY.
  • For planning, this repo uses a working long-run blended house-edge
    assumption of about 3%, with 2% and 5% as useful sensitivity bounds.
  • Gross expected annual return is approximately:
      annual wager volume / average house liquidity x house edge
  • Example: 10x annual turnover on average house liquidity and a 3%
    blended edge implies about 30% gross annual return before variance
    and exit fees.

${'═'.repeat(70)}
`,

  commands: `
${'═'.repeat(70)}
  COMMAND HELP
${'═'.repeat(70)}

  Every top-level command has its own inline reference:

    ${BINARY_NAME} <command> --help

  Each command help is structured with:
    • Actions
    • Parameters
    • Options
    • Grammar (BNF)
    • Examples
    • Notes

${'─'.repeat(70)}
  COMMON ENTRY POINTS
${'─'.repeat(70)}

  ${BINARY_NAME} --help
  ${BINARY_NAME} commands
  ${BINARY_NAME} wallet --help
  ${BINARY_NAME} bucket --help
  ${BINARY_NAME} play --help
  ${BINARY_NAME} bot --help
  ${BINARY_NAME} history --help
  ${BINARY_NAME} blackjack --help
  ${BINARY_NAME} cash-dash --help
  ${BINARY_NAME} hi-lo-nebula --help
  ${BINARY_NAME} video-poker --help

${'═'.repeat(70)}
`,
};

program
  .command('help [topic]')
  .description('Get detailed help on a topic (loop, strategies, auto, wallet, bucket, history, house, commands)')
  .option('--json', 'JSON output')
  .addHelpText('after', formatHelpCommandAppendix())
  .action((topic, opts) => {
    const topics = Object.keys(HELP_TOPICS);
    
    if (!topic) {
      // List available topics
      if (opts.json) {
        console.log(JSON.stringify({ topics }));
        return;
      }
      console.log(`
${'═'.repeat(60)}
  HELP TOPICS
${'═'.repeat(60)}

  ${BINARY_NAME} help loop         Loop mode and safety controls
  ${BINARY_NAME} help strategies   Betting strategies in detail
  ${BINARY_NAME} help auto         Auto-play for Blackjack/Video Poker
  ${BINARY_NAME} help wallet       Wallet security and encryption
  ${BINARY_NAME} help bucket       Encrypted R2 bot log mirror setup
  ${BINARY_NAME} help history      History download, cache, and reporting
  ${BINARY_NAME} help house        The House staking system
  ${BINARY_NAME} help commands     Command-specific inline help workflow

  Also see:
    ${BINARY_NAME} commands        Compact command index
    ${BINARY_NAME} games           List all games
    ${BINARY_NAME} game <name>     Detailed game info

${'═'.repeat(60)}
`);
      return;
    }
    
    const key = topic.toLowerCase().trim();
    const content = HELP_TOPICS[key];
    
    if (!content) {
      if (opts.json) {
        console.log(JSON.stringify({ error: `Unknown topic: ${topic}`, available: topics }));
      } else {
        console.log(`\n❌ Unknown topic: "${topic}"\n\nAvailable topics: ${topics.join(', ')}\n`);
      }
      return;
    }
    
    if (opts.json) {
      console.log(JSON.stringify({ topic: key, content: content.trim() }));
    } else {
      console.log(content);
    }
  });

// ============================================================================
// COMMAND: SEND (Transfer assets)
// ============================================================================
program
  .command('send <asset> <amount> <destination>')
  .description('Send APE or GP to an address')
  .option('--json', 'JSON output only')
  .addHelpText('after', formatSendHelpAppendix())
  .action(async (asset, amount, destination, opts) => {
    // Validate destination address
    const dest = destination.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(dest)) {
      const error = { error: 'Invalid destination address. Must be a valid Ethereum address (0x...)' };
      if (opts.json) console.log(JSON.stringify(error));
      else console.error('\n❌ Invalid destination address. Must be a valid Ethereum address (0x...)\n');
      process.exit(1);
    }

    const assetUpper = asset.toUpperCase();
    if (assetUpper === 'WAPE') {
      const error = { error: `wAPE: contract ${WAPE_TOKEN_CONTRACT} does not support a transfer() function` };
      if (opts.json) console.log(JSON.stringify(error));
      else console.error(`\n❌ ${error.error}\n`);
      process.exit(1);
    }

    if (!['APE', 'GP'].includes(assetUpper)) {
      const error = { error: `Unsupported asset: ${asset}. Supported: APE, GP` };
      if (opts.json) console.log(JSON.stringify(error));
      else console.error(`\n❌ Unsupported asset: ${asset}. Supported: APE, GP\n`);
      process.exit(1);
    }

    const account = await getWalletWithPrompt({ json: opts.json });
    const { publicClient, walletClient } = createClients(account);

    // Handle different assets
    if (assetUpper === 'APE') {
      // --- APE (Native currency) ---
      let amountWei;
      try {
        amountWei = parseEther(amount);
        if (amountWei <= 0n) throw new Error('Amount must be positive');
      } catch (error) {
        const err = { error: `Invalid amount: ${amount}` };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error(`\n❌ Invalid amount: ${amount}\n`);
        process.exit(1);
      }

      // Check balance
      let balance;
      try {
        balance = await getBalanceWithRetry(publicClient, account.address);
      } catch (error) {
        const err = { error: 'Failed to fetch balance' };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error('\n❌ Failed to fetch balance\n');
        process.exit(1);
      }

      // Estimate gas for transfer
      const gasPrice = await publicClient.getGasPrice();
      const estimatedGas = 21000n;
      const gasCost = gasPrice * estimatedGas;
      const totalNeeded = amountWei + gasCost;

      if (balance < totalNeeded) {
        const balanceApe = parseFloat(formatEther(balance)).toFixed(4);
        const neededApe = parseFloat(formatEther(totalNeeded)).toFixed(4);
        const error = { error: `Insufficient balance. Have: ${balanceApe} APE, Need: ${neededApe} APE (including gas)` };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error(`\n❌ Insufficient balance. Have: ${balanceApe} APE, Need: ${neededApe} APE (including gas)\n`);
        process.exit(1);
      }

      if (!opts.json) {
        console.log(`\n📤 Sending ${amount} APE to ${dest.slice(0, 6)}...${dest.slice(-4)}\n`);
      }

      // Send native transfer
      let txHash;
      try {
        txHash = await walletClient.sendTransaction({
          to: dest,
          value: amountWei,
        });
      } catch (error) {
        const err = { error: `Transaction failed: ${error.message}` };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error(`\n❌ Transaction failed: ${error.message}\n`);
        process.exit(1);
      }

      // Wait for confirmation
      let receipt;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30000 });
      } catch {
        const result = { status: 'pending', asset: 'APE', amount, destination: dest, tx: txHash };
        if (opts.json) console.log(JSON.stringify(result));
        else console.log(`⏳ Transaction sent but confirmation pending\n   TX: ${txHash}\n`);
        return;
      }

      const success = receipt.status === 'success';
      const result = { status: success ? 'success' : 'failed', asset: 'APE', amount, destination: dest, tx: txHash, gasUsed: receipt.gasUsed.toString() };

      if (opts.json) {
        console.log(JSON.stringify(result));
      } else if (success) {
        console.log(`✅ Sent ${amount} APE to ${dest.slice(0, 6)}...${dest.slice(-4)}`);
        console.log(`   TX: ${txHash}\n`);
      } else {
        console.log(`❌ Transaction failed\n   TX: ${txHash}\n`);
      }

    } else if (assetUpper === 'GP') {
      // --- GP (Gimbo Points - 0 decimals) ---
      if (GP_TOKEN_CONTRACT === ZERO_ADDRESS) {
        const error = { error: 'GP token contract not configured' };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error('\n❌ GP token contract not configured\n');
        process.exit(1);
      }

      // GP has 0 decimals - amount is a whole number
      let amountGP;
      try {
        amountGP = BigInt(Math.floor(parseFloat(amount)));
        if (amountGP <= 0n) throw new Error('Amount must be positive');
      } catch (error) {
        const err = { error: `Invalid GP amount: ${amount}. GP must be a whole number (0 decimals).` };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error(`\n❌ Invalid GP amount: ${amount}. GP must be a whole number (0 decimals).\n`);
        process.exit(1);
      }

      // Check GP balance using getCurrentEXP
      let gpBalance;
      try {
        gpBalance = await publicClient.readContract({
          address: GP_TOKEN_CONTRACT,
          abi: GP_TOKEN_ABI,
          functionName: 'getCurrentEXP',
          args: [account.address],
        });
      } catch (error) {
        const err = { error: 'Failed to fetch GP balance' };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error('\n❌ Failed to fetch GP balance\n');
        process.exit(1);
      }

      if (gpBalance < amountGP) {
        const error = { error: `Insufficient GP balance. Have: ${gpBalance.toString()} GP, Need: ${amountGP.toString()} GP` };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error(`\n❌ Insufficient GP balance. Have: ${gpBalance.toString()} GP, Need: ${amountGP.toString()} GP\n`);
        process.exit(1);
      }

      // Check APE for gas
      let apeBalance;
      try {
        apeBalance = await getBalanceWithRetry(publicClient, account.address);
      } catch (error) {
        const err = { error: 'Failed to fetch APE balance for gas' };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error('\n❌ Failed to fetch APE balance for gas\n');
        process.exit(1);
      }

      const gasPrice = await publicClient.getGasPrice();
      const estimatedGas = 65000n; // ERC20 transfer typically uses ~60k gas
      const gasCost = gasPrice * estimatedGas;

      if (apeBalance < gasCost) {
        const gasCostApe = parseFloat(formatEther(gasCost)).toFixed(6);
        const error = { error: `Insufficient APE for gas. Need ~${gasCostApe} APE for transaction fee.` };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error(`\n❌ Insufficient APE for gas. Need ~${gasCostApe} APE for transaction fee.\n`);
        process.exit(1);
      }

      if (!opts.json) {
        console.log(`\n📤 Sending ${amountGP.toString()} GP to ${dest.slice(0, 6)}...${dest.slice(-4)}\n`);
      }

      // Send ERC20 transfer
      let txHash;
      try {
        txHash = await walletClient.writeContract({
          address: GP_TOKEN_CONTRACT,
          abi: GP_TOKEN_ABI,
          functionName: 'transfer',
          args: [dest, amountGP],
        });
      } catch (error) {
        const err = { error: `Transaction failed: ${error.message}` };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error(`\n❌ Transaction failed: ${error.message}\n`);
        process.exit(1);
      }

      // Wait for confirmation
      let receipt;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30000 });
      } catch {
        const result = { status: 'pending', asset: 'GP', amount: amountGP.toString(), destination: dest, tx: txHash };
        if (opts.json) console.log(JSON.stringify(result));
        else console.log(`⏳ Transaction sent but confirmation pending\n   TX: ${txHash}\n`);
        return;
      }

      const success = receipt.status === 'success';
      const result = { status: success ? 'success' : 'failed', asset: 'GP', amount: amountGP.toString(), destination: dest, tx: txHash, gasUsed: receipt.gasUsed.toString() };

      if (opts.json) {
        console.log(JSON.stringify(result));
      } else if (success) {
        console.log(`✅ Sent ${amountGP.toString()} GP to ${dest.slice(0, 6)}...${dest.slice(-4)}`);
        console.log(`   TX: ${txHash}\n`);
      } else {
        console.log(`❌ Transaction failed\n   TX: ${txHash}\n`);
      }

    }
  });

// ============================================================================
// COMMAND: HOUSE (The House - staking/liquidity)
// ============================================================================
program
  .command('house [action] [amount]')
  .description('The House - stake APE, earn from player losses')
  .option('--json', 'JSON output only')
  .addHelpText('after', formatHouseHelpAppendix())
  .action(async (action, amount, opts) => {
    const { publicClient } = createClients();

    // Helper to format time remaining
    function formatTimeRemaining(seconds) {
      if (seconds <= 0) return 'Unlocked';
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')} remaining`;
    }

    // --- HOUSE STATUS (default action) ---
    if (!action || action === 'status' || action === 'info') {
      // Fetch global house stats
      let totalSupply, maxPayout, housePrice;
      try {
        [totalSupply, maxPayout, housePrice] = await Promise.all([
          publicClient.readContract({ address: HOUSE_CONTRACT, abi: HOUSE_ABI, functionName: 'totalSupply' }),
          publicClient.readContract({ address: HOUSE_CONTRACT, abi: HOUSE_ABI, functionName: 'maxPayout' }),
          publicClient.readContract({ address: HOUSE_CONTRACT, abi: HOUSE_ABI, functionName: 'calculatePrice' }),
        ]);
      } catch (error) {
        const err = { error: `Failed to fetch house stats: ${error.message}` };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error(`\n❌ Failed to fetch house stats\n`);
        process.exit(1);
      }

      const totalSupplyApe = parseFloat(formatEther(totalSupply));
      const maxPayoutApe = parseFloat(formatEther(maxPayout));
      const priceMultiplier = parseFloat(formatEther(housePrice));

      // Fetch user stats if wallet exists
      let userBalance = 0n, userProfits = 0n, timeUntilUnlock = 0n;
      let hasWallet = walletExists();
      if (hasWallet) {
        try {
          const account = await getWalletWithPrompt({ json: opts.json });
          [userBalance, userProfits, timeUntilUnlock] = await Promise.all([
            publicClient.readContract({ address: HOUSE_CONTRACT, abi: HOUSE_ABI, functionName: 'balanceOf', args: [account.address] }),
            publicClient.readContract({ address: HOUSE_CONTRACT, abi: HOUSE_ABI, functionName: 'getTotalProfits', args: [account.address] }),
            publicClient.readContract({ address: HOUSE_CONTRACT, abi: HOUSE_ABI, functionName: 'timeUntilUnlock', args: [account.address] }),
          ]);
        } catch {
          // User stats fetch failed, continue with defaults
        }
      }

      const userBalanceApe = parseFloat(formatEther(userBalance));
      const userProfitsApe = parseFloat(formatEther(userProfits));
      const lockSeconds = Number(timeUntilUnlock);

      const response = {
        total_staked: totalSupplyApe.toFixed(4),
        max_payout: maxPayoutApe.toFixed(4),
        house_yield: priceMultiplier.toFixed(6),
        user_balance: userBalanceApe.toFixed(4),
        user_profits: userProfitsApe.toFixed(4),
        time_until_unlock: lockSeconds,
        unlock_status: lockSeconds > 0 ? 'locked' : 'unlocked',
      };

      if (opts.json) {
        console.log(JSON.stringify(response));
      } else {
        console.log(`\n${formatHeader('The House', '🏠')}\n`);
        console.log(formatField('Total Staked', theme.staked(`${totalSupplyApe.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} APE`), 14));
        console.log(formatField('Max Payout', formatAmount(maxPayoutApe, 2), 14));
        const yieldPct = ((priceMultiplier - 1) * 100).toFixed(2);
        console.log(formatField('House Yield', `${theme.multiplier(`${priceMultiplier.toFixed(4)}x`)} ${theme.yield(`(+${yieldPct}% since launch)`)}`, 14));
        
        if (hasWallet && userBalanceApe > 0) {
          console.log(`\n   ${theme.subheader('Your Position:')}`);
          console.log(formatField('Staked', theme.staked(`${userBalanceApe.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} APE`), 14));
          const profitColor = userProfitsApe >= 0 ? theme.positive : theme.negative;
          console.log(formatField('Total Profit', profitColor(`${userProfitsApe >= 0 ? '+' : ''}${userProfitsApe.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} APE`), 14));
          console.log(formatField('Unlock', lockSeconds > 0 ? theme.locked(formatTimeRemaining(lockSeconds)) : theme.success('Unlocked'), 14));
        } else if (hasWallet) {
          console.log(`\n   ${theme.dim('You have no APE staked in The House.')}`);
          console.log(`   ${theme.dim('Run:')} ${theme.command(`${BINARY_NAME} house deposit <amount>`)}`);
        } else {
          console.log(`\n   ${theme.warning('No wallet found.')} ${theme.dim('Run:')} ${theme.command(`${BINARY_NAME} install`)}`);
        }
        console.log('');
      }
      return;
    }

    // --- DEPOSIT ---
    if (action === 'deposit') {
      if (!amount) {
        const error = { error: `Amount required. Usage: ${BINARY_NAME} house deposit <amount>` };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error(`\n❌ Amount required. Usage: ${BINARY_NAME} house deposit <amount>\n`);
        process.exit(1);
      }

      let depositWei;
      try {
        depositWei = parseEther(amount);
        if (depositWei <= 0n) throw new Error('Amount must be positive');
      } catch (error) {
        const err = { error: `Invalid amount: ${amount}` };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error(`\n❌ Invalid amount: ${amount}\n`);
        process.exit(1);
      }

      const account = await getWalletWithPrompt({ json: opts.json });
      const { publicClient: pc, walletClient } = createClients(account);

      // Check balance
      const balance = await getBalanceWithRetry(pc, account.address);
      const gasPrice = await pc.getGasPrice();
      const estimatedGas = 100000n;
      const gasCost = gasPrice * estimatedGas;

      if (balance < depositWei + gasCost) {
        const balanceApe = parseFloat(formatEther(balance)).toFixed(4);
        const error = { error: `Insufficient balance. Have: ${balanceApe} APE` };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error(`\n❌ Insufficient balance. Have: ${balanceApe} APE\n`);
        process.exit(1);
      }

      if (!opts.json) {
        console.log(`\n🏠 Depositing ${amount} APE to The House`);
        console.log('   ⚠️  15-minute lock period starts on deposit');
        console.log('   ⚠️  2% fee on withdrawal\n');
      }

      let txHash;
      try {
        txHash = await walletClient.writeContract({
          address: HOUSE_CONTRACT,
          abi: HOUSE_ABI,
          functionName: 'deposit',
          value: depositWei,
        });
      } catch (error) {
        const err = { error: `Deposit failed: ${error.message}` };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error(`\n❌ Deposit failed: ${error.message}\n`);
        process.exit(1);
      }

      // Wait for confirmation
      let receipt;
      try {
        receipt = await pc.waitForTransactionReceipt({ hash: txHash, timeout: 30000 });
      } catch {
        const result = { status: 'pending', action: 'deposit', amount, tx: txHash };
        if (opts.json) console.log(JSON.stringify(result));
        else console.log(`⏳ Deposit sent, confirmation pending\n   TX: ${txHash}\n`);
        return;
      }

      const success = receipt.status === 'success';
      const result = { status: success ? 'success' : 'failed', action: 'deposit', amount, tx: txHash };

      if (opts.json) {
        console.log(JSON.stringify(result));
      } else if (success) {
        console.log(`✅ Deposited ${amount} APE to The House`);
        console.log(`   TX: ${txHash}`);
        console.log(`   🔒 Unlocks in 15 minutes\n`);
      } else {
        console.log(`❌ Deposit failed\n   TX: ${txHash}\n`);
      }
      return;
    }

    // --- WITHDRAW ---
    if (action === 'withdraw') {
      if (!amount) {
        const error = { error: `Amount required. Usage: ${BINARY_NAME} house withdraw <amount>` };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error(`\n❌ Amount required. Usage: ${BINARY_NAME} house withdraw <amount>\n`);
        process.exit(1);
      }

      let withdrawWei;
      try {
        withdrawWei = parseEther(amount);
        if (withdrawWei <= 0n) throw new Error('Amount must be positive');
      } catch (error) {
        const err = { error: `Invalid amount: ${amount}` };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error(`\n❌ Invalid amount: ${amount}\n`);
        process.exit(1);
      }

      const account = await getWalletWithPrompt({ json: opts.json });
      const { publicClient: pc, walletClient } = createClients(account);

      // Check house balance and lock time
      let userBalance, timeUntilUnlock;
      try {
        [userBalance, timeUntilUnlock] = await Promise.all([
          pc.readContract({ address: HOUSE_CONTRACT, abi: HOUSE_ABI, functionName: 'balanceOf', args: [account.address] }),
          pc.readContract({ address: HOUSE_CONTRACT, abi: HOUSE_ABI, functionName: 'timeUntilUnlock', args: [account.address] }),
        ]);
      } catch (error) {
        const err = { error: 'Failed to fetch house balance' };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error('\n❌ Failed to fetch house balance\n');
        process.exit(1);
      }

      const lockSeconds = Number(timeUntilUnlock);
      if (lockSeconds > 0) {
        const error = { error: `Funds locked. ${formatTimeRemaining(lockSeconds)}` };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error(`\n❌ Funds locked. ${formatTimeRemaining(lockSeconds)}\n`);
        process.exit(1);
      }

      if (userBalance < withdrawWei) {
        const userBalanceApe = parseFloat(formatEther(userBalance)).toFixed(4);
        const error = { error: `Insufficient house balance. Have: ${userBalanceApe} APE staked` };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error(`\n❌ Insufficient house balance. Have: ${userBalanceApe} APE staked\n`);
        process.exit(1);
      }

      const withdrawApe = parseFloat(amount);
      const feeApe = withdrawApe * HOUSE_WITHDRAW_FEE;
      const receiveApe = withdrawApe - feeApe;

      if (!opts.json) {
        console.log(`\n🏠 Withdrawing ${amount} APE from The House`);
        console.log(`   Fee (2%):    ${feeApe.toFixed(4)} APE`);
        console.log(`   You receive: ${receiveApe.toFixed(4)} APE\n`);
      }

      let txHash;
      try {
        txHash = await walletClient.writeContract({
          address: HOUSE_CONTRACT,
          abi: HOUSE_ABI,
          functionName: 'withdraw',
          args: [withdrawWei],
        });
      } catch (error) {
        const err = { error: `Withdraw failed: ${error.message}` };
        if (opts.json) console.log(JSON.stringify(err));
        else console.error(`\n❌ Withdraw failed: ${error.message}\n`);
        process.exit(1);
      }

      // Wait for confirmation
      let receipt;
      try {
        receipt = await pc.waitForTransactionReceipt({ hash: txHash, timeout: 30000 });
      } catch {
        const result = { status: 'pending', action: 'withdraw', amount, fee: feeApe.toFixed(4), receive: receiveApe.toFixed(4), tx: txHash };
        if (opts.json) console.log(JSON.stringify(result));
        else console.log(`⏳ Withdraw sent, confirmation pending\n   TX: ${txHash}\n`);
        return;
      }

      const success = receipt.status === 'success';
      const result = { status: success ? 'success' : 'failed', action: 'withdraw', amount, fee: feeApe.toFixed(4), receive: receiveApe.toFixed(4), tx: txHash };

      if (opts.json) {
        console.log(JSON.stringify(result));
      } else if (success) {
        console.log(`✅ Withdrew ${receiveApe.toFixed(4)} APE (after 2% fee)`);
        console.log(`   TX: ${txHash}\n`);
      } else {
        console.log(`❌ Withdraw failed\n   TX: ${txHash}\n`);
      }
      return;
    }

    // Unknown action
    const error = { error: `Unknown action: ${action}. Use: deposit, withdraw, or no action for status` };
    if (opts.json) console.log(JSON.stringify(error));
    else console.error(`\n❌ Unknown action: ${action}\nUsage:\n  ${BINARY_NAME} house                  Show house stats\n  ${BINARY_NAME} house deposit <amt>    Deposit APE\n  ${BINARY_NAME} house withdraw <amt>   Withdraw APE\n`);
  });

// ============================================================================
// COMMAND: BLACKJACK (Stateful game)
// ============================================================================
program
  .command('blackjack [action] [amount]')
  .alias('bj')
  .description('Play Blackjack - interactive card game')
  .option('--game <id>', 'Specify game ID (for resume/action)')
  .option('--display <mode>', 'Display mode: full, simple, json')
  .option('--json', 'JSON output only')
  .option('-v, --verbose', 'Show technical progress logs')
  .option('--auto [mode]', 'Auto-play the hand')
  .option('--solver [mode]', 'Show suggested action in manual mode (simple, best, max; default best)')
  .option('--side <ape>', 'Player side bet amount')
  .option('--solver-max-states <n>', 'Best-EV search state cap for --auto/--solver best/max (defaults 50000/150000)')
  .option('--solver-timeout-ms <ms>', 'Best-EV worker timeout for --auto/--solver best/max (defaults 5000/30000)')
  .option('--delay <seconds>', 'Fixed delay between looped games')
  .option('--resilient', 'Retry transient network/RPC failures with conservative backoff')
  .option('--no-resilient', 'Disable inherited resilient retry mode')
  .addOption(new Option('--human [range]', 'Add humanized random timing (default 3-9s, e.g. 2-17); if --delay is set, it is added on top').hideHelp())
  .option('--loop', 'Keep playing until balance runs out')
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--take-profit <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--min-profit <ape>', 'Stop when session P&L reaches +this amount or better (use with --loop)')
  .option('--target-x <x>', 'Stop when a single game pays at least this multiplier (use with --loop)')
  .option('--target-profit <ape>', 'Stop when a single game pays at least this much APE (use with --loop)')
  .option('--retrace <ape>', 'Stop when a single game loses at least this much APE (use with --loop)')
  .option('--recover-loss <ape>', 'Arm when net session P&L reaches -<ape>; stop at break-even/profit (use with --loop)')
  .option('--giveback-profit <ape>', 'Arm when net session P&L reaches +<ape>; stop at break-even/loss (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .option('--max-loss <ape>', 'Stop when session P&L reaches -this amount or worse (use with --loop)')
  .option('--bankroll <ape>', 'Alias for --max-loss')
  .option('--bet-strategy <name>', 'Betting strategy: flat, martingale, reverse-martingale, fibonacci, dalembert, bankroll-fraction=<0..1>')
  .option('--max-bet <ape>', 'Maximum bet amount (safety cap for progressive strategies)')
  .option('--min-bet <ape>', 'Minimum bet amount floor for dynamic strategies')
  .option('--gp-ape <points>', 'Override GP earned per APE for this run')
  .addHelpText('after', formatStatefulCommandHelpAppendix('blackjack'))
  .action(async (action, amount, opts) => {
    return runStatefulGameCommand('blackjack', action, amount, opts);
  });

// ============================================================================
// COMMAND: CASH DASH (Stateful game)
// ============================================================================
program
  .command('cash-dash [action] [amount]')
  .alias('cashdash')
  .alias('dash')
  .description('Play Cash Dash ✔︎ - stateful death-tile ladder with cashout')
  .option('--game <id>', 'Specify game ID (for resume/action)')
  .option('--display <mode>', 'Display mode: full, simple, json')
  .option('--json', 'JSON output only')
  .option('-v, --verbose', 'Show technical progress logs')
  .option('--auto [mode]', 'Auto-play the run')
  .option('--solver', 'Show the best continuation suggestion in manual mode')
  .option('--tile <tile>', 'Opening tile: 1-7 or random; manual mode prompts when omitted')
  .option('--cashout-after <rows>', 'Auto-play cashes out after N safe rows')
  .option('--delay <seconds>', 'Fixed delay between looped games')
  .option('--resilient', 'Retry transient network/RPC failures with conservative backoff')
  .option('--no-resilient', 'Disable inherited resilient retry mode')
  .addOption(new Option('--human [range]', 'Add humanized random timing (default 3-9s, e.g. 2-17); if --delay is set, it is added on top').hideHelp())
  .option('--loop', 'Keep playing until balance runs out')
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--take-profit <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--min-profit <ape>', 'Stop when session P&L reaches +this amount or better (use with --loop)')
  .option('--target-x <x>', 'Stop when a single game pays at least this multiplier (use with --loop)')
  .option('--target-profit <ape>', 'Stop when a single game pays at least this much APE (use with --loop)')
  .option('--retrace <ape>', 'Stop when a single game loses at least this much APE (use with --loop)')
  .option('--recover-loss <ape>', 'Arm when net session P&L reaches -<ape>; stop at break-even/profit (use with --loop)')
  .option('--giveback-profit <ape>', 'Arm when net session P&L reaches +<ape>; stop at break-even/loss (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .option('--max-loss <ape>', 'Stop when session P&L reaches -this amount or worse (use with --loop)')
  .option('--bankroll <ape>', 'Alias for --max-loss')
  .option('--bet-strategy <name>', 'Betting strategy: flat, martingale, reverse-martingale, fibonacci, dalembert, bankroll-fraction=<0..1>')
  .option('--max-bet <ape>', 'Maximum bet amount (safety cap for progressive strategies)')
  .option('--min-bet <ape>', 'Minimum bet amount floor for dynamic strategies')
  .option('--gp-ape <points>', 'Override GP earned per APE for this run')
  .addHelpText('after', formatStatefulCommandHelpAppendix('cash-dash'))
  .action(async (action, amount, opts) => {
    return runStatefulGameCommand('cash-dash', action, amount, opts);
  });

// ============================================================================
// COMMAND: HI-LO NEBULA (Stateful game)
// ============================================================================
program
  .command('hi-lo-nebula [action] [amount]')
  .alias('hilonebula')
  .alias('hilo')
  .alias('nebula')
  .description('Play Hi-Lo Nebula ✔︎ - sequential higher/lower/same card streaks')
  .option('--game <id>', 'Specify game ID (for resume/action)')
  .option('--display <mode>', 'Display mode: full, simple, json')
  .option('--json', 'JSON output only')
  .option('-v, --verbose', 'Show technical progress logs')
  .option('--auto [mode]', 'Auto-play the run')
  .option('--solver [mode]', 'Show a continuation suggestion in manual mode')
  .option('--delay <seconds>', 'Fixed delay between looped games')
  .option('--resilient', 'Retry transient network/RPC failures with conservative backoff')
  .option('--no-resilient', 'Disable inherited resilient retry mode')
  .addOption(new Option('--human [range]', 'Add humanized random timing (default 3-9s, e.g. 2-17); if --delay is set, it is added on top').hideHelp())
  .option('--loop', 'Keep playing until balance runs out')
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--take-profit <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--min-profit <ape>', 'Stop when session P&L reaches +this amount or better (use with --loop)')
  .option('--target-x <x>', 'Stop when a single game pays at least this multiplier (use with --loop)')
  .option('--target-profit <ape>', 'Stop when a single game pays at least this much APE (use with --loop)')
  .option('--retrace <ape>', 'Stop when a single game loses at least this much APE (use with --loop)')
  .option('--recover-loss <ape>', 'Arm when net session P&L reaches -<ape>; stop at break-even/profit (use with --loop)')
  .option('--giveback-profit <ape>', 'Arm when net session P&L reaches +<ape>; stop at break-even/loss (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .option('--max-loss <ape>', 'Stop when session P&L reaches -this amount or worse (use with --loop)')
  .option('--bankroll <ape>', 'Alias for --max-loss')
  .option('--bet-strategy <name>', 'Betting strategy: flat, martingale, reverse-martingale, fibonacci, dalembert, bankroll-fraction=<0..1>')
  .option('--max-bet <ape>', 'Maximum bet amount (safety cap for progressive strategies)')
  .option('--min-bet <ape>', 'Minimum bet amount floor for dynamic strategies')
  .option('--gp-ape <points>', 'Override GP earned per APE for this run')
  .addHelpText('after', formatStatefulCommandHelpAppendix('hi-lo-nebula'))
  .action(async (action, amount, opts) => {
    return runStatefulGameCommand('hi-lo-nebula', action, amount, opts);
  });

// ============================================================================
// COMMAND: VIDEO POKER (Gimboz Poker - Stateful game)
// ============================================================================
program
  .command('video-poker [action] [amount]')
  .alias('vp')
  .description('Play Video Poker ✔︎ (Gimboz Poker) - Jacks or Better')
  .option('--game <id>', 'Specify game ID (for resume)')
  .option('--display <mode>', 'Display mode: full, simple, json')
  .option('--json', 'JSON output only')
  .option('-v, --verbose', 'Show technical progress logs')
  .option('--auto [mode]', 'Auto-play the hand')
  .option('--solver', 'Show best-EV hold suggestion in interactive video poker')
  .option('--delay <seconds>', 'Fixed delay between looped games')
  .option('--resilient', 'Retry transient network/RPC failures with conservative backoff')
  .option('--no-resilient', 'Disable inherited resilient retry mode')
  .addOption(new Option('--human [range]', 'Add humanized random timing (default 3-9s, e.g. 2-17); if --delay is set, it is added on top').hideHelp())
  .option('--loop', 'Keep playing until balance runs out')
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--take-profit <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--min-profit <ape>', 'Stop when session P&L reaches +this amount or better (use with --loop)')
  .option('--target-x <x>', 'Stop when a single game pays at least this multiplier (use with --loop)')
  .option('--target-profit <ape>', 'Stop when a single game pays at least this much APE (use with --loop)')
  .option('--retrace <ape>', 'Stop when a single game loses at least this much APE (use with --loop)')
  .option('--recover-loss <ape>', 'Arm when net session P&L reaches -<ape>; stop at break-even/profit (use with --loop)')
  .option('--giveback-profit <ape>', 'Arm when net session P&L reaches +<ape>; stop at break-even/loss (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .option('--max-loss <ape>', 'Stop when session P&L reaches -this amount or worse (use with --loop)')
  .option('--bankroll <ape>', 'Alias for --max-loss')
  .option('--bet-strategy <name>', 'Betting strategy: flat, martingale, reverse-martingale, fibonacci, dalembert, bankroll-fraction=<0..1>')
  .option('--max-bet <ape>', 'Maximum bet amount (safety cap for progressive strategies)')
  .option('--min-bet <ape>', 'Minimum bet amount floor for dynamic strategies')
  .option('--gp-ape <points>', 'Override GP earned per APE for this run')
  .addHelpText('after', formatStatefulCommandHelpAppendix('video-poker'))
  .action(async (action, amount, opts) => {
    return runStatefulGameCommand('video-poker', action, amount, opts);
  });

// ============================================================================
// PARSE
// ============================================================================
const topLevelVersionArgs = getTopLevelVersionArgs();
installJsonMetadataConsoleHooks();
installColorOutputMode();
if (topLevelVersionArgs.isJson) {
  printVersionJson();
  process.exit(0);
}

if (!topLevelVersionArgs.isVersionRequest) {
  printInvocationVersion();
}
await program.parseAsync(process.argv);

// Show update notification if available (after command completes)
if (notifier) {
  notifier.notify({
    isGlobal: true,
    message: `Update available: {currentVersion} → {latestVersion}\nRun: npm i -g ${PACKAGE_NAME}`,
  });
}
