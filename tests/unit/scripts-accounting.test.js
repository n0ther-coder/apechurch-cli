import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeScriptCommand } from '../../lib/scripts.js';
import { stripAnsi } from '../../lib/ansi.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = path.join(root, 'bin/cli.js');
const scriptModule = pathToFileURL(path.join(root, 'lib/scripts.js')).href;

describe('Accounting script command regression', () => {
  it('writes and reads precise amounts, PnL percentages and wallet guards without executing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-script-roundtrip-'));
    try {
      const argv = ['play', 'blocks', '12.123456789012345678', '--grid', '3x3', '--risk', '0',
        '--min-balance', '100', '--max-balance', '2000', '--min-profit', '25%',
        '--max-loss', '10%', '--take-profit', '25%', '--stop-loss', '10%', '--json'];
      const env = { ...process.env, APECHURCH_CLI_CONFIG_DIR: dir, APECHURCH_CLI_SCR_DIR: dir };
      const written = spawnSync(process.execPath, [cli, 'script', 'write', 'accounting', ...argv], { env, encoding: 'utf8' });
      assert.equal(written.status, 0, written.stderr);
      const payload = JSON.parse(fs.readFileSync(path.join(dir, 'accounting.json'), 'utf8'));
      assert.deepEqual(normalizeScriptCommand(payload), argv);
      const read = spawnSync(process.execPath, [cli, 'script', 'read', 'accounting'], { env, encoding: 'utf8' });
      assert.equal(read.status, 0, read.stderr);
      assert.match(read.stdout, /12\.123456789012345678/);
      assert.match(read.stdout, /--min-balance 100 --max-balance 2000/);
      assert.match(read.stdout, /--min-profit 25% --max-loss 10% --take-profit 25% --stop-loss 10%/);
      assert.equal(fs.existsSync(path.join(dir, 'wallet.json')), false);
      assert.equal(fs.existsSync(path.join(dir, 'history')), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('preserves nested command quoting and does not reinterpret old loss options as wallet guards', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-script-nested-'));
    try {
      const nested = 'bot=example-child --target "blocks --grid 4x4 --risk 1" step1=\'keno --picks 3\' --loss-budget 50%';
      const argv = ['bot', 'example-parent', '--pipeline', nested, '--stop-loss', '20', '--min-balance', '100'];
      const env = { ...process.env, APECHURCH_CLI_CONFIG_DIR: dir, APECHURCH_CLI_SCR_DIR: dir };
      const result = spawnSync(process.execPath, [cli, 'script', 'write', 'nested', ...argv], { env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(fs.readFileSync(path.join(dir, 'nested.json'), 'utf8'));
      assert.deepEqual(normalizeScriptCommand(payload), argv);
      const read = spawnSync(process.execPath, [cli, 'script', 'read', 'nested'], { env, encoding: 'utf8' });
      assert.equal(read.status, 0, read.stderr);
      const captureCli = path.join(dir, 'apechurch-cli');
      fs.writeFileSync(captureCli, '#!/bin/sh\nprintf \'%s\\0\' "$@"\n', { mode: 0o700 });
      const shell = spawnSync('/bin/sh', ['-c', read.stdout], {
        env: { ...env, PATH: `${dir}${path.delimiter}${process.env.PATH}` }, encoding: 'utf8',
      });
      assert.equal(shell.status, 0, shell.stderr);
      assert.deepEqual(shell.stdout.split('\0').slice(0, -1), argv);
      assert.match(read.stdout, /--stop-loss 20 --min-balance 100/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('watches exact argv, resumes only pending children and cleans up its lock', { timeout: 12000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-script-watch-'));
    let watcher;
    try {
      const argv = ['play', 'blocks', '12.123456789012345678', '--min-balance', '100', '--max-loss', '10%'];
      fs.writeFileSync(path.join(dir, 'safe.json'), JSON.stringify({ command: argv }));
      const fake = path.join(dir, 'fake-cli.mjs');
      const calls = path.join(dir, 'calls.jsonl');
      fs.writeFileSync(fake, `import fs from 'node:fs';
const file = ${JSON.stringify(calls)};
const n = fs.existsSync(file) ? fs.readFileSync(file,'utf8').trim().split('\\n').length : 0;
fs.appendFileSync(file, JSON.stringify({argv:process.argv.slice(2),resume:process.env.APECHURCH_CLI_WATCH_RESUME ?? null})+'\\n');
process.exit(n === 0 ? 75 : 0);
`);
      const runner = path.join(dir, 'watch.mjs');
      fs.writeFileSync(runner, `import {watchCommandScript} from ${JSON.stringify(scriptModule)};
await watchCommandScript('safe',{every:'1'},{cliPath:${JSON.stringify(fake)}});`);
      watcher = spawn(process.execPath, [runner], { env: { ...process.env,
        APECHURCH_CLI_CONFIG_DIR: dir, APECHURCH_CLI_SCR_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let errors = '';
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { watcher.kill('SIGTERM'); reject(new Error(`Watcher timed out: ${output} ${errors}`)); }, 9000);
        const capture = (chunk) => {
          output += chunk;
          if ((stripAnsi(output).match(/Script exited with code/g) ?? []).length >= 3) watcher.kill('SIGTERM');
        };
        watcher.stdout.on('data', capture);
        watcher.stderr.on('data', capture);
        watcher.once('error', reject);
        watcher.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(errors || output)); });
      });
      const recorded = fs.readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(recorded.length, 3);
      assert.deepEqual(recorded.map((call) => call.argv), [argv, argv, argv]);
      assert.deepEqual(recorded.map((call) => call.resume), [null, '1', null]);
      assert.match(output, /Resuming pending run; balance conditions bypassed/);
      const stateDir = path.join(dir, 'watch');
      assert.ok(fs.readdirSync(stateDir).every((name) => !name.endsWith('.lock')));
      const state = JSON.parse(fs.readFileSync(path.join(stateDir, fs.readdirSync(stateDir).find((name) => name.endsWith('.json'))), 'utf8'));
      assert.equal(state.watcher_pid, null);
      assert.equal(state.child_pid, null);
      assert.equal(state.resume_pending, false);
    } finally {
      if (watcher?.exitCode === null) watcher.kill('SIGTERM');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});


it('stops watch on configuration errors, returns 78 and releases the lock', { timeout: 8000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-config-watch-'));
  try {
    fs.writeFileSync(path.join(dir, 'invalid.json'), JSON.stringify({ command: ['bot', 'example'] }));
    const fake = path.join(dir, 'fake-cli.mjs');
    const calls = path.join(dir, 'calls');
    fs.writeFileSync(fake, `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(calls)}, 'attempt\\n');
process.exit(78);`);
    const runner = path.join(dir, 'watch.mjs');
    fs.writeFileSync(runner, `import {watchCommandScript} from ${JSON.stringify(scriptModule)};
process.exitCode = await watchCommandScript('invalid',{every:'1'},{cliPath:${JSON.stringify(fake)}});`);
    const result = spawnSync(process.execPath, [runner], { timeout: 5000, encoding: 'utf8',
      env: { ...process.env, APECHURCH_CLI_CONFIG_DIR: dir, APECHURCH_CLI_SCR_DIR: dir } });
    assert.equal(result.status, 78, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /Configuration error: stopping watch/);
    assert.equal(fs.readFileSync(calls, 'utf8'), 'attempt\n');
    const stateDir = path.join(dir, 'watch');
    const files = fs.readdirSync(stateDir);
    assert.ok(files.every(name => !name.endsWith('.lock')));
    const state = JSON.parse(fs.readFileSync(path.join(stateDir, files.find(name => name.endsWith('.json'))), 'utf8'));
    assert.equal(state.stop_reason, 'configuration_error');
    assert.equal(state.watcher_pid, null);
    assert.equal(state.child_pid, null);
    assert.equal(state.resume_pending, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
