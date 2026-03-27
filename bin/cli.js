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
 * │ wallet <action>  Wallet management (encrypted-only local signer)       │
 * │ profile <action> Profile management (show, set username/persona)        │
 * │ register         Register username on-chain via SIWE                    │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ GAMEPLAY                                                                │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ play [game] [amt] Play games (auto or manual, supports --loop)          │
 * │ bet <game> <amt>  Quick manual bet on specific game                     │
 * │ blackjack <amt>   Interactive blackjack (stateful, multi-step)          │
 * │ video-poker <amt> Interactive video poker (stateful, multi-step)        │
 * │ heartbeat         Check cooldown and play if ready (for cron/agents)    │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ INFORMATION                                                             │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ status           Show wallet balance and local state                    │
 * │ history          Show recent game history with outcomes                 │
 * │ games            List all available games                               │
 * │ game <name>      Detailed info about a specific game                    │
 * │ commands         Full help reference for all commands                   │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ TRANSFERS & STAKING                                                     │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ send <to> <amt>  Send APE to another address                            │
 * │ send gp <to>     Send GP (Gimbo Points) tokens                          │
 * │ house <action>   The House: deposit/withdraw/status (be the house)      │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ CONTESTS                                                                │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ contest          View and join agent competitions                       │
 * │ pause / resume   Control autonomous play for contests                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Data Storage:
 * - wallet.json       - Encrypted private key + public metadata
 * - profile.json      - Username, persona, preferences
 * - state.json        - Local stats, betting strategy state
 * - history.json      - Game history (last 1000 games)
 * - active_games.json - Unfinished stateful games
 *
 * @module bin/cli
 * @see {@link https://ape.church} - Ape Church website
 * @see {@link https://docs.ape.church} - Documentation
 */
import { Command, Option } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import updateNotifier from 'update-notifier';

// Check for updates (async, non-blocking, cached for 1 day)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const shouldShowUpdateNotifier = process.stdout.isTTY && process.stderr.isTTY && !process.argv.includes('--json');
const notifier = shouldShowUpdateNotifier
  ? updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 })
  : null;
import readline from 'readline';
import { formatEther, parseEther } from 'viem';

// --- Local modules ---
import {
  APECHURCH_DIR,
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
  GP_TOKEN_CONTRACT,
  GP_TOKEN_ABI,
  GP_DECIMALS,
  HOUSE_CONTRACT,
  HOUSE_ABI,
  HOUSE_LOCK_TIME,
  HOUSE_WITHDRAW_FEE,
  PACKAGE_NAME,
  BINARY_NAME,
  PASS_ENV_VAR,
  PROFILE_URL_ENV_VAR,
  PRIVATE_KEY_ENV_VAR,
} from '../lib/constants.js';
import {
  sanitizeError,
  formatApeAmount,
  ensureDir,
  addBigIntStrings,
  randomIntInclusive,
  parseNonNegativeInt,
} from '../lib/utils.js';
import { queueWinChimeFromWei } from '../lib/chime.js';
import { createLoopStats, formatLoopProgress, recordLoopGame } from '../lib/loop-stats.js';
import {
  getWallet,
  walletExists,
  createClients,
  loadWalletData,
  isWalletEncrypted,
  encryptWallet,
  getWalletHints,
  setWalletHints,
  createEncryptedWalletFromPrivateKey,
  rotateEncryptedWalletPassword,
  getConfiguredPrivateKey,
  getWalletAddress,
  getWalletPublicMetadata,
  promptSecret,
} from '../lib/wallet.js';
import {
  loadProfile,
  saveProfile,
  loadState,
  saveState,
  loadHistory,
  registerUsername,
  generateUsername,
  normalizeUsername,
  normalizeStrategy,
  getActiveGames,
  saveActiveGames,
  loadActiveGames,
} from '../lib/profile.js';
import {
  getStrategyConfig,
  applyProfileOverrides,
  calculateWager,
  selectGameAndConfig,
  computeCooldownMs,
} from '../lib/strategy.js';
import { playGame, resolveGame } from '../lib/games/index.js';
import { GAME_REGISTRY, listGames } from '../registry.js';
import { getStrategy, listStrategies, getStrategyNames, calculateNextBet } from '../lib/strategies/index.js';
import { fetchHistoryEntriesForContract, selectHistoryGames } from '../lib/history.js';
import {
  theme,
  formatPnL,
  formatBalance,
  formatAmount,
  formatField,
  formatYesNo,
  formatHeader,
  formatAddress,
  formatHistoryLine,
} from '../lib/theme.js';

// --- CLI Setup ---
const program = new Command();
const PACKAGE_VERSION = pkg.version || '0.0.0';

program.name(BINARY_NAME).version(PACKAGE_VERSION, '-v, --version', 'output the current version');
const GAME_LIST = listGames().join(' | ');

