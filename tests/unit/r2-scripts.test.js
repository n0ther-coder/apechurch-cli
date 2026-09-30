import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-script-test-'));
process.env.APECHURCH_CLI_CONFIG_DIR = path.join(root, 'config');
after(() => fs.rmSync(root, { recursive: true, force: true }));
const { syncR2Scripts, resolveR2ScriptObjectKey } = await import('../../lib/r2-scripts.js');
const { saveEncryptedR2Config, enableStoredR2Config, disableSelectedR2Config, loadSelectedR2Credentials, getR2SelectorFile, getR2PublicMetadata } = await import('../../lib/r2.js');
const credentials = { bucket: 'example-scripts', account_id: 'test-account', api_token: 'test-token', access_key_id: 'test-key', secret_access_key: 'test-secret' };
const credentialsResult = { enabled: true, credentials };
const body = (command) => JSON.stringify({ command: [command] });
const base = new Date('2026-01-01T12:00:00Z');
function fixture() {
  const scriptDir = fs.mkdtempSync(path.join(root, 'scripts-'));
  return {
    scriptDir,
    credentialsResult,
    write(name, content, time = base) {
      const file = path.join(scriptDir, name);
      fs.writeFileSync(file, content);
      fs.utimesSync(file, time, time);
    },
  };
}

describe('independent script bucket and sync', () => {
  it('preserves the existing log selector through script install, enable, and disable', () => {
    const password = 'test-password';
    saveEncryptedR2Config({ ...credentials, bucket: 'example-logs' }, password);
    const logBefore = fs.readFileSync(getR2SelectorFile(), 'utf8');
    saveEncryptedR2Config(credentials, password, { type: 'script' });
    assert.equal(loadSelectedR2Credentials({ password }).bucket, 'example-logs');
    assert.equal(loadSelectedR2Credentials({ password, type: 'script' }).bucket, 'example-scripts');
    assert.equal(getR2PublicMetadata({ type: 'script' }).prefix_env_var, null);
    disableSelectedR2Config({ type: 'script' });
    assert.equal(getR2PublicMetadata({ type: 'script' }).enabled, false);
    assert.equal(getR2PublicMetadata().enabled_bucket, 'example-logs');
    enableStoredR2Config('example-scripts', { type: 'script' });
    assert.equal(fs.readFileSync(getR2SelectorFile(), 'utf8'), logBefore);
    assert.throws(() => getR2SelectorFile('other'), /Invalid bucket type/);
  });

  it('transfers new versions both ways and preserves downloaded bytes and remote mtime', async () => {
    const f = fixture();
    f.write('routine-v1.json', body('status'));
    const uploads = [];
    const result = await syncR2Scripts({ ...f,
      listObjects: async (_, opts) => { assert.equal(opts.prefix, ''); return { objects: [{ key: 'routine-v2.json', lastModified: base }] }; },
      getObject: async () => ({ body: body('games') }),
      putObject: async (_, key, value) => uploads.push([key, value]),
    });
    assert.equal(result.uploaded, 1); assert.equal(result.downloaded, 1);
    assert.deepEqual(uploads, [['routine-v1.json', body('status')]]);
    assert.equal(fs.readFileSync(path.join(f.scriptDir, 'routine-v2.json'), 'utf8'), body('games'));
    assert.equal(fs.statSync(path.join(f.scriptDir, 'routine-v2.json')).mtimeMs, base.getTime());
    assert.deepEqual(fs.readdirSync(f.scriptDir).sort(), ['routine-v1.json', 'routine-v2.json']);
  });

  it('chooses the newer timestamp for matching names', async () => {
    const f = fixture();
    f.write('local.json', body('status'), new Date(base.getTime() + 5000));
    f.write('remote.json', body('status'));
    const uploaded = [];
    const result = await syncR2Scripts({ ...f,
      listObjects: async () => ({ objects: [
        { key: 'local.json', lastModified: base },
        { key: 'remote.json', lastModified: new Date(base.getTime() + 5000) },
      ] }),
      putObject: async (_, key) => uploaded.push(key),
      getObject: async () => ({ body: body('games') }),
    });
    assert.deepEqual(uploaded, ['local.json']);
    assert.equal(result.downloaded, 1);
    assert.equal(fs.readFileSync(path.join(f.scriptDir, 'remote.json'), 'utf8'), body('games'));
  });

  it('skips tied timestamps with different content and invalid scripts without overwriting', async () => {
    const f = fixture();
    f.write('tied.json', body('status'));
    f.write('invalid.json', '{}');
    const result = await syncR2Scripts({ ...f,
      listObjects: async () => ({ objects: [
        { key: 'tied.json', lastModified: base }, { key: 'invalid.json', lastModified: base },
        { key: 'bad-remote.json', lastModified: base }, { key: '../escape.json', lastModified: base },
      ] }),
      getObject: async (_, key) => ({ body: key === 'tied.json' ? body('games') : '{}' }),
      putObject: async () => assert.fail('must not upload'),
    });
    assert.equal(result.inconsistencies.length, 4);
    assert.equal(fs.readFileSync(path.join(f.scriptDir, 'tied.json'), 'utf8'), body('status'));
    assert.equal(fs.existsSync(path.join(f.scriptDir, 'bad-remote.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'escape.json')), false);
  });

  it('does not follow local symlinks or replace a local edit made during download', async () => {
    const f = fixture();
    const outside = path.join(root, 'outside.json'); fs.writeFileSync(outside, body('status'));
    fs.symlinkSync(outside, path.join(f.scriptDir, 'linked.json'));
    f.write('edited.json', body('status'));
    const result = await syncR2Scripts({ ...f,
      listObjects: async () => ({ objects: ['linked.json', 'edited.json'].map((key) => ({ key, lastModified: new Date(base.getTime() + 5000) })) }),
      getObject: async (_, key) => {
        assert.equal(key, 'edited.json');
        f.write('edited.json', body('balance'), new Date(base.getTime() + 10000));
        return { body: body('games') };
      },
      putObject: async () => assert.fail('must not upload'),
    });
    assert.equal(result.inconsistencies.length, 2);
    assert.equal(fs.readFileSync(outside, 'utf8'), body('status'));
    assert.equal(fs.readFileSync(path.join(f.scriptDir, 'edited.json'), 'utf8'), body('balance'));
  });

  it('filters one script by exact name and rejects path traversal', async () => {
    const f = fixture(); f.write('routine-v2.json', body('status')); f.write('other.json', body('status'));
    const result = await syncR2Scripts({ ...f, script: 'routine-v2',
      listObjects: async (_, opts) => { assert.equal(opts.prefix, 'routine-v2'); return { objects: [{ key: 'routine-v2.json.bak' }] }; },
      putObject: async (_, key) => assert.equal(key, 'routine-v2.json'),
    });
    assert.equal(result.uploaded, 1);
    await assert.rejects(syncR2Scripts({ ...f, script: '../outside' }), /Invalid sync path/);
  });

  it('presigns an explicit script or selects the latest uploaded script without parsing version numbers', async () => {
    assert.equal(await resolveR2ScriptObjectKey(credentials, { targetPath: 'routine-v2', listObjects: async () => assert.fail('must not list') }), 'routine-v2.json');
    assert.equal(await resolveR2ScriptObjectKey(credentials, { listObjects: async () => ({ objects: [
      { key: 'routine-v99.json', lastModified: base },
      { key: 'routine-v2.json', lastModified: new Date(base.getTime() + 1000) },
      { key: 'nested/other.json', lastModified: new Date(base.getTime() + 2000) },
    ] }) }), 'routine-v2.json');
  });
});
