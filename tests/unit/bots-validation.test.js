import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateBotInvocation } from '../../lib/bots.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-validation-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
let sequence = 0;
function fixture(command, source) {
  const entryPath = path.join(root, `${sequence++}.mjs`);
  fs.writeFileSync(entryPath, source);
  return { command, entryPath };
}

describe('Offline bot validation context', () => {
  it('retains two-argument parser compatibility without calling a handler', async () => {
    const bot = fixture('parser', `
      export function parseArgs(args, session) {
        if (args[0] !== 'valid' || session.marker !== 7) throw Error('Invalid parser input');
      }
      export default function () { throw Error('Gameplay handler called'); }
    `);
    assert.equal((await validateBotInvocation(bot, ['valid'], { session: { marker: 7 } })).status, 'valid');
    await assert.rejects(validateBotInvocation(bot, ['invalid']), /Invalid parser input/);
  });

  it('prefers the async validator and exposes only offline capabilities', async () => {
    const bot = fixture('validator', `
      export function parseArgs() { throw Error('Fallback parser called'); }
      export async function validateArgs(args, session, ctx) {
        if (session !== ctx.session) throw Error('Session mismatch');
        if (Object.keys(ctx).sort().join(',') !==
          'resolveBot,resolveGame,session,validateBotArgs,validatePlayArgs') throw Error('Unexpected capability');
        if ((await ctx.resolveGame('sample')).key !== 'sample') throw Error('Game resolver missing');
        if ((await ctx.resolveBot('child')).command !== 'child') throw Error('Bot resolver missing');
      }
      export default function () { throw Error('Gameplay handler called'); }
    `);
    const payload = await validateBotInvocation(bot, [], {
      gameResolver: async name => ({ key: name }),
      botResolver: async name => ({ command: name }),
    });
    assert.equal(payload.status, 'valid');
  });

  it('propagates errors from nested validators and permits valid siblings', async () => {
    const child = fixture('child', `
      export function parseArgs(args) {
        if (args.includes('--invalid')) throw Error('Unknown child option');
      }
      export default function () { throw Error('Child handler called'); }
    `);
    const parent = fixture('parent', `
      export async function validateArgs(args, session, ctx) {
        await ctx.validateBotArgs('child', args);
        await ctx.validateBotArgs('child', args);
      }
      export default function () { throw Error('Parent handler called'); }
    `);
    const options = { botResolver: name => name === 'child' ? child : null };
    assert.equal((await validateBotInvocation(parent, ['valid'], options)).status, 'valid');
    await assert.rejects(validateBotInvocation(parent, ['--invalid'], options), /Unknown child option/);
  });

  it('rejects unknown child commands', async () => {
    const bot = fixture('parent', `
      export async function validateArgs(args, session, ctx) { await ctx.validateBotArgs('absent', []); }
    `);
    await assert.rejects(validateBotInvocation(bot), /Unknown bot command "absent"/);
  });

  it('rejects cycles even when an alias resolves to the same entry', async () => {
    const bot = fixture('parent', `
      export async function validateArgs(args, session, ctx) { await ctx.validateBotArgs('alias', args); }
    `);
    await assert.rejects(validateBotInvocation(bot, [], {
      botResolver: () => ({ ...bot, command: 'alias' }),
    }), /Recursive bot validation cycle/);
  });

  it('bounds recursion when each recursive call has different arguments', async () => {
    const bot = fixture('recursive', `
      export async function validateArgs(args, session, ctx) {
        await ctx.validateBotArgs('recursive', [String(Number(args[0] || 0) + 1)]);
      }
    `);
    await assert.rejects(validateBotInvocation(bot, ['0'], {
      botResolver: () => bot,
    }), /maximum depth of 32/);
  });

  it('uses only validate-only CLI calls for child plays and preserves failures', async () => {
    const cliPath = path.join(root, 'cli.cjs');
    fs.writeFileSync(cliPath, `
      const [, , command, ...args] = process.argv;
      if (command !== 'play' || !args.includes('--validate-only') || !args.includes('--json')) {
        throw Error('Unsafe validation command');
      }
      if (args.includes('--invalid')) {
        console.error(JSON.stringify({ error: 'Invalid game option' })); process.exit(1);
      }
      console.log(JSON.stringify({ status: 'valid' }));
    `);
    const bot = fixture('play-validator', `
      export async function validateArgs(args, session, ctx) { await ctx.validatePlayArgs(args); }
    `);
    assert.equal((await validateBotInvocation(bot, ['sample', '2'], { cliPath })).status, 'valid');
    await assert.rejects(validateBotInvocation(bot, ['sample', '2', '--invalid'], { cliPath }), /Invalid game option/);
    await assert.rejects(validateBotInvocation(bot, ['sample', '2']), /requires cliPath/);
  });

  it('rejects modules without a validation export and preserves help handling', async () => {
    const bot = fixture('no-validator', 'export default function () { throw Error("Handler called"); }');
    await assert.rejects(validateBotInvocation(bot), /does not expose startup argument validation/);
    assert.equal((await validateBotInvocation(bot, ['--help'])).help, true);
  });
});
