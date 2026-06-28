import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'apechurch-bots-runtime-'));
process.env.APECHURCH_CLI_LOG_DIR = path.join(tmpRoot, 'logs');

const fakeCliPath = path.join(tmpRoot, 'fake-cli.js');
fs.writeFileSync(fakeCliPath, `
const [, , command, ...args] = process.argv;
console.log(JSON.stringify({ command, args }));
`);

const { createBotRuntimeContext } = await import('../../lib/bots.js');

function createContext(rawArgs = []) {
  return createBotRuntimeContext({
    name: 'Test Bot',
    command: 'test-bot',
    description: '',
    directory: tmpRoot,
    manifestPath: path.join(tmpRoot, 'bot.json'),
    entryPath: path.join(tmpRoot, 'index.js'),
  }, {
    cliPath: fakeCliPath,
    rawArgs,
  });
}

describe('Bot Runtime Context', () => {
  it('adds bot-level --resilient to direct playJson calls', async () => {
    const ctx = createContext(['--resilient']);

    const payload = await ctx.playJson(['ape-strong', '1', '60']);

    assert.strictEqual(payload.command, 'play');
    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--resilient', '--json']);
  });

  it('does not duplicate --resilient when a playJson call already includes it', async () => {
    const ctx = createContext(['--resilient']);

    const payload = await ctx.playJson(['ape-strong', '1', '60', '--resilient']);

    assert.strictEqual(payload.args.filter((arg) => arg === '--resilient').length, 1);
    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--resilient', '--json']);
  });

  it('does not add inherited --resilient when the bot-level flag is disabled', async () => {
    const ctx = createContext(['--no-resilient']);

    const payload = await ctx.playJson(['ape-strong', '1', '60']);

    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--json']);
  });

  it('does not treat --resilient=false as a bot-level resilient value', async () => {
    const ctx = createContext(['--resilient=false']);

    const payload = await ctx.playJson(['ape-strong', '1', '60']);

    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--json']);
  });

  it('lets a direct playJson call opt out of inherited --resilient', async () => {
    const ctx = createContext(['--resilient']);

    const payload = await ctx.playJson(['ape-strong', '1', '60', '--no-resilient']);

    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--no-resilient', '--json']);
  });

  it('adds bot-level --resilient to direct play validation calls', async () => {
    const ctx = createContext(['--resilient']);

    const payload = await ctx.validatePlayArgs(['ape-strong', '1', '60']);

    assert.deepStrictEqual(payload.args, ['ape-strong', '1', '60', '--resilient', '--validate-only', '--json']);
  });
});
