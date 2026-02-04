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
        fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }));
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
      
      if (walletChoice.trim() === '2') {
        const pkInput = await prompt('Enter your private key: ');
        let pk = pkInput.trim();
        if (!pk.startsWith('0x')) pk = '0x' + pk;
        try {
          const account = privateKeyToAccount(pk);
          address = account.address;
          fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }));
          walletWasImported = true;
          console.log(`\n✅ Imported wallet: ${address}`);
        } catch (error) {
          console.error(`\n❌ Invalid private key: ${error.message}`);
          process.exit(1);
        }
      } else {
        const pk = generatePrivateKey();
        const account = privateKeyToAccount(pk);
        fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }));
        address = account.address;
        console.log(`\n✅ Generated new wallet: ${address}`);
        console.log('   (Export anytime with: apechurch wallet export)');
      }
    } else {
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk);
      fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }));
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
  .description('Wallet management (export)')
  .action((action) => {
    if (action === 'export') {
      const data = loadWalletData();
      if (!data) {
        console.error(JSON.stringify({ error: 'No wallet found. Run: apechurch install' }));
        process.exit(1);
      }
      console.log('\n⚠️  PRIVATE KEY - DO NOT SHARE\n');
      console.log(`   ${data.privateKey}\n`);
      console.log('   Store this securely. Anyone with this key controls your funds.\n');
    } else {
      console.log(`Unknown wallet action: ${action}`);
      console.log('Available: export');
    }
  });

