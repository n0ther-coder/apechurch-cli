import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncR2Logs } from '../../lib/r2.js';
import { syncR2Scripts } from '../../lib/r2-scripts.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-recursive-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const body = '{"command":["status"]}';
const credentialsResult = { enabled: true, credentials: { bucket: 'example-bucket' } };

for (const type of ['log', 'script']) {
  describe(`R2 ${type} path and recursion contract`, () => {
    const name = (n) => type === 'log' ? `example-bot.2026010112000${n}.json` : `report-v${n}.json`;
    function fixture() {
      const dir = fs.mkdtempSync(path.join(root, `${type}-`));
      const uploaded = [], fetched = [], prefixes = [];
      const prefix = type === 'log' ? 'remote-prefix/' : '';
      function write(key, value = body) {
        const file = path.join(dir, key);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, value);
      }
      async function sync({ target = null, recursive = false, keys = [], getObject } = {}) {
        const options = {
          credentialsResult, recursive,
          listObjects: async (_, opts) => {
            prefixes.push(opts.prefix);
            return { objects: keys.map((key) => ({ key: prefix + key, lastModified: new Date('2026-01-01T00:00:00Z'), size: body.length })) };
          },
          getObject: async (_, key) => { fetched.push(key); return getObject ? getObject(key) : { body }; },
          putObject: async (_, key, value) => { uploaded.push({ key, value }); },
        };
        return type === 'log'
          ? syncR2Logs({ ...options, bot: target, logDir: dir, prefix: 'remote-prefix' })
          : syncR2Scripts({ ...options, script: target, scriptDir: dir });
      }
      return { dir, write, sync, uploaded, fetched, prefixes, prefix };
    }

    it('defaults to direct files and reports subfolders with a recursive hint', async () => {
      const f = fixture(); f.write(name(1)); f.write(`nested/${name(2)}`);
      const result = await f.sync({ keys: [name(3), `nested/deep/${name(4)}`] });
      assert.equal(result.uploaded, 1); assert.equal(result.downloaded, 1);
      assert.deepEqual(f.uploaded.map((o) => o.key), [f.prefix + name(1)]);
      assert.deepEqual(f.fetched, [f.prefix + name(3)]);
      assert.equal(result.recursive, false);
      assert.ok(result.inconsistencies.every((o) => o.reason === 'recursive-required'));
      assert.match(result.hint, /-r \/ --recursive/);
      assert.equal(fs.existsSync(path.join(f.dir, 'nested/deep', name(4))), false);
    });

    it('recursively syncs from a selected folder preserving paths and excluding siblings', async () => {
      const f = fixture(); f.write(`archive/${name(1)}`); f.write(`archive/deep/${name(2)}`);
      f.write(`archive-old/${name(3)}`);
      const result = await f.sync({ target: 'archive/', recursive: true,
        keys: [`archive/remote/deeper/${name(4)}`, `archive-old/${name(5)}`, name(6)] });
      assert.equal(result.uploaded, 2); assert.equal(result.downloaded, 1);
      assert.equal(result.sync_path, 'archive'); assert.equal(result.recursive, true);
      assert.deepEqual(result.inconsistencies, []); assert.equal(result.hint, null);
      assert.deepEqual(f.uploaded.map((o) => o.key).sort(), [f.prefix + `archive/${name(1)}`, f.prefix + `archive/deep/${name(2)}`].sort());
      assert.equal(fs.readFileSync(path.join(f.dir, 'archive/remote/deeper', name(4)), 'utf8'), body);
      assert.equal(fs.existsSync(path.join(f.dir, 'archive-old', name(5))), false);
    });

    it('supports recursive sync from the root and remote-only directories', async () => {
      const f = fixture();
      const result = await f.sync({ target: '.', recursive: true, keys: [`new/deep/${name(1)}`] });
      assert.equal(result.downloaded, 1);
      assert.equal(fs.readFileSync(path.join(f.dir, 'new/deep', name(1)), 'utf8'), body);
    });

    it('syncs direct files in a remote-only folder without recursion', async () => {
      const f = fixture();
      const result = await f.sync({ target: 'remote-folder/', keys: [`remote-folder/${name(1)}`, `remote-folder/deep/${name(2)}`] });
      assert.equal(result.downloaded, 1);
      assert.match(result.hint, /recursive/);
      assert.equal(fs.existsSync(path.join(f.dir, 'remote-folder/deep', name(2))), false);
    });

    it('selects one exact nested file independently of recursive mode', async () => {
      const f = fixture(); const target = `nested/${name(1)}`;
      const result = await f.sync({ target, keys: [target, `nested/${name(2)}`, `${target}.bak`] });
      assert.equal(result.downloaded, 1); assert.equal(result.hint, null);
      assert.deepEqual(f.fetched, [f.prefix + target]);
    });

    it('does not upload a file when its path explicitly requests a folder', async () => {
      const f = fixture(); f.write(name(1));
      await assert.rejects(f.sync({ target: name(1) + '/', recursive: true }), /sync folder is a file/);
      assert.deepEqual(f.uploaded, []); assert.deepEqual(f.fetched, []);
    });

    it('rejects traversal and absolute targets before any remote request', async () => {
      const f = fixture();
      for (const target of ['../outside', '/outside', 'a/../b', 'a//b', 'a\\b', 'C:/outside']) {
        await assert.rejects(f.sync({ target, recursive: true }), /Invalid sync path/);
      }
      assert.deepEqual(f.prefixes, []);
    });

    it('does not read or write through symlinks or a non-directory ancestor', async () => {
      const f = fixture();
      const outside = fs.mkdtempSync(path.join(root, 'outside-'));
      fs.writeFileSync(path.join(outside, name(1)), body);
      fs.symlinkSync(outside, path.join(f.dir, 'linked'));
      f.write('blocked', 'not a directory');
      const result = await f.sync({ recursive: true, keys: [`linked/${name(2)}`, `blocked/${name(3)}`] });
      assert.equal(result.uploaded, 0); assert.equal(result.downloaded, 0);
      assert.equal(result.hint, null);
      assert.ok(result.inconsistencies.some((o) => o.reason === 'unsafe-local-path'));
      assert.equal(fs.existsSync(path.join(outside, name(2))), false);
      assert.deepEqual(f.fetched, []);
      const selected = await f.sync({ target: 'linked/', recursive: true, keys: [`linked/${name(2)}`] });
      assert.equal(selected.downloaded, 0); assert.deepEqual(f.fetched, []);
    });

    it('rejects unsafe remote keys and rechecks download ancestors after the request', async () => {
      const f = fixture();
      const outside = fs.mkdtempSync(path.join(root, 'outside-'));
      const result = await f.sync({ recursive: true, keys: ['../escape.json', `new/${name(1)}`],
        getObject: async () => { fs.symlinkSync(outside, path.join(f.dir, 'new')); return { body }; } });
      assert.equal(result.downloaded, 0);
      assert.equal(fs.existsSync(path.join(outside, name(1))), false);
      assert.equal(result.hint, null);
    });

    it('treats remote folder markers as folders rather than invalid files', async () => {
      const f = fixture();
      const shallow = await f.sync({ keys: ['empty/'] });
      assert.match(shallow.hint, /recursive/);
      const recursive = await f.sync({ recursive: true, keys: ['empty/'] });
      assert.deepEqual(recursive.inconsistencies, []);
      assert.equal(recursive.downloaded, 0);
      assert.deepEqual(f.fetched, []);
    });

    it('does not suggest recursion for invalid JSON alone', async () => {
      const f = fixture(); f.write(name(1), '{broken');
      const result = await f.sync();
      assert.equal(result.uploaded, 0);
      assert.ok(result.inconsistencies.some((o) => o.reason.includes('json')));
      assert.equal(result.hint, null);
    });
  });
}