function printInvocationVersion() {
  console.error(`${BINARY_NAME} v${PACKAGE_VERSION}`);
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
  if (meta?.legacyPlaintext) {
    const message = `Legacy plaintext wallet detected. Run: ${BINARY_NAME} install to migrate it.`;
    if (opts.json) console.error(JSON.stringify({ error: message }));
    else console.error(`
❌ ${message}
`);
    process.exit(1);
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
  .addHelpText('after', `
Install:
  Fresh install/reinstall prompts securely for the private key (hidden input)

Environment:
  ${PRIVATE_KEY_ENV_VAR}   Optional fallback for non-interactive install/reinstall
  ${PASS_ENV_VAR}          Required for non-interactive install/signing; optional otherwise
  ${PROFILE_URL_ENV_VAR}   Optional override for the username/profile API endpoint
`)
  .action(async (opts) => {
    const isInteractive = !opts.quick && !opts.username;

    ensureDir(APECHURCH_DIR);

    const existingWallet = loadWalletData();
    let address;
    let createdOrMigratedWallet = false;

    async function collectPasswordForWalletFile() {
      const envPassword = process.env[PASS_ENV_VAR];
      if (envPassword) return envPassword;

      if (!process.stdin.isTTY || !process.stderr.isTTY) {
        console.error(`
❌ Secure password entry requires an interactive terminal.
   Fallback: set ${PASS_ENV_VAR} only if you must run ${BINARY_NAME} install non-interactively.
`);
        process.exit(1);
      }

      const password = await promptSecret('Set wallet password (input hidden): ');
      if (!password || password.length < 8) {
        console.error('\n❌ Password must be at least 8 characters\n');
        process.exit(1);
      }
      const confirm = await promptSecret('Confirm wallet password (input hidden): ');
      if (password !== confirm) {
        console.error('\n❌ Passwords do not match\n');
        process.exit(1);
      }
      return password;
    }

    async function collectHintsIfInteractive() {
      if (!isInteractive) return [];
      console.log('\nOptional password hints (stored locally, max 3, never the password itself):');
      const hints = [];
      for (let i = 1; i <= 3; i++) {
        const hint = await prompt(`Hint ${i}: `);
        if (hint.trim()) hints.push(hint.trim());
      }
      return hints;
    }

    async function collectPrivateKeyForWalletImport() {
      const envPrivateKey = getConfiguredPrivateKey();
      if (envPrivateKey) return envPrivateKey;

      if (!process.stdin.isTTY || !process.stderr.isTTY) {
        console.error(`
❌ Fresh install/reinstall requires an interactive terminal for secure private key entry.
   Fallback: set ${PRIVATE_KEY_ENV_VAR} only if you must run ${BINARY_NAME} install non-interactively.
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
        console.error('\n❌ Private key is required for a fresh install/reinstall.\n');
        process.exit(1);
      }

      return privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    }

    if (existingWallet && isWalletEncrypted()) {
      address = getWalletAddress();
      console.log(`
✅ Using existing encrypted wallet: ${address}`);
    } else if (existingWallet) {
      console.log('\n⚠️  Legacy plaintext wallet detected. Migrating it to encrypted-only storage.');
      const password = await collectPasswordForWalletFile();
      const hints = await collectHintsIfInteractive();
      const result = encryptWallet(password, hints);
      if (result.error) {
        console.error(`
❌ ${result.error}
`);
        process.exit(1);
      }
      address = result.address;
      createdOrMigratedWallet = true;
      console.log(`✅ Wallet migrated to encrypted-only storage: ${address}`);
    } else {
      const privateKey = await collectPrivateKeyForWalletImport();
      const password = await collectPasswordForWalletFile();
      const hints = await collectHintsIfInteractive();

      try {
        const result = createEncryptedWalletFromPrivateKey(privateKey, password, hints);
        address = result.address;
        createdOrMigratedWallet = true;
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
    const assetsDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../assets');
    const assetFiles = ['SKILL.md', 'HEARTBEAT.md', 'STRATEGY.md', 'skill.json'];
    for (const file of assetFiles) {
      const source = path.join(assetsDir, file);
      if (fs.existsSync(source)) {
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
    console.log(`  WALLET FILE:   ${WALLET_FILE}`);
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

    if (createdOrMigratedWallet && !process.env[PASS_ENV_VAR]) {
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
  .action(async (opts) => {
    if (!fs.existsSync(APECHURCH_DIR)) {
      console.log(`\nNo local ${BINARY_NAME} data found. Nothing to remove.\n`);
      return;
    }

    if (!opts.yes) {
      console.log('\n⚠️  This will delete:');
      console.log(`   - Wallet at ${WALLET_FILE}`);
      console.log(`   - Profile at ${APECHURCH_DIR}/profile.json`);
      console.log(`   - All local state and history`);
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
// COMMAND: WALLET
// ============================================================================
program
  .command('wallet <action>')
  .description('Wallet management (status, encrypt legacy wallet, rotate password, hints, reset)')
  .option('-y, --yes', 'Skip confirmation')
  .option('--json', 'JSON output')
  .action(async (action, opts) => {
    const unsupportedActions = new Set(['export', 'decrypt', 'unlock', 'lock']);
    if (unsupportedActions.has(action)) {
      const message = `${action} is disabled in this hardened build. Plaintext key export/storage and cached unlock sessions are not allowed.`;
      if (opts.json) console.log(JSON.stringify({ error: message }));
      else console.error(`
❌ ${message}
`);
      process.exit(1);
    }

    if (action === 'encrypt') {
      if (!walletExists()) {
        console.error(`
❌ No wallet found. Run: ${BINARY_NAME} install
`);
        process.exit(1);
      }
      if (isWalletEncrypted()) {
        console.error('\n❌ Wallet is already encrypted\n');
        process.exit(1);
      }

      console.log('\n🔐 Encrypt Legacy Wallet\n');
      console.log('   This migrates a legacy plaintext wallet to encrypted-only storage.');
      console.log('   The plaintext key will be replaced on disk by encrypted wallet material only.');
      console.log('   Forgot password = loss of signing access from this local setup.\n');

      const password = process.env[PASS_ENV_VAR] || await promptSecret('Set wallet password: ');
      if (!password || password.length < 8) {
        console.error('\n❌ Password must be at least 8 characters\n');
        process.exit(1);
      }
      if (!process.env[PASS_ENV_VAR]) {
        const confirm = await promptSecret('Confirm wallet password: ');
        if (password !== confirm) {
          console.error('\n❌ Passwords do not match\n');
          process.exit(1);
        }
      }

      console.log('\n   Set up to 3 password hints (optional, press Enter to skip):\n');
      const hints = [];
      for (let i = 1; i <= 3; i++) {
        const hint = await prompt(`   Hint ${i}: `);
        if (hint.trim()) hints.push(hint.trim());
      }

      const result = encryptWallet(password, hints);
      if (result.error) {
        console.error(`
❌ ${result.error}
`);
        process.exit(1);
      }

      console.log('\n✅ Wallet migrated to encrypted-only storage successfully!');
      console.log(`   Address: ${result.address}`);
      console.log(`   Wallet file: ${WALLET_FILE}\n`);
      return;
    }

    if (action === 'new-password') {
      if (!walletExists()) {
        const message = `No wallet found. Run: ${BINARY_NAME} install`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }
      if (!isWalletEncrypted()) {
        const message = `Wallet is not encrypted. Run: ${BINARY_NAME} wallet encrypt`;
        if (opts.json) console.log(JSON.stringify({ error: message }));
        else console.error(`\n❌ ${message}\n`);
        process.exit(1);
      }
      if (!process.stdin.isTTY || !process.stderr.isTTY) {
        const message = 'wallet new-password requires an interactive terminal for secure hidden prompts.';
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
        legacy_plaintext_wallet_detected: Boolean(meta?.legacyPlaintext),
        address: meta?.address || null,
        hints_count: meta?.hints?.length || 0,
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
        console.log(`   Legacy plaintext file:  ${payload.legacy_plaintext_wallet_detected ? 'Yes (migrate immediately)' : 'No'}`);
        console.log(`   Address:                ${payload.address || 'N/A'}`);
        console.log(`   Password hints:         ${payload.hints_count}`);
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

    console.log(`Unknown wallet action: ${action}`);
    console.log('Available: status, encrypt, new-password, hints, reset');
  });

// ============================================================================
// COMMAND: STATUS
// ============================================================================
program
  .command('status')
  .option('--json', 'Output JSON only')
  .action(async (opts) => {
    const account = await getWalletWithPrompt({ json: opts.json });
    const profile = loadProfile();
    const { publicClient } = createClients();

    let balance;
    try {
      balance = await publicClient.getBalance({ address: account.address });
    } catch (error) {
      const err = { error: `Failed to fetch balance: ${sanitizeError(error)}` };
      if (opts.json) console.log(JSON.stringify(err));
      else console.error('\n❌ ' + err.error + '\n');
      return;
    }

    // Fetch GP balance (Gimbo Points - 0 decimals)
    let gpBalance = 0n;
    try {
      if (GP_TOKEN_CONTRACT !== '0x0000000000000000000000000000000000000000') {
        gpBalance = await publicClient.readContract({
          address: GP_TOKEN_CONTRACT,
          abi: GP_TOKEN_ABI,
          functionName: 'getCurrentEXP',
          args: [account.address],
        });
      }
    } catch {
      // GP fetch failed, continue with 0
    }

    // Fetch House balance
    let houseBalance = 0n;
    try {
      houseBalance = await publicClient.readContract({
        address: HOUSE_CONTRACT,
        abi: HOUSE_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      });
    } catch {
      // House fetch failed, continue with 0
    }

    const balanceApe = parseFloat(formatEther(balance));
    const houseBalanceApe = parseFloat(formatEther(houseBalance));
    const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
    const canPlay = availableApe >= 1 && !profile.paused;

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
      can_play: canPlay,
    };

    if (opts.json) {
      console.log(JSON.stringify(response));
    } else {
      console.log(`\n${formatHeader('Ape Church Status', '🎰')}\n`);
      console.log(formatField('Address', formatAddress(response.address)));
      console.log(formatField('Balance', formatBalance(response.balance)));
      console.log(formatField('GP', theme.yellow(`${response.gp_balance} GP`)));
      if (houseBalanceApe > 0) {
        console.log(formatField('House', theme.staked(`${response.house_balance} APE`) + theme.dim(' (staked)')));
      }
      console.log(formatField('Available', formatBalance(response.available_ape)));
      console.log(formatField('Username', response.username ? theme.accent(response.username) : theme.dim('(not set)')));
      console.log(formatField('Persona', theme.value(response.persona)));
      console.log(formatField('Paused', response.paused ? theme.warning('Yes') : theme.success('No')));
      console.log(formatField('Can Play', formatYesNo(response.can_play)));
      console.log('');
    }
  });

// ============================================================================
// COMMAND: PAUSE / RESUME
// ============================================================================
program
  .command('pause')
  .description('Pause autonomous play')
  .action(() => {
    const profile = loadProfile();
    saveProfile({ ...profile, paused: true });
    console.log(JSON.stringify({ status: 'paused', message: 'Autonomous play paused.' }));
  });

program
  .command('resume')
  .description('Resume autonomous play')
  .action(() => {
    const profile = loadProfile();
    saveProfile({ ...profile, paused: false });
    console.log(JSON.stringify({ status: 'resumed', message: 'Autonomous play resumed.' }));
  });

// ============================================================================
// COMMAND: REGISTER
// ============================================================================
program
  .command('register')
  .description('Register or change username')
  .option('--username <name>', 'New username')
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
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
  .command('profile <action>')
  .description('Profile management (show, set)')
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
  .option('--referral <address>', 'Referral wallet address (who referred you)')
  .option('--card-display <mode>', 'Card display mode: full | simple | json')
  .option('--json', 'Output JSON')
  .action((action, opts) => {
    const profile = loadProfile();

    if (action === 'show') {
      if (opts.json) {
        console.log(JSON.stringify(profile));
      } else {
        console.log('\n📋 Profile\n');
        console.log(`   Username:     ${profile.username || '(not set)'}`);
        console.log(`   Persona:      ${profile.persona}`);
        console.log(`   Card Display: ${profile.cardDisplay || 'full'}`);
        console.log(`   Paused:       ${profile.paused ? 'Yes' : 'No'}`);
        console.log(`   Referral:     ${profile.referral || '(none)'}\n`);
      }
    } else if (action === 'set') {
      const updates = {};
      if (opts.persona) updates.persona = normalizeStrategy(opts.persona);
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
      
      const updated = saveProfile({ ...profile, ...updates });
      console.log(JSON.stringify({ status: 'updated', profile: updated }));
    } else {
      console.log(`Unknown action: ${action}. Use: show, set`);
    }
  });

// ============================================================================
// COMMAND: BET (Manual single bet)
// ============================================================================
program
  .command('bet')
  .requiredOption('--game <type>', GAME_LIST)
  .requiredOption('--amount <ape>', 'Wager amount')
  .option('--mode <0-4>', 'Plinko mode', '0')
  .option('--balls <1-100>', 'Plinko balls', '50')
  .option('--spins <1-15>', 'Slots spins', '10')
  .option('--bet <bet>', 'Roulette/Baccarat bet')
  .option('--range <5-95>', 'ApeStrong range', '50')
  .option('--picks <1-10>', 'Keno pick count', '5')
  .option('--numbers <nums>', 'Keno numbers (e.g., 1,7,13,25,40)')
  .option('--timeout <ms>', 'Max wait for result (0 = no wait)', '0')
  .action(async (opts) => {
    const account = await getWalletWithPrompt({ json: true });
    const { publicClient } = createClients();
    
    let balance;
    try {
      balance = await publicClient.getBalance({ address: account.address });
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
    
    try {
      const response = await playGame({
        account,
        game: opts.game,
        amountApe: opts.amount,
        mode: opts.mode,
        balls: opts.balls,
        spins: opts.spins,
        bet: opts.bet,
        range: opts.range,
        picks: opts.picks,
        numbers: opts.numbers,
        games: opts.games,
        timeoutMs,
        referral: profile.referral,
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
  .description('Play a game (random or specified)')
  .option('--game <name>', 'Game to play')
  .option('--amount <ape>', 'Amount to wager')
  .option('--mode <0-4>', 'Plinko mode')
  .option('--balls <1-100>', 'Plinko balls')
  .option('--spins <1-15>', 'Slots spins')
  .option('--bet <bet>', 'Roulette/Baccarat bet')
  .option('--range <5-95>', 'ApeStrong range')
  .option('--picks <1-10>', 'Keno pick count')
  .option('--numbers <nums>', 'Keno numbers (e.g., 1,7,13,25,40)')
  .option('--games <1-20>', 'Speed Keno game count (batching)')
  .option('--difficulty <0-4>', 'Bear-A-Dice difficulty (0=Easy, 4=Master)')
  .option('--rolls <1-5>', 'Bear-A-Dice roll count')
  .option('--strategy <name>', 'conservative | balanced | aggressive | degen')
  .option('--loop', 'Play continuously')
  .option('--delay <seconds>', 'Delay between games in loop', '3')
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--target <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .option('--bet-strategy <name>', 'Betting strategy: flat, martingale, reverse-martingale, fibonacci, dalembert')
  .option('--max-bet <ape>', 'Maximum bet amount (safety cap for progressive strategies)')
  .option('-v, --verbose', 'Show technical progress logs')
  .option('--json', 'JSON output only')
  .action(async (gameArg, amountArg, configArgs, opts) => {
    const account = await getWalletWithPrompt({ json: opts.json });
    const loopMode = Boolean(opts.loop);
    const delaySeconds = Math.max(parseFloat(opts.delay) || 3, 1);
    const delayMs = delaySeconds * 1000;
    
    // Parse and validate loop parameters
    const targetBalance = opts.target ? parseFloat(opts.target) : null;
    const stopLoss = opts.stopLoss ? parseFloat(opts.stopLoss) : null;
    const maxGames = opts.maxGames ? parseInt(opts.maxGames, 10) : null;
    const maxBet = opts.maxBet ? parseFloat(opts.maxBet) : null;
    
    // Validate numeric parameters
    if (opts.target !== undefined && (isNaN(targetBalance) || targetBalance <= 0)) {
      console.error(JSON.stringify({ error: `Invalid --target value: "${opts.target}". Must be a positive number (e.g., --target 200)` }));
      process.exit(1);
    }
    if (opts.stopLoss !== undefined && (isNaN(stopLoss) || stopLoss < 0)) {
      console.error(JSON.stringify({ error: `Invalid --stop-loss value: "${opts.stopLoss}". Must be a non-negative number (e.g., --stop-loss 50)` }));
      process.exit(1);
    }
    if (opts.maxGames !== undefined && (isNaN(maxGames) || maxGames <= 0)) {
      console.error(JSON.stringify({ error: `Invalid --max-games value: "${opts.maxGames}". Must be a positive integer (e.g., --max-games 20)` }));
      process.exit(1);
    }
    if (opts.maxBet !== undefined && (isNaN(maxBet) || maxBet <= 0)) {
      console.error(JSON.stringify({ error: `Invalid --max-bet value: "${opts.maxBet}". Must be a positive number (e.g., --max-bet 100)` }));
      process.exit(1);
    }
    
    // Validate logical constraints
    if (targetBalance !== null && stopLoss !== null && stopLoss >= targetBalance) {
      console.error(JSON.stringify({ error: `Invalid range: --stop-loss (${stopLoss}) must be less than --target (${targetBalance})` }));
      process.exit(1);
    }
    
    // Betting strategy setup
    const betStrategyName = opts.betStrategy || 'flat';
    const betStrategy = getStrategy(betStrategyName);
    if (!betStrategy) {
      console.error(JSON.stringify({ error: `Unknown betting strategy: "${betStrategyName}". Available: ${getStrategyNames()}` }));
      process.exit(1);
    }
    
    let startingBalance = null;
    let gamesPlayed = 0;
    let lastGameResult = null; // Track for betting strategy
    const loopStats = createLoopStats();

    const gameInput = gameArg || opts.game;
    const amountInput = amountArg || opts.amount;
    
    let fixedGame = null;
    if (gameInput) {
      fixedGame = resolveGame(gameInput);
      if (!fixedGame) {
        console.error(JSON.stringify({ error: `Unknown game: ${gameInput}. Available: ${GAME_LIST}` }));
        process.exit(1);
      }
    }
    
    // Parse positional config args based on game type
    let positionalConfig = {};
    if (fixedGame && configArgs && configArgs.length > 0) {
      if (fixedGame.type === 'plinko') {
        if (configArgs[0]) positionalConfig.mode = parseInt(configArgs[0]);
        if (configArgs[1]) positionalConfig.balls = parseInt(configArgs[1]);
      } else if (fixedGame.type === 'slots') {
        if (configArgs[0]) positionalConfig.spins = parseInt(configArgs[0]);
      } else if (fixedGame.type === 'roulette' || fixedGame.type === 'baccarat') {
        positionalConfig.bet = configArgs.join(',');
      } else if (fixedGame.type === 'apestrong') {
        if (configArgs[0]) positionalConfig.range = parseInt(configArgs[0]);
      } else if (fixedGame.type === 'keno') {
        // For keno: configArgs can be [picks] or [numbers] or [picks, numbers]
        // If first arg is a small number (1-10), treat as picks; otherwise as numbers
        if (configArgs[0]) {
          const first = configArgs[0];
          const num = parseInt(first);
          if (!isNaN(num) && num >= 1 && num <= 10 && !first.includes(',')) {
            positionalConfig.picks = num;
            if (configArgs[1]) positionalConfig.numbers = configArgs.slice(1).join(',');
          } else {
            // Treat as numbers
            positionalConfig.numbers = configArgs.join(',');
          }
        }
      } else if (fixedGame.type === 'speedkeno') {
        // For speed keno: configArgs can be [games], [games, picks], [games, numbers], etc.
        // First arg (1-20 without comma) = games, second (1-5 without comma) = picks, or numbers with comma
        if (configArgs[0]) {
          const first = configArgs[0];
          const num = parseInt(first);
          if (!isNaN(num) && num >= 1 && num <= 20 && !first.includes(',')) {
            positionalConfig.games = num;
            if (configArgs[1]) {
              const second = configArgs[1];
              const pickNum = parseInt(second);
              if (!isNaN(pickNum) && pickNum >= 1 && pickNum <= 5 && !second.includes(',')) {
                positionalConfig.picks = pickNum;
                if (configArgs[2]) positionalConfig.numbers = configArgs.slice(2).join(',');
              } else {
                positionalConfig.numbers = configArgs.slice(1).join(',');
              }
            }
          } else if (first.includes(',')) {
            // Treat as numbers
            positionalConfig.numbers = configArgs.join(',');
          }
        }
      } else if (fixedGame.type === 'beardice') {
        // For bear dice: configArgs can be [difficulty] or [difficulty, rolls]
        if (configArgs[0]) positionalConfig.difficulty = parseInt(configArgs[0]);
        if (configArgs[1]) positionalConfig.rolls = parseInt(configArgs[1]);
      } else if (fixedGame.type === 'monkeymatch') {
        // For monkey match: configArgs can be [mode] (1=Low Risk, 2=Normal Risk)
        if (configArgs[0]) positionalConfig.mode = parseInt(configArgs[0]);
      }
    }

    const profile = loadProfile();
    if (profile.paused) {
      const response = { action: 'play', status: 'skipped', reason: 'paused' };
      if (opts.json) console.log(JSON.stringify(response));
      else console.log(JSON.stringify(response, null, 2));
      return;
    }

    if (loopMode && !opts.json) {
      const gameInfo = fixedGame ? fixedGame.name : 'random games';
      const strategyInfo = betStrategyName !== 'flat' ? ` | Strategy: ${betStrategyName}` : '';
      const maxBetInfo = maxBet ? ` | Max bet: ${maxBet} APE` : '';
      console.log(`\n🔄 Loop mode: ${gameInfo} (${delaySeconds}s delay${strategyInfo}${maxBetInfo})`);
      if (targetBalance) console.log(`   🎯 Target: ${targetBalance} APE`);
      if (stopLoss) console.log(`   🛑 Stop-loss: ${stopLoss} APE`);
      if (maxGames) console.log(`   🏁 Max games: ${maxGames}`);
      console.log('─'.repeat(50));
    }

    async function playOnce(betOverride = null) {
      const state = loadState();
      const freshProfile = loadProfile();
      
      if (freshProfile.paused) {
        return { shouldStop: true, reason: 'paused', gameResult: null };
      }

      const strategy = normalizeStrategy(opts.strategy || freshProfile.persona);
      const strategyConfig = applyProfileOverrides(
        getStrategyConfig(strategy),
        freshProfile.overrides
      );

      const { publicClient } = createClients();
      let balance;
      try {
        balance = await publicClient.getBalance({ address: account.address });
      } catch (error) {
        console.error(JSON.stringify({ error: `Failed to fetch balance: ${sanitizeError(error)}` }));
        return { shouldStop: true, reason: 'balance_error', gameResult: null };
      }

      const balanceApe = parseFloat(formatEther(balance));
      const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);

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
        return { shouldStop: true, reason: 'insufficient_balance', gameResult: null };
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
          return { shouldStop: true, reason: 'invalid_amount', gameResult: null };
        }
        if (wagerApe > availableApe) {
          console.error(JSON.stringify({ error: `Insufficient balance. Available: ${availableApe.toFixed(4)} APE` }));
          return { shouldStop: true, reason: 'insufficient_balance', gameResult: null };
        }
      } else {
        wagerApe = calculateWager(availableApe, strategyConfig);
      }

      // Determine game and config
      let gameEntry;
      let gameConfig = {};
      
      if (fixedGame) {
        gameEntry = fixedGame;
        gameConfig = { ...positionalConfig };
      } else {
        const selection = selectGameAndConfig(strategyConfig);
        gameEntry = resolveGame(selection.game);
        gameConfig = { mode: selection.mode, balls: selection.balls, spins: selection.spins, bet: selection.bet, range: selection.range };
      }

      // Apply CLI opts/positional/strategy defaults
      if (gameEntry.type === 'plinko') {
        if (opts.mode !== undefined) gameConfig.mode = parseInt(opts.mode);
        else if (positionalConfig.mode !== undefined) gameConfig.mode = positionalConfig.mode;
        else if (gameConfig.mode === undefined) {
          const [min, max] = strategyConfig.plinko?.mode || [0, 4];
          gameConfig.mode = randomIntInclusive(min, max);
        }
        if (opts.balls !== undefined) gameConfig.balls = parseInt(opts.balls);
        else if (positionalConfig.balls !== undefined) gameConfig.balls = positionalConfig.balls;
        else if (gameConfig.balls === undefined) {
          const [min, max] = strategyConfig.plinko?.balls || [10, 100];
          gameConfig.balls = randomIntInclusive(min, max);
        }
      } else if (gameEntry.type === 'slots') {
        if (opts.spins !== undefined) gameConfig.spins = parseInt(opts.spins);
        else if (positionalConfig.spins !== undefined) gameConfig.spins = positionalConfig.spins;
        else if (gameConfig.spins === undefined) {
          const [min, max] = strategyConfig.slots?.spins || [1, 15];
          gameConfig.spins = randomIntInclusive(min, max);
        }
      } else if (gameEntry.type === 'roulette') {
        if (opts.bet) gameConfig.bet = opts.bet;
        else if (positionalConfig.bet) gameConfig.bet = positionalConfig.bet;
        else if (!gameConfig.bet) {
          const cfg = strategyConfig.roulette || { defaultBet: 'random' };
          gameConfig.bet = cfg.defaultBet === 'random' ? (Math.random() < 0.5 ? 'RED' : 'BLACK') : cfg.defaultBet;
        }
      } else if (gameEntry.type === 'baccarat') {
        if (opts.bet) gameConfig.bet = opts.bet;
        else if (positionalConfig.bet) gameConfig.bet = positionalConfig.bet;
        else if (!gameConfig.bet) {
          const cfg = strategyConfig.baccarat || { defaultBet: 'random' };
          gameConfig.bet = cfg.defaultBet === 'random' ? (Math.random() < 0.5 ? 'PLAYER' : 'BANKER') : cfg.defaultBet;
        }
      } else if (gameEntry.type === 'apestrong') {
        if (opts.range !== undefined) gameConfig.range = parseInt(opts.range);
        else if (positionalConfig.range !== undefined) gameConfig.range = positionalConfig.range;
        else if (gameConfig.range === undefined) {
          const [min, max] = strategyConfig.apestrong?.range || [40, 60];
          gameConfig.range = randomIntInclusive(min, max);
        }
      } else if (gameEntry.type === 'keno') {
        // Numbers first (if provided, picks is inferred)
        if (opts.numbers) gameConfig.numbers = opts.numbers;
        else if (positionalConfig.numbers) gameConfig.numbers = positionalConfig.numbers;
        // Pick count - infer from numbers if provided, otherwise use --picks or random
        if (gameConfig.numbers && gameConfig.numbers.toLowerCase() !== 'random') {
          // Infer picks from number of values provided
          gameConfig.picks = gameConfig.numbers.split(',').filter(s => s.trim()).length;
        } else if (opts.picks !== undefined) {
          gameConfig.picks = parseInt(opts.picks);
        } else if (positionalConfig.picks !== undefined) {
          gameConfig.picks = positionalConfig.picks;
        } else if (gameConfig.picks === undefined) {
          const [min, max] = strategyConfig.keno?.picks || [3, 6];
          gameConfig.picks = randomIntInclusive(min, max);
        }
      } else if (gameEntry.type === 'speedkeno') {
        // Number of games (batching)
        if (opts.games !== undefined) gameConfig.games = parseInt(opts.games);
        else if (positionalConfig.games !== undefined) gameConfig.games = positionalConfig.games;
        else if (gameConfig.games === undefined) {
          const [min, max] = strategyConfig.speedKeno?.games || [5, 10];
          gameConfig.games = randomIntInclusive(min, max);
        }
        // Numbers first (if provided, picks is inferred)
        if (opts.numbers) gameConfig.numbers = opts.numbers;
        else if (positionalConfig.numbers) gameConfig.numbers = positionalConfig.numbers;
        // Pick count - infer from numbers if provided, otherwise use --picks or random
        if (gameConfig.numbers && gameConfig.numbers.toLowerCase() !== 'random') {
          // Infer picks from number of values provided
          gameConfig.picks = gameConfig.numbers.split(',').filter(s => s.trim()).length;
        } else if (opts.picks !== undefined) {
          gameConfig.picks = parseInt(opts.picks);
        } else if (positionalConfig.picks !== undefined) {
          gameConfig.picks = positionalConfig.picks;
        } else if (gameConfig.picks === undefined) {
          const [min, max] = strategyConfig.speedKeno?.picks || [2, 4];
          gameConfig.picks = randomIntInclusive(min, max);
        }
      } else if (gameEntry.type === 'beardice') {
        // Difficulty (0-4, default to Easy=0 for safety)
        // Auto-play: 90% Easy, 10% Normal. Never Hard/Extreme/Master.
        if (opts.difficulty !== undefined) gameConfig.difficulty = parseInt(opts.difficulty);
        else if (positionalConfig.difficulty !== undefined) gameConfig.difficulty = positionalConfig.difficulty;
        else if (gameConfig.difficulty === undefined) {
          // 90% Easy, 10% Normal - never pick 2+ in auto-play
          gameConfig.difficulty = Math.random() < 0.9 ? 0 : 1;
        }
        // Number of rolls (1-5, but Extreme/Master capped at 3)
        // On Easy (0), allow more rolls since 5/6 win chance per roll
        if (opts.rolls !== undefined) gameConfig.rolls = parseInt(opts.rolls);
        else if (positionalConfig.rolls !== undefined) gameConfig.rolls = positionalConfig.rolls;
        else if (gameConfig.rolls === undefined) {
          const isEasy = gameConfig.difficulty === 0;
          const [min, max] = strategyConfig.bearDice?.rolls || (isEasy ? [1, 5] : [1, 2]);
          gameConfig.rolls = randomIntInclusive(min, max);
        }
        // Cap rolls at 3 for Extreme (3) and Master (4) - contract limit
        if (gameConfig.difficulty >= 3 && gameConfig.rolls > 3) {
          gameConfig.rolls = 3;
        }
      } else if (gameEntry.type === 'monkeymatch') {
        // Mode (1=Low Risk, 2=Normal Risk)
        if (opts.mode !== undefined) gameConfig.mode = parseInt(opts.mode);
        else if (positionalConfig.mode !== undefined) gameConfig.mode = positionalConfig.mode;
        else if (gameConfig.mode === undefined) {
          // 70% Low Risk, 30% Normal Risk for auto-play
          gameConfig.mode = Math.random() < 0.7 ? 1 : 2;
        }
        // Clamp to valid range
        if (gameConfig.mode < 1) gameConfig.mode = 1;
        if (gameConfig.mode > 2) gameConfig.mode = 2;
      }

      const wagerApeString = formatApeAmount(wagerApe);

      // Build description for human output
      let gameDesc = gameEntry.name;
      if (gameEntry.type === 'plinko') {
        gameDesc += ` (mode ${gameConfig.mode}, ${gameConfig.balls} balls)`;
      } else if (gameEntry.type === 'slots') {
        gameDesc += ` (${gameConfig.spins} spins)`;
      } else if (gameEntry.type === 'roulette' || gameEntry.type === 'baccarat') {
        gameDesc += ` — ${gameConfig.bet}`;
      } else if (gameEntry.type === 'apestrong') {
        gameDesc += ` (${gameConfig.range}% chance)`;
      } else if (gameEntry.type === 'keno') {
        gameDesc += ` (${gameConfig.picks} picks)`;
      } else if (gameEntry.type === 'speedkeno') {
        gameDesc += ` (${gameConfig.games} games, ${gameConfig.picks} picks)`;
      } else if (gameEntry.type === 'beardice') {
        const diffNames = ['Easy', 'Normal', 'Hard', 'Extreme', 'Master'];
        gameDesc += ` (${diffNames[gameConfig.difficulty] || 'Easy'}, ${gameConfig.rolls} rolls)`;
      } else if (gameEntry.type === 'monkeymatch') {
        const modeNames = { 1: 'Low Risk', 2: 'Normal Risk' };
        gameDesc += ` (${modeNames[gameConfig.mode] || 'Low Risk'})`;
      }

      // Human-friendly output: show what we're playing
      if (!opts.json) {
        console.log(`\n🎰 ${gameDesc}`);
        console.log(`   Betting ${parseFloat(wagerApeString).toFixed(2)} APE\n`);
      }

      try {
        const playResponse = await playGame({
          account,
          game: gameEntry.key,
          amountApe: wagerApeString,
          mode: gameConfig.mode,
          balls: gameConfig.balls,
          spins: gameConfig.spins,
          bet: gameConfig.bet,
          range: gameConfig.range,
          picks: gameConfig.picks,
          numbers: gameConfig.numbers,
          games: gameConfig.games,
          difficulty: gameConfig.difficulty,
          rolls: gameConfig.rolls,
          timeoutMs: 30000, // Wait up to 30s for result (usually 1-2s)
          referral: freshProfile.referral,
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

        // Output
        if (opts.json) {
          // Full JSON for agents/scripts
          console.log(JSON.stringify({
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
            } : null,
          }));
        } else {
          // Human-friendly output
          if (hasResult) {
            const payoutApe = parseFloat(playResponse.result.payout_ape);
            const wagerApeNum = parseFloat(wagerApeString);
            if (won) {
              console.log(`${theme.win('🎉 WON!')} ${theme.amount(`${wagerApeNum.toFixed(2)} APE`)} → ${theme.balance(`${payoutApe.toFixed(2)} APE`)} ${theme.positive(`(+${pnlApe.toFixed(2)} APE)`)}\n`);
              queueWinChimeFromWei({
                payoutWei: playResponse.result.payout_wei,
                wagerWei: playResponse.result.buy_in_wei,
                isJson: false,
              });
            } else if (payoutApe > 0) {
              // Partial loss - got some back
              const lostApe = Math.abs(pnlApe);
              console.log(`${theme.loss('❌ Lost')} ${theme.negative(`${lostApe.toFixed(2)} APE`)} ${theme.dim(`(${wagerApeNum.toFixed(2)} → ${payoutApe.toFixed(2)} APE)`)}\n`);
            } else {
              // Total loss
              console.log(`${theme.loss('❌ Lost')} ${theme.negative(`${wagerApeNum.toFixed(2)} APE`)} ${theme.dim('— better luck next time!')}\n`);
            }
          } else {
            // Result pending (rare - if event didn't fire in time)
            console.log(`${theme.pending('⏳ Pending')} — watch result: ${theme.command(playResponse.game_url)}\n`);
          }
        }

        // Return game result for betting strategy
        const gameResult = hasResult ? {
          won,
          bet: parseFloat(wagerApeString),
          payout: parseFloat(playResponse.result.payout_ape),
        } : null;
        
        return { shouldStop: false, gameResult, error: false };
      } catch (error) {
        if (opts.json) {
          console.error(JSON.stringify({ error: error.message }));
        } else {
          console.error(`\n❌ Error: ${error.message}\n`);
        }
        // Return error indicator - let loop decide whether to stop
        return { shouldStop: false, reason: 'error', gameResult: null, error: true };
      }
    }

    // Execute
    if (loopMode) {
      // Initialize betting strategy
      const baseBet = amountInput ? parseFloat(amountInput) : 10; // Default base bet
      let betStrategyState = betStrategy.init(baseBet, { maxBet });
      
      // Track consecutive errors - stop loop after 3 in a row
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 3;
      
      while (true) {
        // Check balance for target/stop-loss
        const { publicClient } = createClients();
        const balance = await publicClient.getBalance({ address: account.address });
        const balanceApe = parseFloat(formatEther(balance));
        const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
        
        // Track starting balance and validate parameters on first iteration
        if (startingBalance === null) {
          startingBalance = balanceApe;
          
          // Validate target is achievable (higher than current balance)
          if (targetBalance !== null && targetBalance <= balanceApe) {
            console.log(`\n⚠️  Target (${targetBalance} APE) is already reached! Current balance: ${balanceApe.toFixed(2)} APE`);
            console.log(`   Use a higher target or omit --target to play without a target.\n`);
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
        
        // Check target
        if (targetBalance !== null && balanceApe >= targetBalance) {
          const profit = balanceApe - startingBalance;
          console.log(`\n🎯 Target reached! Balance: ${balanceApe.toFixed(2)} APE (target: ${targetBalance} APE)`);
          console.log(`   Profit: +${profit.toFixed(2)} APE`);
          console.log(`   Games played: ${gamesPlayed}\n`);
          break;
        }
        
        // Check stop-loss
        if (stopLoss !== null && balanceApe <= stopLoss) {
          const loss = startingBalance - balanceApe;
          console.log(`\n🛑 Stop-loss hit! Balance: ${balanceApe.toFixed(2)} APE (limit: ${stopLoss} APE)`);
          console.log(`   Loss: -${loss.toFixed(2)} APE`);
          console.log(`   Games played: ${gamesPlayed}\n`);
          break;
        }
        
        // Check max games
        if (maxGames !== null && gamesPlayed >= maxGames) {
          break;
        }
        
        // Calculate next bet using betting strategy
        const { bet: nextBet, state: newState, capped } = calculateNextBet(
          betStrategy, betStrategyState, lastGameResult, 
          { maxBet, availableBalance: availableApe }
        );
        betStrategyState = newState;
        
        // Show bet info for progressive strategies
        if (!opts.json && betStrategyName !== 'flat') {
          const betInfo = capped ? ` (capped from ${betStrategyState.currentBet?.toFixed(2) || nextBet.toFixed(2)})` : '';
          console.log(`   📊 ${betStrategyName}: betting ${nextBet.toFixed(2)} APE${betInfo}`);
        }
        
        const result = await playOnce(nextBet);
        gamesPlayed++;
        
        // Track result for betting strategy
        if (result.gameResult) {
          lastGameResult = result.gameResult;
          recordLoopGame(loopStats, {
            won: result.gameResult.won,
            wageredApe: result.gameResult.bet,
            payoutApe: result.gameResult.payout,
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
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        
        if (result.shouldStop) break;
        
        // Show balance and countdown before next game
        if (!opts.json) {
          const { publicClient: pc } = createClients();
          const currentBal = await pc.getBalance({ address: account.address });
          const currentApe = parseFloat(formatEther(currentBal));
          const terminalConditionReached = (
            (targetBalance !== null && currentApe >= targetBalance) ||
            (stopLoss !== null && currentApe <= stopLoss) ||
            (maxGames !== null && gamesPlayed >= maxGames)
          );
          console.log('');
          console.log(formatLoopProgress({
            currentBalanceApe: currentApe,
            startingBalanceApe: startingBalance,
            stats: loopStats,
            nextDelayLabel: terminalConditionReached ? null : `${delaySeconds}s`,
          }));
          if (terminalConditionReached) continue;
        }
        await new Promise(r => setTimeout(r, delayMs));
      }
    } else {
      await playOnce();
    }
  });

// ============================================================================
// COMMAND: CONTEST
// ============================================================================
program
  .command('contest [action]')
  .description('Agent contest info and registration')
  .option('--json', 'JSON output')
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
        balance = await publicClient.getBalance({ address: account.address });
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
        publicClient.getBalance({ address: account.address }),
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
  .command('history')
  .option('--limit <n>', 'Number of games to show', '10')
  .option('--all', 'Show all saved games')
  .option('--json', 'JSON output')
  .action(async (opts) => {
    const account = await getWalletWithPrompt({ json: opts.json });
    const { publicClient } = createClients();
    const history = loadHistory();
    const limit = parseInt(opts.limit) || 10;

    const recentGames = selectHistoryGames(history.games, {
      limit,
      all: Boolean(opts.all),
    });
    
    if (recentGames.length === 0) {
      if (opts.json) console.log(JSON.stringify({ games: [] }));
      else console.log('\nNo games in history.\n');
      return;
    }

    // Group games by contract to batch fetch
    const gamesByContract = {};
    for (const game of recentGames) {
      if (!gamesByContract[game.contract]) gamesByContract[game.contract] = [];
      gamesByContract[game.contract].push(game);
    }

    const results = [];
    let failedHistoryFetches = 0;
    
    for (const [contract, games] of Object.entries(gamesByContract)) {
      const { entries, failedFetches } = await fetchHistoryEntriesForContract(publicClient, contract, games);
      results.push(...entries);
      failedHistoryFetches += failedFetches;
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);
    const numberedResults = results.map((result, index) => ({
      ...result,
      historyIndex: index + 1,
    }));

    if (numberedResults.length === 0) {
      if (opts.json) {
        console.log(JSON.stringify({
          games: [],
          warning: 'Unable to fetch on-chain history details.',
          saved_games: recentGames.length,
          failed_fetches: failedHistoryFetches,
        }));
      } else {
        console.log('\n📜 Recent Games\n');
        console.log('   Unable to fetch on-chain history details for saved games.\n');
      }
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify({ games: numberedResults }));
    } else {
      console.log(`\n${formatHeader('Recent Games', '📜')}\n`);
      for (const r of numberedResults) {
        console.log(formatHistoryLine(r));
      }
      console.log('');
    }
  });

// ============================================================================
// COMMAND: GAMES
// ============================================================================
program
  .command('games')
  .option('--json', 'JSON output')
  .action((opts) => {
    if (opts.json) {
      const games = GAME_REGISTRY.map(g => ({
        key: g.key,
        name: g.name,
        type: g.type,
        description: g.description,
        aliases: g.aliases,
        contract: g.contract,
        config: g.config,
      }));
      console.log(JSON.stringify({ games }));
    } else {
      console.log(`\n${formatHeader('Available Games', '🎰')}\n`);
      for (const game of GAME_REGISTRY) {
        console.log(`   ${theme.gameName(game.name)} ${theme.dim(`(${game.key})`)}`);
        console.log(`      ${theme.value(game.description)}`);
        if (game.aliases?.length) console.log(`      ${theme.label('Aliases:')} ${theme.dim(game.aliases.join(', '))}`);
        console.log('');
      }
    }
  });

// ============================================================================
// COMMAND: GAME (single game details)
// ============================================================================
program
  .command('game <name>')
  .option('--json', 'JSON output')
  .action((name, opts) => {
    // Handle blackjack specially (stateful game)
    if (name.toLowerCase() === 'blackjack' || name.toLowerCase() === 'bj') {
      if (opts.json) {
        console.log(JSON.stringify({
          name: 'Blackjack',
          type: 'stateful',
          key: 'blackjack',
          aliases: ['bj'],
          contract: '0x720D68C867aC4De7e035c2C1346c4eb070b29Aae',
          description: 'Classic blackjack with simple and exact-EV auto-play',
        }));
        return;
      }
      console.log(`
${'═'.repeat(60)}
  BLACKJACK
${'═'.repeat(60)}

  Classic blackjack card game. Play against the dealer, aim for 21.
  Includes auto-play bot with mathematically optimal basic strategy.

  Type:     stateful
  Key:      blackjack
  Aliases:  bj
  Contract: 0x720D68C867aC4De7e035c2C1346c4eb070b29Aae

${'─'.repeat(60)}
  COMMANDS
${'─'.repeat(60)}

  ${BINARY_NAME} blackjack <amount>      Start new game with bet
  ${BINARY_NAME} blackjack resume        Resume unfinished game
  ${BINARY_NAME} blackjack status        Check current game state

${'─'.repeat(60)}
  OPTIONS
${'─'.repeat(60)}

  --auto [mode]   Auto-play the hand
  --loop          Keep playing until balance runs out
  --target <ape>  Stop when balance reaches this amount
  --stop-loss <ape>  Stop when balance drops to this amount

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
  ${BINARY_NAME} blackjack 25 --auto            Bot plays one hand
  ${BINARY_NAME} blackjack 25 --auto best       Exact EV solver
  ${BINARY_NAME} blackjack 25 --auto --loop     Bot grinds until broke
  ${BINARY_NAME} blackjack 10 --auto --loop --target 500
                                           Bot plays until 500 APE balance

${'═'.repeat(60)}
`);
      return;
    }
    
    // Handle video-poker specially (stateful game)
    if (name.toLowerCase() === 'video-poker' || name.toLowerCase() === 'vp' || name.toLowerCase() === 'gimboz-poker') {
      if (opts.json) {
        console.log(JSON.stringify({
          name: 'Video Poker',
          type: 'stateful',
          key: 'video-poker',
          aliases: ['vp', 'gimboz-poker'],
          contract: '0x4f7D016704bC9A1d373E512e10CF86A0E7015D1D',
          description: 'Jacks or Better video poker with simple and best-EV auto-play',
        }));
        return;
      }
      console.log(`
${'═'.repeat(60)}
  VIDEO POKER (GIMBOZ POKER)
${'═'.repeat(60)}

  Jacks or Better video poker. Get dealt 5 cards, choose which
  to discard, and draw replacements. Pair of Jacks+ wins.
  Max bet (100 APE) qualifies for progressive jackpot on Royal Flush.

  Type:     stateful
  Key:      video-poker
  Aliases:  vp, gimboz-poker
  Contract: 0x4f7D016704bC9A1d373E512e10CF86A0E7015D1D

${'─'.repeat(60)}
  COMMANDS
${'─'.repeat(60)}

  ${BINARY_NAME} video-poker <amount>    Start new game (1/5/10/25/50/100 APE)
  ${BINARY_NAME} video-poker resume      Resume unfinished game
  ${BINARY_NAME} video-poker status      Check current game state
  ${BINARY_NAME} video-poker payouts     Show payout table

${'─'.repeat(60)}
  OPTIONS
${'─'.repeat(60)}

  --auto [mode]   Auto-play the hand
  --loop          Keep playing until balance runs out
  --target <ape>  Stop when balance reaches this amount
  --stop-loss <ape>  Stop when balance drops to this amount

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

${'═'.repeat(60)}
`);
      return;
    }
    
    const game = resolveGame(name);
    if (!game) {
      const error = { error: `Unknown game: ${name}`, available: listGames() };
      if (opts.json) console.log(JSON.stringify(error));
      else console.log(`\n❌ Unknown game: "${name}"\nAvailable: ${GAME_LIST}, blackjack, video-poker\n`);
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(game));
    } else {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`  ${game.name.toUpperCase()}`);
      console.log(`${'═'.repeat(60)}\n`);
      console.log(`  ${game.description}\n`);
      console.log(`  Type:     ${game.type}`);
      console.log(`  Key:      ${game.key}`);
      if (game.aliases?.length) console.log(`  Aliases:  ${game.aliases.join(', ')}`);
      console.log(`  Contract: ${game.contract}\n`);
      
      if (game.config) {
        console.log(`${'─'.repeat(60)}`);
        console.log('  PARAMETERS');
        console.log(`${'─'.repeat(60)}\n`);
        for (const [param, cfg] of Object.entries(game.config)) {
          console.log(`  --${param}`);
          if (cfg.min !== undefined) console.log(`      Range:   ${cfg.min} - ${cfg.max}`);
          if (cfg.default !== undefined) console.log(`      Default: ${cfg.default}`);
          if (cfg.description) console.log(`      ${cfg.description}`);
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
  .description('Show all commands')
  .action(() => {
    console.log(`
🦍 APE CHURCH CLI - COMMAND REFERENCE

SETUP
  ${BINARY_NAME} install              Setup encrypted wallet and register
  ${BINARY_NAME} uninstall            Remove local data

WALLET
  ${BINARY_NAME} wallet status        Check wallet encryption status
  ${BINARY_NAME} wallet encrypt       Migrate legacy plaintext wallet to encrypted-only storage
  ${BINARY_NAME} wallet new-password  Re-encrypt local wallet with a new password
  ${BINARY_NAME} wallet hints         View or update password hints (up to 3)
  ${BINARY_NAME} wallet reset         Delete local wallet/profile/state files (requires reinstall)
  ${BINARY_NAME} send APE <amt> <to>  Send APE (native currency) to an address
  ${BINARY_NAME} send GP <amt> <to>   Send GP (Gimbo Points, 0 decimals) to an address

THE HOUSE (Staking)
  ${BINARY_NAME} house                Show house stats and your position
  ${BINARY_NAME} house deposit <amt>  Deposit APE (15-min lock, 2% withdraw fee)
  ${BINARY_NAME} house withdraw <amt> Withdraw APE

STATUS
  ${BINARY_NAME} status               Check balance and state
  ${BINARY_NAME} profile show         Show profile
  ${BINARY_NAME} profile set          Update profile (--persona, --referral)

PLAY
  ${BINARY_NAME} play                 Play random game
  ${BINARY_NAME} play <game> <amt>    Play specific game
  ${BINARY_NAME} play --loop          Continuous play
  ${BINARY_NAME} bet --game X --amount Y   Manual bet

CONTROL
  ${BINARY_NAME} pause                Stop autonomous play
  ${BINARY_NAME} resume               Resume play
  ${BINARY_NAME} register --username <name>   Set or change username

INFO
  ${BINARY_NAME} games                List all games
  ${BINARY_NAME} game <name>          Game details
  ${BINARY_NAME} history [--all]      Recent games
  ${BINARY_NAME} commands             This help

CONTEST
  ${BINARY_NAME} contest              Contest info and your status
  ${BINARY_NAME} contest register     Register for the contest (5 APE)

ENVIRONMENT
  ${PRIVATE_KEY_ENV_VAR}   Optional fallback for non-interactive install/reinstall
  ${PASS_ENV_VAR}          Required for non-interactive install/signing; optional otherwise
  ${PROFILE_URL_ENV_VAR}   Optional override for the username/profile API

LOOP OPTIONS
  --loop                  Play continuously
  --target <ape>          Stop when balance reaches target
  --stop-loss <ape>       Stop when balance drops to limit
  --max-games <count>     Stop after N games
  --bet-strategy <name>   Betting strategy (flat, martingale, etc.)
  --max-bet <ape>         Maximum bet cap (for progressive strategies)

BETTING STRATEGIES
  flat                    Same bet every time (default)
  martingale              Double on loss, reset on win
  reverse-martingale      Double on win, reset on loss
  fibonacci               Fibonacci sequence on loss
  dalembert               +1 unit on loss, -1 on win

EXAMPLES
  ${BINARY_NAME} play jungle-plinko 10 2 50
  ${BINARY_NAME} play roulette 50 RED
  ${BINARY_NAME} play ape-strong 10 50

  # Loop with safety limits
  ${BINARY_NAME} play --loop --target 200 --stop-loss 50

  # Martingale: start at 10, double on loss, max 100
  ${BINARY_NAME} play roulette 10 RED --loop --bet-strategy martingale --max-bet 100

  # Blackjack with strategy
  ${BINARY_NAME} blackjack 5 --auto --loop --bet-strategy martingale --target 100

  # Run exactly 20 games
  ${BINARY_NAME} play ape-strong 10 --loop --max-games 20

  ${BINARY_NAME} register --username my_bot_name
  ${BINARY_NAME} send APE 10 0x1234...abcd

ASSETS
  APE    Native currency (18 decimals)
         - Used for betting, gas fees, and transfers
         - Check balance: ${BINARY_NAME} status

  GP     Gimbo Points (0 decimals, whole numbers only)
         - Earned as cashback from playing games
         - Non-transferable until claimed (use getCurrentEXP to check)
         - Send to others: ${BINARY_NAME} send GP <amount> <address>

DETAILED HELP
  ${BINARY_NAME} help <topic>         Get detailed help on a topic

  Topics: loop, strategies, auto, wallet, house
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

  --target <ape>       Stop when balance REACHES this amount
                       Example: --target 200 (stop at 200 APE)
                       
  --stop-loss <ape>    Stop when balance DROPS to this amount
                       Example: --stop-loss 50 (stop if you hit 50 APE)
                       
  --max-games <n>      Stop after exactly N games
                       Example: --max-games 100 (play 100 games then stop)

  These can be combined:
    ${BINARY_NAME} play --loop --target 200 --stop-loss 50 --max-games 500

${'─'.repeat(70)}
  BETTING STRATEGIES (use with --loop)
${'─'.repeat(70)}

  --bet-strategy <name>   Control how bet size changes after wins/losses
                          Options: flat, martingale, reverse-martingale,
                                   fibonacci, dalembert
                          
  --max-bet <ape>         IMPORTANT: Cap maximum bet size
                          Prevents runaway betting in progressive strategies
                          
  Example - Martingale with safety:
    ${BINARY_NAME} play roulette 10 RED --loop \\
      --bet-strategy martingale \\
      --max-bet 100 \\
      --stop-loss 50

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
    • Reaching --target balance
    • Hitting --stop-loss floor
    • Completing --max-games
    • Balance too low for minimum bet
    • Ctrl+C (manual interrupt)

${'─'.repeat(70)}
  WORKS WITH
${'─'.repeat(70)}

  • All simple games (play command)
  • Blackjack (${BINARY_NAME} blackjack <amt> --loop --auto)
  • Video Poker (${BINARY_NAME} video-poker <amt> --loop --auto)

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
  IMPORTANT: --max-bet
${'─'.repeat(70)}

  Progressive strategies can spiral quickly. ALWAYS set --max-bet.
  
  When bet would exceed --max-bet:
    • Bet is capped at max-bet value
    • Strategy state continues (doesn't reset)
    • Output shows "(capped)" when this happens

${'═'.repeat(70)}
`,

  auto: `
${'═'.repeat(70)}
  AUTO-PLAY MODE
${'═'.repeat(70)}

  The --auto flag lets the CLI play without human input.
  Available on games that require decisions (Blackjack, Video Poker).

  Modes:
    • simple   Fast heuristic mode (default)
    • best     Exact EV mode where implemented

${'─'.repeat(70)}
  BLACKJACK --auto
${'─'.repeat(70)}

  simple: Uses Basic Strategy based on:
    • Your hand total (hard/soft)
    • Dealer's up card
    • Available actions (hit, stand, double, split, etc.)

  best: Exact EV solver on the live hand state:
    • Enumerates the remaining deck without replacement
    • Models early surrender, insurance, double, and split
    • Optimizes current-hand RTP under the contract's rules
  
  Commands:
    ${BINARY_NAME} blackjack 10 --auto              # One hand, auto-play
    ${BINARY_NAME} blackjack 10 --auto best         # Exact EV solver
    ${BINARY_NAME} blackjack 10 --auto --loop       # Continuous auto-play
  
  Strategy includes:
    • When to hit vs stand
    • When to double down
    • When to split pairs
    • When to surrender (if offered)
    • Insurance decisions from exact live EV

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
  SIMPLE GAMES
${'─'.repeat(70)}

  Games like Roulette, Plinko, etc. don't need --auto because
  there are no mid-game decisions. Just use --loop for continuous play:
  
    ${BINARY_NAME} play roulette 10 RED --loop
    ${BINARY_NAME} play plinko 10 2 50 --loop

${'─'.repeat(70)}
  COMBINING WITH STRATEGIES
${'─'.repeat(70)}

  Auto-play works with all betting strategies:
  
    ${BINARY_NAME} blackjack 10 --auto --loop \\
      --bet-strategy martingale --max-bet 100 \\
      --target 200 --stop-loss 50

${'─'.repeat(70)}
  TIMING EXAMPLE
${'─'.repeat(70)}

  For slower, less robotic pacing during loops:

    ${BINARY_NAME} video-poker 10 --auto best --loop \\
      --delay 5 --human

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

  Wallet path:
    ${WALLET_FILE}

  Security model in this hardened build:
    • The private key is stored only in encrypted form on disk
    • Signing happens only locally on this machine
    • No plaintext private key export is available
    • No unlock/session cache exists
    • Password is read from ${PASS_ENV_VAR} or prompted immediately before signing

${'─'.repeat(70)}
  SUPPORTED COMMANDS
${'─'.repeat(70)}

  ${BINARY_NAME} wallet status        Check encrypted wallet status
  ${BINARY_NAME} wallet encrypt       Migrate a legacy plaintext wallet in place
  ${BINARY_NAME} wallet new-password  Re-encrypt the local wallet with a new password
  ${BINARY_NAME} wallet hints         View/update password hints
  ${BINARY_NAME} wallet reset         Delete local wallet/profile/state files

${'─'.repeat(70)}
  INSTALL / REINSTALL
${'─'.repeat(70)}

  Fresh install/reinstall prompts for the private key with hidden input:
    ${BINARY_NAME} install

  If ${WALLET_FILE} already exists, install reuses it and
  does not ask for the private key again.

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
  • ${BINARY_NAME} wallet reset irreversibly deletes local wallet/profile/state files.

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

${'═'.repeat(70)}
`,
};

program
  .command('help [topic]')
  .description('Get detailed help on a topic (loop, strategies, auto, wallet, house)')
  .option('--json', 'JSON output')
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
  ${BINARY_NAME} help house        The House staking system

  Also see:
    ${BINARY_NAME} commands        Full command reference
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
        balance = await publicClient.getBalance({ address: account.address });
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
      if (GP_TOKEN_CONTRACT === '0x0000000000000000000000000000000000000000') {
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
        apeBalance = await publicClient.getBalance({ address: account.address });
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

    } else {
      const error = { error: `Unsupported asset: ${asset}. Supported: APE, GP` };
      if (opts.json) console.log(JSON.stringify(error));
      else console.error(`\n❌ Unsupported asset: ${asset}. Supported: APE, GP\n`);
      process.exit(1);
    }
  });

// ============================================================================
// COMMAND: HOUSE (The House - staking/liquidity)
// ============================================================================
program
  .command('house [action] [amount]')
  .description('The House - stake APE, earn from player losses')
  .option('--json', 'JSON output only')
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
      const balance = await pc.getBalance({ address: account.address });
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
  .description('Play Blackjack - interactive card game')
  .option('--game <id>', 'Specify game ID (for resume/action)')
  .option('--display <mode>', 'Display mode: full, simple, json')
  .option('--json', 'JSON output only')
  .option('-v, --verbose', 'Show technical progress logs')
  .option('--auto [mode]', 'Auto-play the hand')
  .option('--delay <seconds>', 'Fixed delay between looped games')
  .addOption(new Option('--human', 'Add humanized random timing (3-9s); if --delay is set, it is added on top').hideHelp())
  .option('--loop', 'Keep playing until balance runs out')
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--target <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .option('--bet-strategy <name>', 'Betting strategy: flat, martingale, reverse-martingale, fibonacci, dalembert')
  .option('--max-bet <ape>', 'Maximum bet amount (safety cap for progressive strategies)')
  .action(async (action, amount, opts) => {
    // Dynamic import to avoid loading stateful game code when not needed
    const blackjack = await import('../lib/stateful/blackjack/index.js');
    
    // Determine what to do based on action
    if (!action || !isNaN(parseFloat(action))) {
      // No action or amount = start new game
      const betAmount = action || amount;
      if (!betAmount) {
        console.error('\n❌ Bet amount required');
        console.error(`   Usage: ${BINARY_NAME} blackjack <amount>\n`);
        console.error(`   Example: ${BINARY_NAME} blackjack 10\n`);
        return;
      }
      return blackjack.start(betAmount, opts);
    }
    
    // Named actions
    const actionLower = action.toLowerCase();
    
    switch (actionLower) {
      case 'resume':
        return blackjack.resume(opts.game, opts);
        
      case 'status':
        return blackjack.status(opts.game, opts);
        
      case 'hit':
      case 'stand':
      case 'double':
      case 'split':
      case 'insurance':
      case 'surrender':
        return blackjack.action(actionLower, opts);
      
      case 'clear': {
        const games = loadActiveGames();
        const bjGames = games['blackjack'] || [];
        if (bjGames.length === 0) {
          console.log('\n✅ No active blackjack games to clear.\n');
        } else {
          console.log(`\n🗑️  Clearing ${bjGames.length} stored blackjack game(s)...`);
          games['blackjack'] = [];
          saveActiveGames(games);
          console.log('✅ Done.\n');
        }
        return;
      }
        
      default:
        console.error(`\n❌ Unknown action: ${action}`);
        console.error('   Valid actions: hit, stand, double, split, insurance, surrender');
        console.error('   Or: resume, status, clear\n');
    }
  });

// ============================================================================
// COMMAND: VIDEO POKER (Gimboz Poker - Stateful game)
// ============================================================================
program
  .command('video-poker [action] [amount]')
  .alias('vp')
  .alias('gimboz-poker')
  .description('Play Video Poker (Gimboz Poker) - Jacks or Better')
  .option('--game <id>', 'Specify game ID (for resume)')
  .option('--display <mode>', 'Display mode: full, simple, json')
  .option('--json', 'JSON output only')
  .option('-v, --verbose', 'Show technical progress logs')
  .option('--auto [mode]', 'Auto-play the hand')
  .option('--solver', 'Show best-EV hold suggestion in interactive video poker')
  .option('--delay <seconds>', 'Fixed delay between looped games')
  .addOption(new Option('--human', 'Add humanized random timing (3-9s); if --delay is set, it is added on top').hideHelp())
  .option('--loop', 'Keep playing until balance runs out')
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--target <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .option('--bet-strategy <name>', 'Betting strategy: flat, martingale, reverse-martingale, fibonacci, dalembert')
  .option('--max-bet <ape>', 'Maximum bet amount (safety cap for progressive strategies)')
  .action(async (action, amount, opts) => {
    const videoPoker = await import('../lib/stateful/video-poker/index.js');
    
    // If action is a number, treat it as bet amount
    if (!action || !isNaN(parseFloat(action))) {
      const betAmount = action || amount;
      if (!betAmount) {
        console.error('\n❌ Bet amount required');
        console.error('   Valid bets: 1, 5, 10, 25, 50, 100 APE');
        console.error(`   Usage: ${BINARY_NAME} video-poker <amount>\n`);
        console.error(`   Example: ${BINARY_NAME} video-poker 10\n`);
        return;
      }
      return videoPoker.start(betAmount, opts);
    }
    
    const actionLower = action.toLowerCase();
    
    switch (actionLower) {
      case 'resume':
        return videoPoker.resume(opts.game, opts);
        
      case 'status':
        return videoPoker.status(opts.game, opts);
        
      case 'payouts':
      case 'table':
        return videoPoker.payouts();
      
      case 'clear': {
        const games = loadActiveGames();
        const vpGames = games['video-poker'] || [];
        if (vpGames.length === 0) {
          console.log('\n✅ No active video poker games to clear.\n');
        } else {
          console.log(`\n🗑️  Clearing ${vpGames.length} stored video poker game(s)...`);
          games['video-poker'] = [];
          saveActiveGames(games);
          console.log('✅ Done.\n');
        }
        return;
      }
        
      default:
        console.error(`\n❌ Unknown action: ${action}`);
        console.error('   Valid actions: resume, status, payouts, clear');
        console.error('   Or provide a bet amount: 1, 5, 10, 25, 50, 100\n');
    }
  });

// ============================================================================
// PARSE
// ============================================================================
printInvocationVersion();
program.parse(process.argv);

// Show update notification if available (after command completes)
if (notifier) {
  notifier.notify({
    isGlobal: true,
    message: `Update available: {currentVersion} → {latestVersion}\nRun: npm i -g ${PACKAGE_NAME}`,
  });
}