// ============================================================================
// COMMAND: STATUS
// ============================================================================
program
  .command('status')
  .option('--json', 'Output JSON only')
  .action(async (opts) => {
    if (!walletExists()) {
      const error = { error: 'No wallet found. Run: apechurch install' };
      if (opts.json) console.log(JSON.stringify(error));
      else console.log('\n❌ ' + error.error + '\n');
      return;
    }

    const account = getWallet();
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

    const balanceApe = parseFloat(formatEther(balance));
    const availableApe = Math.max(balanceApe - GAS_RESERVE_APE, 0);
    const canPlay = availableApe >= 1 && !profile.paused;

    const response = {
      address: account.address,
      balance: balanceApe.toFixed(4),
      available_ape: availableApe.toFixed(4),
      gas_reserve_ape: GAS_RESERVE_APE.toFixed(4),
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
    if (!walletExists()) {
      console.error(JSON.stringify({ error: 'No wallet found. Run: apechurch install' }));
      process.exit(1);
    }

    const account = getWallet();
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
  .option('--json', 'Output JSON')
  .action((action, opts) => {
    const profile = loadProfile();

    if (action === 'show') {
      if (opts.json) {
        console.log(JSON.stringify(profile));
      } else {
        console.log('\n📋 Profile\n');
        console.log(`   Username: ${profile.username || '(not set)'}`);
        console.log(`   Persona:  ${profile.persona}`);
        console.log(`   Paused:   ${profile.paused ? 'Yes' : 'No'}`);
        console.log(`   Referral: ${profile.referral || '(none)'}\n`);
      }
    } else if (action === 'set') {
      const updates = {};
      if (opts.persona) updates.persona = normalizeStrategy(opts.persona);
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
    const account = getWallet();
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
  .option('--strategy <name>', 'conservative | balanced | aggressive | degen')
  .option('--loop', 'Play continuously')
  .option('--delay <seconds>', 'Delay between games in loop', '3')
  .option('--json', 'JSON output only')
  .action(async (gameArg, amountArg, configArgs, opts) => {
    const account = getWallet();
    const loopMode = Boolean(opts.loop);
    const delaySeconds = Math.max(parseFloat(opts.delay) || 3, 1);
    const delayMs = delaySeconds * 1000;

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
      console.log(`\n🔄 Loop mode: ${gameInfo} (${delaySeconds}s between games, Ctrl+C to stop)`);
      console.log('─'.repeat(50));
    }

    async function playOnce() {
      const state = loadState();
      const freshProfile = loadProfile();
      
      if (freshProfile.paused) {
        return { shouldStop: true, reason: 'paused' };
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
        return { shouldStop: true, reason: 'balance_error' };
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
        return { shouldStop: true, reason: 'insufficient_balance' };
      }

      // Determine wager
      let wagerApe;
      if (amountInput) {
        wagerApe = parseFloat(amountInput);
        if (isNaN(wagerApe) || wagerApe <= 0) {
          console.error(JSON.stringify({ error: 'Invalid amount.' }));
          return { shouldStop: true, reason: 'invalid_amount' };
        }
        if (wagerApe > availableApe) {
          console.error(JSON.stringify({ error: `Insufficient balance. Available: ${availableApe.toFixed(4)} APE` }));
          return { shouldStop: true, reason: 'insufficient_balance' };
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

        return { shouldStop: false };
      } catch (error) {
        if (opts.json) {
          console.error(JSON.stringify({ error: error.message }));
        } else {
          console.error(`\n❌ Error: ${error.message}\n`);
        }
        return { shouldStop: true, reason: 'error' };
      }
    }

    // Execute
    if (loopMode) {
      while (true) {
        const result = await playOnce();
        if (result.shouldStop) break;
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
      
      if (!walletExists()) {
        const msg = { error: 'No wallet found. Run: apechurch install' };
        if (opts.json) console.log(JSON.stringify(msg));
        else console.log('\n❌ No wallet found. Run: apechurch install\n');
        return;
      }

      const account = getWallet();
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

    const account = getWallet();
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
    const account = getWallet();
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
    const game = resolveGame(name);
    if (!game) {
      const error = { error: `Unknown game: ${name}`, available: listGames() };
      if (opts.json) console.log(JSON.stringify(error));
      else console.log(`\n❌ Unknown game: "${name}"\nAvailable: ${GAME_LIST}\n`);
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
  apechurch wallet export        Show private key

WALLET
  apechurch send APE <amt> <to>  Send APE to an address

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
  apechurch register             Change username

INFO
  apechurch games                List all games
  apechurch game <name>          Game details
  apechurch history              Recent games
  apechurch commands             This help

CONTEST
  apechurch contest              Contest info and your status
  apechurch contest register     Register for the contest (5 APE)

EXAMPLES
  apechurch play jungle-plinko 10 2 50
  apechurch play roulette 50 RED
  apechurch play ape-strong 10 50
  apechurch play --loop --strategy aggressive
  apechurch profile set --referral 0x1234...abcd
  apechurch send APE 10 0x1234...abcd
`);
  });

// ============================================================================
// COMMAND: SEND (Transfer assets)
// ============================================================================
program
  .command('send <asset> <amount> <destination>')
  .description('Send APE or tokens to an address')
  .option('--json', 'JSON output only')
  .action(async (asset, amount, destination, opts) => {
    if (!walletExists()) {
      const error = { error: 'No wallet found. Run: apechurch install' };
      if (opts.json) console.log(JSON.stringify(error));
      else console.error('\n❌ No wallet found. Run: apechurch install\n');
      process.exit(1);
    }

    // Validate destination address
    const dest = destination.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(dest)) {
      const error = { error: 'Invalid destination address. Must be a valid Ethereum address (0x...)' };
      if (opts.json) console.log(JSON.stringify(error));
      else console.error('\n❌ Invalid destination address. Must be a valid Ethereum address (0x...)\n');
      process.exit(1);
    }

    // Parse amount
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

    const assetUpper = asset.toUpperCase();

    // Currently only APE (native) is supported
    if (assetUpper !== 'APE') {
      const error = { error: `Unsupported asset: ${asset}. Currently only APE is supported.` };
      if (opts.json) console.log(JSON.stringify(error));
      else console.error(`\n❌ Unsupported asset: ${asset}. Currently only APE is supported.\n`);
      process.exit(1);
    }

    const account = getWallet();
    const { publicClient, walletClient } = createClients(account);

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
    const estimatedGas = 21000n; // Standard ETH transfer gas
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

    // Send transaction
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
      // Transaction sent but confirmation timed out
      const result = {
        status: 'pending',
        asset: 'APE',
        amount: amount,
        destination: dest,
        tx: txHash,
      };
      if (opts.json) console.log(JSON.stringify(result));
      else console.log(`⏳ Transaction sent but confirmation pending\n   TX: ${txHash}\n`);
      return;
    }

    const success = receipt.status === 'success';
    const result = {
      status: success ? 'success' : 'failed',
      asset: 'APE',
      amount: amount,
      destination: dest,
      tx: txHash,
      gasUsed: receipt.gasUsed.toString(),
    };

    if (opts.json) {
      console.log(JSON.stringify(result));
    } else if (success) {
      console.log(`✅ Sent ${amount} APE to ${dest.slice(0, 6)}...${dest.slice(-4)}`);
      console.log(`   TX: ${txHash}\n`);
    } else {
      console.log(`❌ Transaction failed`);
      console.log(`   TX: ${txHash}\n`);
    }
  });

// ============================================================================
// PARSE
// ============================================================================
program.parse(process.argv);
