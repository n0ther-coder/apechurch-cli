#!/usr/bin/env node
/**
 * Ape Church CLI - Main entry point
 * 
 * All game logic, utilities, and helpers are modularized in lib/
 * This file contains command definitions and CLI orchestration.
 */
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import updateNotifier from 'update-notifier';

// Check for updates (async, non-blocking, cached for 1 day)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const notifier = updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 });
import readline from 'readline';
import { formatEther, parseEther } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

// --- Local modules ---
import {
  APECHURCH_DIR,
  SKILL_TARGET_DIR,
  WALLET_FILE,
  GAS_RESERVE_APE,
  GAME_CONTRACT_ABI,
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
} from '../lib/constants.js';
import {
  sanitizeError,
  formatApeAmount,
  ensureDir,
  addBigIntStrings,
  randomIntInclusive,
  parseNonNegativeInt,
} from '../lib/utils.js';
import {
  getWallet,
  walletExists,
  createClients,
  loadWalletData,
  isWalletEncrypted,
  getPrivateKey,
  encryptWallet,
  decryptWallet,
  unlockWallet,
  clearSession,
  getSessionTimeRemaining,
  getWalletHints,
  setWalletHints,
  saveSession,
  createEncryptedWallet,
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

// --- CLI Setup ---
const program = new Command();
const PACKAGE_VERSION = (() => {
  try {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(pkgUrl, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

program.name('apechurch').version(PACKAGE_VERSION, '-v, --version', 'output the current version');
const GAME_LIST = listGames().join(' | ');

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

// --- Helper: Get wallet with password prompting ---
// For commands that need the private key - prompts for password if encrypted
async function getWalletWithPrompt(opts = {}) {
  if (!walletExists()) {
    if (opts.json) {
      console.error(JSON.stringify({ error: 'No wallet found. Run: apechurch install' }));
    } else {
      console.error('\n❌ No wallet found. Run: apechurch install\n');
    }
    process.exit(1);
  }
  
  // Try with env password first
  const keyResult = getPrivateKey(process.env.APECHURCH_PASSWORD);
  
  if (keyResult.needsPassword) {
    // Show hints if available
    if (!opts.json && keyResult.hints && keyResult.hints.length > 0) {
      console.log('\n   Your hints:');
      keyResult.hints.forEach((h, i) => console.log(`     ${i + 1}. ${h}`));
    }
    
    const password = await prompt(opts.json ? '' : '🔐 Password: ');
    const retryResult = getPrivateKey(password);
    
    if (retryResult.error) {
      if (opts.json) {
        console.error(JSON.stringify({ error: retryResult.error }));
      } else {
        console.error(`\n❌ ${retryResult.error}\n`);
      }
      process.exit(1);
    }
    
    // Auto-start a session for convenience
    saveSession(retryResult.privateKey);
    
    return privateKeyToAccount(retryResult.privateKey);
  }
  
  if (keyResult.error) {
    if (opts.json) {
      console.error(JSON.stringify({ error: keyResult.error }));
    } else {
      console.error(`\n❌ ${keyResult.error}\n`);
    }
    process.exit(1);
  }
  
  return privateKeyToAccount(keyResult.privateKey);
}

// ============================================================================
// COMMAND: INSTALL
// ============================================================================
program
  .command('install')
  .description('Setup the Ape Church Agent')
  .option('--username <name>', 'Username for your bot')
  .option('--persona <name>', 'conservative | balanced | aggressive | degen')
  .option('--private-key <key>', 'Import existing private key')
  .option('-y, --quick', 'Skip interactive prompts, use defaults')
  .action(async (opts) => {
    const isInteractive = !opts.quick && !opts.privateKey && !opts.username;
    
    ensureDir(APECHURCH_DIR);
    
    let address;
    let walletWasImported = false;
    const walletExisted = fs.existsSync(WALLET_FILE);

    // --- STEP 1: WALLET SETUP ---
    if (walletExisted) {
      const data = JSON.parse(fs.readFileSync(WALLET_FILE));
      address = privateKeyToAccount(data.privateKey).address;
      console.log(`\n✅ Using existing wallet: ${address}`);
    } else if (opts.privateKey) {
      let pk = opts.privateKey.trim();
      if (!pk.startsWith('0x')) pk = '0x' + pk;
      try {
        const account = privateKeyToAccount(pk);
        address = account.address;
        fs.writeFileSync(WALLET_FILE, JSON.stringify({ encrypted: false, privateKey: pk }), { mode: 0o600 });
        walletWasImported = true;
        console.log(`\n✅ Imported wallet: ${address}`);
      } catch (error) {
        console.error(`\n❌ Invalid private key: ${error.message}`);
        process.exit(1);
      }
    } else if (isInteractive) {
      console.log('\n🎰 Welcome to Ape Church!\n');
      console.log('┌─────────────────────────────────────────────────────────────────┐');
      console.log('│                        WALLET SETUP                             │');
      console.log('├─────────────────────────────────────────────────────────────────┤');
      console.log('│  (1) Generate a new wallet (recommended)                        │');
      console.log('│  (2) Import an existing private key                             │');
      console.log('└─────────────────────────────────────────────────────────────────┘');
      
      const walletChoice = await prompt('\nYour choice (1 or 2): ');
      
      let pk;
      if (walletChoice.trim() === '2') {
        const pkInput = await prompt('Enter your private key: ');
        pk = pkInput.trim();
        if (!pk.startsWith('0x')) pk = '0x' + pk;
        try {
          const account = privateKeyToAccount(pk);
          address = account.address;
          walletWasImported = true;
        } catch (error) {
          console.error(`\n❌ Invalid private key: ${error.message}`);
          process.exit(1);
        }
      } else {
        pk = generatePrivateKey();
        const account = privateKeyToAccount(pk);
        address = account.address;
      }
      
      // Save wallet (unencrypted by default)
      fs.writeFileSync(WALLET_FILE, JSON.stringify({ encrypted: false, privateKey: pk }), { mode: 0o600 });
      console.log(`\n✅ ${walletWasImported ? 'Imported' : 'Generated new'} wallet: ${address}`);
    } else {
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk);
      fs.writeFileSync(WALLET_FILE, JSON.stringify({ encrypted: false, privateKey: pk }), { mode: 0o600 });
      address = account.address;
      console.log(`\n✅ Generated new wallet: ${address}`);
    }

    // --- STEP 2: INJECT SKILL FILES ---
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

    // --- STEP 3: USERNAME SETUP ---
    const localProfile = loadProfile();
    const persona = normalizeStrategy(opts.persona || localProfile.persona || 'balanced');
    let username;
    let usernameRegistered = false;

    if (opts.username) {
      try {
        username = normalizeUsername(opts.username);
      } catch (error) {
        console.error(`\n❌ Invalid username: ${error.message}`);
        username = generateUsername();
        console.log(`   Using auto-generated: ${username}`);
      }
    } else if (isInteractive && !walletWasImported) {
      console.log('\n┌─────────────────────────────────────────────────────────────────┐');
      console.log('│                       USERNAME SETUP                            │');
      console.log('├─────────────────────────────────────────────────────────────────┤');
      console.log('│  Choose a username for your bot on Ape Church.                  │');
      console.log('│  (Letters, numbers, underscores only. Max 32 characters)        │');
      console.log('│  Leave blank for auto-generated name.                           │');
      console.log('└─────────────────────────────────────────────────────────────────┘');
      
      let usernameValid = false;
      while (!usernameValid) {
        const usernameInput = await prompt('\nUsername: ');
        
        if (!usernameInput.trim()) {
          username = generateUsername();
          console.log(`Using auto-generated: ${username}`);
          usernameValid = true;
        } else {
          try {
            username = normalizeUsername(usernameInput);
            usernameValid = true;
          } catch (error) {
            console.log(`❌ ${error.message}`);
            console.log('   Try again (letters, numbers, underscores, max 32 chars)');
          }
        }
      }
      
      console.log(`\nRegistering "${username}"...`);
      try {
        const account = getWallet();
        await registerUsername({ account, username, persona });
        usernameRegistered = true;
        console.log('✅ Username registered!');
      } catch (error) {
        console.log(`⚠️  Registration failed: ${sanitizeError(error)}`);
        console.log('   (You can try again later with: apechurch register --username YOUR_NAME)');
      }
    } else {
      username = generateUsername();
    }

    // Save profile
    if (!usernameRegistered) {
      saveProfile({ ...localProfile, username, persona });
    }

    // --- OUTPUT ---
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('                        SETUP COMPLETE                             ');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  AGENT ADDRESS: ${address}`);
    console.log(`  USERNAME:      ${username}`);
    if (!usernameRegistered) {
      console.log('                 (Change anytime: apechurch register --username <YOUR_NAME>)');
    }
    console.log(`  PERSONA:       ${persona}`);
    console.log('');
    console.log('  ⚠️  ACTION REQUIRED: Send APE to this address on ApeChain.');
    console.log('');
    console.log('  Bridge APE:  https://relay.link/bridge/apechain');
    console.log('═══════════════════════════════════════════════════════════════════');
    
    // Show contest prompt if contest is still active
    if (new Date() < CONTEST_END_DATE) {
      console.log('');
      console.log('  🏆 AGENT CONTEST IS LIVE!');
      console.log('     Compete against other agents for prizes.');
      console.log('     Run: apechurch contest');
      console.log('═══════════════════════════════════════════════════════════════════');
    }
    
    // Show encryption info
    console.log('');
    console.log('  🔐 PRIVATE KEY ENCRYPTION (Optional)');
    console.log('     Want to password-protect your wallet?');
    console.log('     Run: apechurch wallet encrypt');
    console.log('');
    console.log('     • Hides your private key behind a password');
    console.log('     • Sessions unlock for 3 hours at a time');
    console.log('     • Set up to 3 password hints');
    console.log('     • ⚠️  Not recommended for AI agents');
    console.log('     • ⚠️  Forgot password = funds lost forever');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');
  });

// ============================================================================
// COMMAND: UNINSTALL
// ============================================================================
program
  .command('uninstall')
  .description('Remove Ape Church data from this machine')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    if (!fs.existsSync(APECHURCH_DIR)) {
      console.log('\nNo Ape Church data found. Nothing to remove.\n');
      return;
    }

    if (!opts.yes) {
      console.log('\n⚠️  This will delete:');
      console.log(`   - Wallet at ${WALLET_FILE}`);
      console.log(`   - Profile at ${APECHURCH_DIR}/profile.json`);
      console.log(`   - All local state and history`);
      console.log('\n   Make sure you have backed up your private key!');
      console.log('   (Run: apechurch wallet export)\n');
      
      const confirm = await prompt('Type "DELETE" to confirm: ');
      if (confirm.trim() !== 'DELETE') {
        console.log('\nCancelled.\n');
        return;
      }
    }

    try {
      fs.rmSync(APECHURCH_DIR, { recursive: true, force: true });
      console.log('\n✅ Ape Church data removed.\n');
    } catch (error) {
      console.error(`\n❌ Failed to remove: ${error.message}\n`);
    }
  });

// ============================================================================
// COMMAND: WALLET
// ============================================================================
program
  .command('wallet <action>')
  .description('Wallet management (export, reset, encrypt, decrypt, unlock, lock, hints)')
  .option('-y, --yes', 'Skip confirmation')
  .option('--timeout <hours>', 'Session timeout in hours (default: 3)', '3')
  .option('--json', 'JSON output')
  .action(async (action, opts) => {
    
    // --- EXPORT ---
    if (action === 'export') {
      if (!walletExists()) {
        console.error(JSON.stringify({ error: 'No wallet found. Run: apechurch install' }));
        process.exit(1);
      }
      
      // Need to get private key (may need password)
      const keyResult = getPrivateKey(process.env.APECHURCH_PASSWORD);
      if (keyResult.needsPassword) {
        const password = await prompt('Password: ');
        const retryResult = getPrivateKey(password);
        if (retryResult.error) {
          console.error(`\n❌ ${retryResult.error}\n`);
          process.exit(1);
        }
        console.log('\n⚠️  PRIVATE KEY - DO NOT SHARE\n');
        console.log(`   ${retryResult.privateKey}\n`);
        console.log('   Store this securely. Anyone with this key controls your funds.\n');
      } else if (keyResult.error) {
        console.error(`\n❌ ${keyResult.error}\n`);
        process.exit(1);
      } else {
        console.log('\n⚠️  PRIVATE KEY - DO NOT SHARE\n');
        console.log(`   ${keyResult.privateKey}\n`);
        console.log('   Store this securely. Anyone with this key controls your funds.\n');
      }
      return;
    }
    
    // --- ENCRYPT ---
    if (action === 'encrypt') {
      if (!walletExists()) {
        console.error('\n❌ No wallet found. Run: apechurch install\n');
        process.exit(1);
      }
      if (isWalletEncrypted()) {
        console.error('\n❌ Wallet is already encrypted\n');
        process.exit(1);
      }
      
      console.log('\n🔐 Encrypt Wallet\n');
      console.log('   ⚠️  Password is REQUIRED to access your wallet after encryption.');
      console.log('   ⚠️  If you forget your password, your funds are LOST FOREVER.');
      console.log('   ⚠️  Not recommended for AI agents (they must remember the password).\n');
      
      const password = await prompt('Set password: ');
      if (!password || password.length < 4) {
        console.error('\n❌ Password must be at least 4 characters\n');
        process.exit(1);
      }
      const confirm = await prompt('Confirm password: ');
      if (password !== confirm) {
        console.error('\n❌ Passwords do not match\n');
        process.exit(1);
      }
      
      // Collect hints (optional)
      console.log('\n   Set up to 3 password hints (optional, press Enter to skip):\n');
      const hints = [];
      for (let i = 1; i <= 3; i++) {
        const hint = await prompt(`   Hint ${i}: `);
        if (hint.trim()) hints.push(hint.trim());
      }
      
      const result = encryptWallet(password, hints);
      if (result.error) {
        console.error(`\n❌ ${result.error}\n`);
        process.exit(1);
      }
      
      // Auto-unlock after encrypting
      unlockWallet(password, parseFloat(opts.timeout) * 60 * 60 * 1000);
      
      console.log('\n✅ Wallet encrypted successfully!');
      console.log(`   Session active for ${opts.timeout} hours.`);
      console.log('   Run: apechurch wallet unlock (to start new session)');
      console.log('   Run: apechurch wallet decrypt (to remove encryption)\n');
      return;
    }
    
    // --- DECRYPT ---
    if (action === 'decrypt') {
      if (!walletExists()) {
        console.error('\n❌ No wallet found. Run: apechurch install\n');
        process.exit(1);
      }
      if (!isWalletEncrypted()) {
        console.error('\n❌ Wallet is not encrypted\n');
        process.exit(1);
      }
      
      console.log('\n🔓 Decrypt Wallet\n');
      console.log('   ⚠️  This will remove password protection.');
      console.log('   ⚠️  Your private key will be stored in plain text.\n');
      
      // Show hints if available
      const hints = getWalletHints();
      if (hints.length > 0) {
        console.log('   Your hints:');
        hints.forEach((h, i) => console.log(`     ${i + 1}. ${h}`));
        console.log('');
      }
      
      const password = await prompt('Current password: ');
      const result = decryptWallet(password);
      if (result.error) {
        console.error(`\n❌ ${result.error}\n`);
        process.exit(1);
      }
      
      console.log('\n✅ Wallet decrypted. Password protection removed.\n');
      return;
    }
    
    // --- UNLOCK ---
    if (action === 'unlock') {
      if (!walletExists()) {
        console.error('\n❌ No wallet found. Run: apechurch install\n');
        process.exit(1);
      }
      if (!isWalletEncrypted()) {
        console.log('\n✅ Wallet is not encrypted. No unlock needed.\n');
        return;
      }
      
      // Check if already unlocked
      const remaining = getSessionTimeRemaining();
      if (remaining > 0) {
        const hours = Math.floor(remaining / 3600);
        const mins = Math.floor((remaining % 3600) / 60);
        console.log(`\n✅ Wallet already unlocked. ${hours}h ${mins}m remaining.\n`);
        return;
      }
      
      // Show hints if available
      const hints = getWalletHints();
      if (hints.length > 0) {
        console.log('\n   Your hints:');
        hints.forEach((h, i) => console.log(`     ${i + 1}. ${h}`));
        console.log('');
      }
      
      const password = process.env.APECHURCH_PASSWORD || await prompt('Password: ');
      const timeoutMs = parseFloat(opts.timeout) * 60 * 60 * 1000;
      const result = unlockWallet(password, timeoutMs);
      
      if (result.error) {
        if (opts.json) console.log(JSON.stringify({ error: result.error }));
        else console.error(`\n❌ ${result.error}\n`);
        process.exit(1);
      }
      
      if (opts.json) {
        console.log(JSON.stringify({ status: 'unlocked', timeout_hours: parseFloat(opts.timeout) }));
      } else {
        console.log(`\n✅ Wallet unlocked for ${opts.timeout} hours.\n`);
      }
      return;
    }
    
    // --- LOCK ---
    if (action === 'lock') {
      clearSession();
      if (opts.json) {
        console.log(JSON.stringify({ status: 'locked' }));
      } else {
        console.log('\n🔒 Session cleared. Wallet locked.\n');
      }
      return;
    }
    
    // --- HINTS ---
    if (action === 'hints') {
      if (!walletExists()) {
        console.error('\n❌ No wallet found. Run: apechurch install\n');
        process.exit(1);
      }
      if (!isWalletEncrypted()) {
        console.error('\n❌ Wallet is not encrypted. Hints only apply to encrypted wallets.\n');
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
      
      setWalletHints(newHints);
      console.log('\n✅ Hints updated.\n');
      return;
    }
    
    // --- STATUS ---
    if (action === 'status') {
      const encrypted = isWalletEncrypted();
      const remaining = getSessionTimeRemaining();
      const hints = getWalletHints();
      
      if (opts.json) {
        console.log(JSON.stringify({
          encrypted,
          session_remaining_seconds: remaining,
          hints_count: hints.length,
        }));
      } else {
        console.log('\n🔐 Wallet Security Status\n');
        console.log(`   Encrypted:  ${encrypted ? 'Yes' : 'No'}`);
        if (encrypted) {
          if (remaining > 0) {
            const hours = Math.floor(remaining / 3600);
            const mins = Math.floor((remaining % 3600) / 60);
            console.log(`   Session:    Unlocked (${hours}h ${mins}m remaining)`);
          } else {
            console.log('   Session:    Locked');
          }
          console.log(`   Hints:      ${hints.length} set`);
        }
        console.log('');
      }
      return;
    }
    
    // --- RESET ---
    if (action === 'reset') {
      const existingData = loadWalletData();
      
      console.log('\n' + '⚠️'.repeat(20));
      console.log('\n🚨 DANGER: WALLET RESET 🚨\n');
      console.log('This will:');
      console.log('  • DELETE your current wallet permanently');
      console.log('  • DELETE all game history');
      console.log('  • DELETE all local state');
      console.log('  • Generate a NEW wallet with a NEW address');
      console.log('  • Your username will NOT transfer (tied to old wallet)\n');
      
      if (existingData) {
        // Get current address (need to decrypt if encrypted)
        const keyResult = getPrivateKey(process.env.APECHURCH_PASSWORD);
        if (!keyResult.error) {
          const account = privateKeyToAccount(keyResult.privateKey);
          console.log(`Current wallet: ${account.address}`);
        }
        console.log('\nMake sure you have:');
        console.log('  1. Withdrawn all funds (APE, GP, NFTs)');
        console.log('  2. Backed up your private key (apechurch wallet export)\n');
      }
      
      if (!opts.yes) {
        const confirm = await prompt('Type "RESET" to confirm permanent deletion: ');
        if (confirm.trim() !== 'RESET') {
          console.log('\nCancelled. Your wallet is safe.\n');
          return;
        }
      }
      
      // Show old private key one last time (if accessible)
      if (existingData && !opts.yes) {
        const keyResult = getPrivateKey(process.env.APECHURCH_PASSWORD);
        if (!keyResult.error) {
          console.log('\n📋 Your OLD private key (last chance to save):');
          console.log(`   ${keyResult.privateKey}\n`);
        }
      }
      
      // Delete everything
      try {
        if (fs.existsSync(APECHURCH_DIR)) {
          fs.rmSync(APECHURCH_DIR, { recursive: true, force: true });
        }
      } catch (error) {
        console.error(`\n❌ Failed to clear data: ${error.message}\n`);
        process.exit(1);
      }
      
      // Generate new wallet
      ensureDir(APECHURCH_DIR);
      const newPrivateKey = generatePrivateKey();
      const newAccount = privateKeyToAccount(newPrivateKey);
      fs.writeFileSync(WALLET_FILE, JSON.stringify({ encrypted: false, privateKey: newPrivateKey }), { mode: 0o600 });
      
      // Create fresh profile
      saveProfile({
        version: 1,
        persona: 'balanced',
        username: null,
        paused: false,
        referral: null,
        overrides: {},
      });
      
      console.log('\n✅ Wallet reset complete!\n');
      console.log(`   New address: ${newAccount.address}`);
      console.log('\n   ⚠️  Your old username is tied to your old wallet.');
      console.log('   You\'ll need to register a new username for this address.\n');
      console.log('   Next steps:');
      console.log('   1. Fund your new wallet with APE');
      console.log('   2. Run: apechurch register --username <name>');
      console.log('   3. Run: apechurch wallet export (to back up)\n');
      return;
    }
    
    // --- UNKNOWN ---
    console.log(`Unknown wallet action: ${action}`);
    console.log('Available: export, reset, encrypt, decrypt, unlock, lock, hints, status');
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
      console.log('\n🎰 Ape Church Status\n');
      console.log(`   Address:    ${response.address}`);
      console.log(`   Balance:    ${response.balance} APE`);
      console.log(`   GP:         ${response.gp_balance} GP`);
      if (houseBalanceApe > 0) {
        console.log(`   House:      ${response.house_balance} APE (staked)`);
      }
      console.log(`   Available:  ${response.available_ape} APE`);
      console.log(`   Username:   ${response.username || '(not set)'}`);
      console.log(`   Persona:    ${response.persona}`);
      console.log(`   Paused:     ${response.paused ? 'Yes' : 'No'}`);
      console.log(`   Can Play:   ${response.can_play ? 'Yes' : 'No'}\n`);
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
  .option('--json', 'JSON output only')
  .action(async (gameArg, amountArg, configArgs, opts) => {
    const account = await getWalletWithPrompt({ json: opts.json });
    const loopMode = Boolean(opts.loop);
    const delaySeconds = Math.max(parseFloat(opts.delay) || 3, 1);
    const delayMs = delaySeconds * 1000;
    const targetBalance = opts.target ? parseFloat(opts.target) : null;
    const stopLoss = opts.stopLoss ? parseFloat(opts.stopLoss) : null;
    const maxGames = opts.maxGames ? parseInt(opts.maxGames, 10) : null;
    const maxBet = opts.maxBet ? parseFloat(opts.maxBet) : null;
    
    // Betting strategy setup
    const betStrategyName = opts.betStrategy || 'flat';
    const betStrategy = getStrategy(betStrategyName);
    if (!betStrategy) {
      console.error(JSON.stringify({ error: `Unknown betting strategy: ${betStrategyName}. Available: ${getStrategyNames()}` }));
      process.exit(1);
    }
    
    let startingBalance = null;
    let gamesPlayed = 0;
    let lastGameResult = null; // Track for betting strategy

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
              console.log(`🎉 WON! ${wagerApeNum.toFixed(2)} APE → ${payoutApe.toFixed(2)} APE (+${pnlApe.toFixed(2)} APE)\n`);
            } else if (payoutApe > 0) {
              // Partial loss - got some back
              const lostApe = Math.abs(pnlApe);
              console.log(`❌ Lost ${lostApe.toFixed(2)} APE (${wagerApeNum.toFixed(2)} APE → ${payoutApe.toFixed(2)} APE)\n`);
            } else {
              // Total loss
              console.log(`❌ Lost ${wagerApeNum.toFixed(2)} APE — better luck next time!\n`);
            }
          } else {
            // Result pending (rare - if event didn't fire in time)
            console.log(`⏳ Pending — watch result: ${playResponse.game_url}\n`);
          }
        }

        // Return game result for betting strategy
        const gameResult = hasResult ? {
          won,
          bet: parseFloat(wagerApeString),
          payout: parseFloat(playResponse.result.payout_ape),
        } : null;
        
        return { shouldStop: false, gameResult };
      } catch (error) {
        if (opts.json) {
          console.error(JSON.stringify({ error: error.message }));
        } else {
          console.error(`\n❌ Error: ${error.message}\n`);
        }
        return { shouldStop: true, reason: 'error', gameResult: null };
      }
    }

    // Execute
    if (loopMode) {
      // Initialize betting strategy
      const baseBet = amountInput ? parseFloat(amountInput) : 10; // Default base bet
      let betStrategyState = betStrategy.init(baseBet, { maxBet });
      
      while (true) {
        // Check balance for target/stop-loss
        const { publicClient } = createClients();
        const balance = await publicClient.getBalance({ address: account.address });
        const balanceApe = parseFloat(formatEther(balance));
        const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
        
        // Track starting balance
        if (startingBalance === null) startingBalance = balanceApe;
        
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
          const netResult = balanceApe - startingBalance;
          const sign = netResult >= 0 ? '+' : '';
          console.log(`\n🏁 Max games reached! Played ${gamesPlayed}/${maxGames} games`);
          console.log(`   Balance: ${balanceApe.toFixed(2)} APE (${sign}${netResult.toFixed(2)} APE)`);
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
        }
        
        if (result.shouldStop) break;
        
        // Show balance and countdown before next game
        if (!opts.json) {
          const { publicClient: pc } = createClients();
          const currentBal = await pc.getBalance({ address: account.address });
          const currentApe = parseFloat(formatEther(currentBal));
          const change = startingBalance !== null ? currentApe - startingBalance : 0;
          const changeStr = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
          console.log(`\n⏳ Next game in ${delaySeconds}s | 💰 Balance: ${currentApe.toFixed(2)} APE (${changeStr})`);
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
          console.log('  Run: apechurch install  (to set up your agent first)');
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
        console.log('  → Run: apechurch contest register\n');
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
  .option('--json', 'JSON output')
  .action(async (opts) => {
    const account = await getWalletWithPrompt({ json: opts.json });
    const { publicClient } = createClients();
    const history = loadHistory();
    const limit = parseInt(opts.limit) || 10;
    
    const recentGames = history.games.slice(0, limit);
    
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
    
    for (const [contract, games] of Object.entries(gamesByContract)) {
      const gameIds = games.map(g => BigInt(g.gameId));
      
      try {
        const [players, buyIns, payouts, timestamps, hasEndeds] = await publicClient.readContract({
          address: contract,
          abi: GAME_CONTRACT_ABI,
          functionName: 'getEssentialGameInfo',
          args: [gameIds],
        });

        for (let i = 0; i < games.length; i++) {
          const game = games[i];
          const gameEntry = GAME_REGISTRY.find(g => g.contract.toLowerCase() === contract.toLowerCase());
          
          results.push({
            timestamp: game.timestamp,
            game: gameEntry?.name || 'Unknown',
            gameId: game.gameId,
            contract,
            player: players[i],
            wager_ape: formatEther(buyIns[i]),
            payout_ape: formatEther(payouts[i]),
            pnl_ape: formatEther(payouts[i] - buyIns[i]),
            won: payouts[i] > buyIns[i],
            settled: hasEndeds[i],
            chain_timestamp: Number(timestamps[i]),
          });
        }
      } catch (error) {
        // Skip failed fetches
      }
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    if (opts.json) {
      console.log(JSON.stringify({ games: results }));
    } else {
      console.log('\n📜 Recent Games\n');
      for (const r of results) {
        const status = r.settled ? (r.won ? '✅' : '❌') : '⏳';
        const pnl = parseFloat(r.pnl_ape) >= 0 ? `+${r.pnl_ape}` : r.pnl_ape;
        console.log(`   ${status} ${r.game}: ${r.wager_ape} APE → ${pnl} APE`);
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
      console.log('\n🎰 Available Games\n');
      for (const game of GAME_REGISTRY) {
        console.log(`   ${game.name} (${game.key})`);
        console.log(`      ${game.description}`);
        if (game.aliases?.length) console.log(`      Aliases: ${game.aliases.join(', ')}`);
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
          description: 'Classic blackjack with optimal strategy bot',
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

  apechurch blackjack <amount>      Start new game with bet
  apechurch blackjack resume        Resume unfinished game
  apechurch blackjack status        Check current game state

${'─'.repeat(60)}
  OPTIONS
${'─'.repeat(60)}

  --auto          Bot plays optimal basic strategy for you
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

  apechurch blackjack 10                   Play one hand, 10 APE
  apechurch blackjack 25 --auto            Bot plays one hand
  apechurch blackjack 25 --auto --loop     Bot grinds until broke
  apechurch blackjack 10 --auto --loop --target 500
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
          description: 'Jacks or Better video poker with optimal strategy bot',
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

  apechurch video-poker <amount>    Start new game (1/5/10/25/50/100 APE)
  apechurch video-poker resume      Resume unfinished game
  apechurch video-poker status      Check current game state
  apechurch video-poker payouts     Show payout table

${'─'.repeat(60)}
  OPTIONS
${'─'.repeat(60)}

  --auto          Bot plays optimal discard strategy
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

  apechurch video-poker 10              Play one hand, 10 APE
  apechurch video-poker 100             Max bet (jackpot eligible)
  apechurch video-poker 25 --auto       Bot plays one hand
  apechurch video-poker 25 --auto --loop
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
  apechurch install              Setup wallet and register
  apechurch uninstall            Remove local data

WALLET
  apechurch wallet export        Show private key (back this up!)
  apechurch wallet reset         Generate new wallet (DANGER: deletes old one)
  apechurch wallet status        Check encryption and session status
  apechurch wallet encrypt       Add password protection (optional, not for AI agents)
  apechurch wallet decrypt       Remove password protection
  apechurch wallet unlock        Start session (default: 3 hours)
  apechurch wallet lock          End session immediately
  apechurch wallet hints         View or update password hints (up to 3)
  apechurch send APE <amt> <to>  Send APE (native currency) to an address
  apechurch send GP <amt> <to>   Send GP (Gimbo Points, 0 decimals) to an address

THE HOUSE (Staking)
  apechurch house                Show house stats and your position
  apechurch house deposit <amt>  Deposit APE (15-min lock, 2% withdraw fee)
  apechurch house withdraw <amt> Withdraw APE (must be unlocked)

STATUS
  apechurch status               Check balance and state
  apechurch profile show         Show profile
  apechurch profile set          Update profile (--persona, --referral)

PLAY
  apechurch play                 Play random game
  apechurch play <game> <amt>    Play specific game
  apechurch play --loop          Continuous play
  apechurch bet --game X --amount Y   Manual bet

CONTROL
  apechurch pause                Stop autonomous play
  apechurch resume               Resume play
  apechurch register --username <name>   Set or change username

INFO
  apechurch games                List all games
  apechurch game <name>          Game details
  apechurch history              Recent games
  apechurch commands             This help

CONTEST
  apechurch contest              Contest info and your status
  apechurch contest register     Register for the contest (5 APE)

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
  apechurch play jungle-plinko 10 2 50
  apechurch play roulette 50 RED
  apechurch play ape-strong 10 50
  
  # Loop with safety limits
  apechurch play --loop --target 200 --stop-loss 50
  
  # Martingale: start at 10, double on loss, max 100
  apechurch play roulette 10 RED --loop --bet-strategy martingale --max-bet 100
  
  # Blackjack with strategy
  apechurch blackjack 5 --auto --loop --bet-strategy martingale --target 100
  
  # Run exactly 20 games
  apechurch play ape-strong 10 --loop --max-games 20
  
  apechurch register --username my_bot_name
  apechurch send APE 10 0x1234...abcd

ASSETS
  APE    Native currency (18 decimals)
         - Used for betting, gas fees, and transfers
         - Check balance: apechurch status
  
  GP     Gimbo Points (0 decimals, whole numbers only)
         - Earned as cashback from playing games
         - Non-transferable until claimed (use getCurrentEXP to check)
         - Send to others: apechurch send GP <amount> <address>
`);
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
        console.log('\n🏠 The House\n');
        console.log(`   Total Staked:  ${totalSupplyApe.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} APE`);
        console.log(`   Max Payout:    ${maxPayoutApe.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} APE`);
        console.log(`   House Yield:   ${priceMultiplier.toFixed(4)}x (${((priceMultiplier - 1) * 100).toFixed(2)}% profit since launch)`);
        
        if (hasWallet && userBalanceApe > 0) {
          console.log('\n   Your Position:');
          console.log(`   Staked:        ${userBalanceApe.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} APE`);
          console.log(`   Total Profit:  ${userProfitsApe >= 0 ? '+' : ''}${userProfitsApe.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} APE`);
          console.log(`   Unlock:        ${formatTimeRemaining(lockSeconds)}`);
        } else if (hasWallet) {
          console.log('\n   You have no APE staked in The House.');
          console.log('   Run: apechurch house deposit <amount>');
        } else {
          console.log('\n   No wallet found. Run: apechurch install');
        }
        console.log('');
      }
      return;
    }

    // --- DEPOSIT ---
    if (action === 'deposit') {
      if (!amount) {
        const error = { error: 'Amount required. Usage: apechurch house deposit <amount>' };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error('\n❌ Amount required. Usage: apechurch house deposit <amount>\n');
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
        const error = { error: 'Amount required. Usage: apechurch house withdraw <amount>' };
        if (opts.json) console.log(JSON.stringify(error));
        else console.error('\n❌ Amount required. Usage: apechurch house withdraw <amount>\n');
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
    else console.error(`\n❌ Unknown action: ${action}\nUsage:\n  apechurch house                  Show house stats\n  apechurch house deposit <amt>    Deposit APE\n  apechurch house withdraw <amt>   Withdraw APE\n`);
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
  .option('--auto', 'Auto-play using optimal basic strategy')
  .option('--loop', 'Keep playing until balance runs out')
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--target <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .action(async (action, amount, opts) => {
    // Dynamic import to avoid loading stateful game code when not needed
    const blackjack = await import('../lib/stateful/blackjack/index.js');
    
    // Determine what to do based on action
    if (!action || !isNaN(parseFloat(action))) {
      // No action or amount = start new game
      const betAmount = action || amount;
      if (!betAmount) {
        console.error('\n❌ Bet amount required');
        console.error('   Usage: apechurch blackjack <amount>\n');
        console.error('   Example: apechurch blackjack 10\n');
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
  .option('--auto', 'Auto-play using optimal strategy')
  .option('--loop', 'Keep playing until balance runs out')
  .option('--max-games <count>', 'Stop after N games (use with --loop)')
  .option('--target <ape>', 'Stop when balance reaches this amount (use with --loop)')
  .option('--stop-loss <ape>', 'Stop when balance drops to this amount (use with --loop)')
  .action(async (action, amount, opts) => {
    const videoPoker = await import('../lib/stateful/video-poker/index.js');
    
    // If action is a number, treat it as bet amount
    if (!action || !isNaN(parseFloat(action))) {
      const betAmount = action || amount;
      if (!betAmount) {
        console.error('\n❌ Bet amount required');
        console.error('   Valid bets: 1, 5, 10, 25, 50, 100 APE');
        console.error('   Usage: apechurch video-poker <amount>\n');
        console.error('   Example: apechurch video-poker 10\n');
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
program.parse(process.argv);

// Show update notification if available (after command completes)
notifier.notify({
  isGlobal: true,
  message: 'Update available: {currentVersion} → {latestVersion}\nRun: npm i -g @ape-church/skill',
});
