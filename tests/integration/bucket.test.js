import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bucket-cli-test-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const cliPath = fileURLToPath(new URL('../../bin/cli.js', import.meta.url));
const mock = path.join(root, 'mock-fetch.mjs');
fs.writeFileSync(mock, `
import fs from 'node:fs';
if (process.env.TEST_TERMINAL === '1') {
  process.stdin.isTTY = process.stdout.isTTY = process.stderr.isTTY = true;
  process.stdin.setRawMode = () => { throw new Error('Unexpected interactive prompt'); };
}
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith('.r2.cloudflarestorage.com')) throw new Error('Unexpected network request');
  fs.appendFileSync(process.env.TEST_REQUESTS, JSON.stringify({ url, method: options.method }) + '\\n');
  if (parsed.searchParams.get('list-type') === '2') {
    const objects = JSON.parse(process.env.TEST_OBJECTS || '[]');
    return { ok: true, text: async () => '<ListBucketResult><IsTruncated>false</IsTruncated>' + objects.map((o) => '<Contents><Key>' + encodeURIComponent(o.key) + '</Key><LastModified>' + (o.lastModified || '2026-01-01T00:00:00Z') + '</LastModified><Size>24</Size></Contents>').join('') + '</ListBucketResult>' };
  }
  if (options.method === 'PUT') return { ok: true, status: 200 };
  if (options.method === 'DELETE') throw new Error('Deletion must not occur without confirmation');
  if (options.method === 'GET') return { ok: true, status: 200, text: async () => '{"command":["status"]}' };
  throw new Error('Unexpected operation');
};
`);
function fixture() {
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const requests = path.join(dir, 'requests.jsonl');
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('APECHURCH_CLI_') || key === 'NODE_OPTIONS') delete env[key];
  }
  Object.assign(env, {
    APECHURCH_CLI_CONFIG_DIR: path.join(dir, 'config'),
    APECHURCH_CLI_SCR_DIR: path.join(dir, 'scripts'),
    APECHURCH_CLI_LOG_DIR: path.join(dir, 'logs'),
    APECHURCH_CLI_PASS: 'test-password',
    APECHURCH_CLI_R2_ACCOUNT_ID: 'test-account',
    APECHURCH_CLI_R2_TOKEN: 'test-token',
    APECHURCH_CLI_R2_KEY: 'test-key',
    APECHURCH_CLI_R2_SECRET: 'test-secret',
    APECHURCH_CLI_R2_PREFIX: 'log-only-prefix',
    TEST_REQUESTS: requests,
  });
  function run(args, extra = {}) {
    const result = spawnSync(process.execPath, ['--import', mock, cliPath, ...args, '--json'], {
      env: { ...env, ...extra }, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.error, undefined);
    return { ...result, payload: JSON.parse(result.stdout.trim()) };
  }
  return { dir, env, run, requests: () => fs.existsSync(requests) ? fs.readFileSync(requests, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [] };
}

describe('bucket environment source notices', () => {
  for (const command of ['bucket:log', 'bucket:script']) {
    it(`${command} uses explicit names over set environment values without confirmation`, () => {
      const f = fixture();
      for (const terminal of ['0', '1']) {
        for (const envName of ['environment-bucket', 'explicit-bucket']) {
          const result = f.run([command, 'reinstall', 'explicit-bucket'], {
            APECHURCH_CLI_R2_NAME: envName, TEST_TERMINAL: terminal,
          });
          assert.equal(result.status, 0, result.stderr);
          assert.equal(result.payload.bucket, 'explicit-bucket');
          assert.equal(result.stderr.split('takes precedence over APECHURCH_CLI_R2_NAME').length - 1, 1);
          assert.ok(!result.stderr.includes(envName));
          assert.doesNotMatch(result.stderr, /Confirm|Override environment setting/);
        }
      }
      assert.deepEqual(f.requests(), []);
    });

    it(`${command} identifies each environment source once without exposing credentials`, () => {
      const f = fixture();
      for (const terminal of ['0', '1']) {
        const result = f.run([command, 'install'], {
          APECHURCH_CLI_R2_NAME: 'environment-bucket', TEST_TERMINAL: terminal,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.payload.bucket, 'environment-bucket');
        for (const variable of ['APECHURCH_CLI_R2_NAME', 'APECHURCH_CLI_PASS',
          'APECHURCH_CLI_R2_ACCOUNT_ID', 'APECHURCH_CLI_R2_TOKEN', 'APECHURCH_CLI_R2_KEY', 'APECHURCH_CLI_R2_SECRET']) {
          assert.equal(result.stderr.split(`from ${variable} (value hidden)`).length - 1, 1, variable);
          if (f.env[variable]) assert.ok(!(result.stdout + result.stderr).includes(f.env[variable]), variable);
        }
        assert.doesNotMatch(result.stderr, /environment-bucket|takes precedence/);
      }
      const verbose = f.run([command, 'status', '-v']);
      assert.match(verbose.stderr, /from APECHURCH_CLI_PASS \(value hidden\)/);
      assert.ok(!verbose.stderr.includes(f.env.APECHURCH_CLI_PASS));
      assert.deepEqual(f.requests(), []);
    });
  }

  it('does not report an unset name variable and preserves missing-credential errors', () => {
    const f = fixture();
    const explicit = f.run(['bucket:log', 'install', 'explicit-bucket']);
    assert.equal(explicit.status, 0);
    assert.ok(!explicit.stderr.includes('APECHURCH_CLI_R2_NAME'));
    const missing = f.run(['bucket:script', 'install', 'example-scripts'], {
      APECHURCH_CLI_R2_TOKEN: '',
    });
    assert.equal(missing.status, 1);
    assert.match(missing.payload.error, /requires an interactive terminal/);
    assert.ok(!missing.stderr.includes('from APECHURCH_CLI_R2_TOKEN'));
    assert.equal(f.run(['bucket:script', 'status']).payload.enabled, false);
    assert.deepEqual(f.requests(), []);
  });
});

describe('bucket recursive CLI and shared help', () => {
  for (const command of ['bucket', 'bucket:log', 'bucket:script']) {
    it(`${command} help documents both types, recursive mode, and the logs-only default`, () => {
      const f = fixture();
      const help = spawnSync(process.execPath, [cliPath, command, '--help'], { env: f.env, encoding: 'utf8', timeout: 15000 });
      assert.equal(help.status, 0);
      assert.match(help.stdout, /bucket:log sync/); assert.match(help.stdout, /bucket:script sync/);
      assert.match(help.stdout, /-r, --recursive/); assert.match(help.stdout, /use bucket:script sync for scripts/);
      assert.match(help.stdout, /direct files/i);
      assert.match(help.stdout, /empty \[path\]/);
      assert.match(help.stdout, /Type EMPTY to confirm/);
      assert.match(help.stdout, /bucket empty is rejected/);
      assert.doesNotMatch(help.stdout, /DELETE|empty <bucket/);
    });

    it(`${command} applies recursion only when requested and explains excluded folders`, () => {
      const f = fixture();
      const script = command === 'bucket:script';
      f.run(['bucket:log', 'install', 'example-logs']);
      f.run(['bucket:script', 'install', 'example-scripts']);
      const key = script ? 'folder/deep/report.json' : 'log-only-prefix/folder/deep/example-bot.20260101120000.json';
      const extra = { TEST_OBJECTS: JSON.stringify([{ key }]) };
      const plain = spawnSync(process.execPath, ['--import', mock, cliPath, command, 'sync', 'folder/'], {
        env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 15000,
      });
      assert.equal(plain.status, 0, plain.stderr);
      assert.match(plain.stdout, /Inconsistencies:/); assert.match(plain.stdout, /Use -r \/ --recursive/);
      const shallow = f.run([command, 'sync', 'folder/'], extra);
      assert.equal(shallow.payload.downloaded, 0); assert.match(shallow.payload.hint, /recursive/);
      const recursive = f.run([command, 'sync', 'folder/', script ? '--recursive' : '-r'], extra);
      assert.equal(recursive.status, 0, recursive.stderr);
      assert.equal(recursive.payload.downloaded, 1); assert.equal(recursive.payload.hint, null);
      assert.equal(recursive.payload.recursive, true);
      const expectedBucket = script ? 'example-scripts' : 'example-logs';
      assert.ok(f.requests().every((req) => {
        const pathname = new URL(req.url).pathname;
        return pathname === '/' + expectedBucket || pathname.startsWith('/' + expectedBucket + '/');
      }));
      const rejected = f.run([command, 'status', '-r']);
      assert.equal(rejected.status, 1); assert.match(rejected.payload.error, /only supported with bucket sync/);
    });
  }
});

describe('bucket types and empty CLI', () => {
  it('keeps default log installation and explicit log selection independent from scripts', () => {
    const f = fixture();
    assert.equal(f.run(['bucket', 'install', 'example-logs']).status, 0);
    const before = f.run(['bucket:log', 'status']).payload.enabled_bucket;
    assert.equal(f.run(['bucket:script', 'install', 'example-scripts']).status, 0);
    assert.equal(f.run(['bucket:log', 'status']).payload.enabled_bucket, before);
    assert.equal(f.run(['bucket:script', 'status']).payload.enabled_bucket, 'example-scripts');
    assert.equal(f.run(['bucket:script', 'disable']).status, 0);
    assert.equal(f.run(['bucket:log', 'status']).payload.enabled_bucket, 'example-logs');
    assert.equal(f.run(['bucket:script', 'enable', 'example-scripts']).status, 0);
    const enabled = f.run(['bucket:script', 'list']).payload.buckets.filter((item) => item.enabled);
    assert.deepEqual(enabled, [{ bucket: 'example-scripts', enabled: true }]);
  });

  it('reports both selections and every stored bucket, including inactive entries, without secrets or network', () => {
    const f = fixture();
    f.run(['bucket:log', 'install', 'old-logs']);
    f.run(['bucket:log', 'install', 'example-logs']);
    f.run(['bucket:script', 'install', 'example-scripts']);
    const result = f.run(['bucket', 'status'], { APECHURCH_CLI_PASS: '' });
    assert.equal(result.status, 0);
    assert.equal(result.payload.log.enabled_bucket, 'example-logs');
    assert.equal(result.payload.script.enabled_bucket, 'example-scripts');
    assert.deepEqual(result.payload.buckets, [
      { bucket: 'example-logs', log_enabled: true, script_enabled: false },
      { bucket: 'example-scripts', log_enabled: false, script_enabled: true },
      { bucket: 'old-logs', log_enabled: false, script_enabled: false },
    ]);
    for (const secret of ['test-password', 'test-token', 'test-key', 'test-secret', 'test-account']) {
      assert.ok(!result.stdout.includes(secret));
    }
    assert.deepEqual(f.run(['bucket'], { APECHURCH_CLI_PASS: '' }).payload, result.payload);
    f.run(['bucket:script', 'disable']);
    const disabled = f.run(['bucket', 'status']).payload;
    assert.equal(disabled.script.enabled, false);
    assert.equal(disabled.log.enabled, true);
    assert.equal(disabled.buckets.length, 3);
    assert.ok(disabled.buckets.every((entry) => !entry.script_enabled));
    const plain = spawnSync(process.execPath, ['--import', mock, cliPath, 'bucket', 'status'], {
      env: f.env, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(plain.status, 0);
    assert.match(plain.stdout, /example-logs  \[log: enabled, script: disabled\]/);
    assert.match(plain.stdout, /example-scripts  \[log: disabled, script: disabled\]/);
    assert.match(plain.stdout, /old-logs  \[log: disabled, script: disabled\]/);
    assert.deepEqual(f.requests(), []);
  });

  it('reports empty selections and a bucket shared by both types without duplicates', () => {
    const f = fixture();
    const empty = f.run(['bucket', 'status', '-v'], { APECHURCH_CLI_PASS: '' });
    assert.equal(empty.status, 0);
    assert.equal(empty.payload.log.enabled, false);
    assert.equal(empty.payload.script.enabled, false);
    assert.deepEqual(empty.payload.buckets, []);
    f.run(['bucket:log', 'install', 'shared-bucket']);
    f.run(['bucket:script', 'enable', 'shared-bucket']);
    assert.deepEqual(f.run(['bucket', 'status']).payload.buckets, [
      { bucket: 'shared-bucket', log_enabled: true, script_enabled: true },
    ]);
    assert.deepEqual(f.requests(), []);
  });

  it('requires decryption for aggregate verbose status, including inactive entries', () => {
    const f = fixture();
    f.run(['bucket:script', 'install', 'example-scripts']);
    f.run(['bucket:script', 'disable']);
    const missing = f.run(['bucket', 'status', '-v'], { APECHURCH_CLI_PASS: '' });
    assert.equal(missing.status, 1);
    assert.match(missing.payload.error, /APECHURCH_CLI_PASS/);
    const wrong = f.run(['bucket', 'status', '-v'], { APECHURCH_CLI_PASS: 'wrong-password' });
    assert.equal(wrong.status, 1);
    assert.ok(!wrong.stdout.includes('test-secret'));
    const verbose = f.run(['bucket', 'status', '-v']);
    assert.equal(verbose.status, 0);
    assert.equal(verbose.payload.buckets[0].verbose.environment_fallbacks.APECHURCH_CLI_R2_SECRET, 'test-secret');
    assert.deepEqual(f.requests(), []);
  });

  it('syncs scripts from the selected script bucket and ignores the log prefix', () => {
    const f = fixture();
    f.run(['bucket', 'install', 'example-logs']);
    f.run(['bucket:script', 'install', 'example-scripts']);
    const result = f.run(['bucket:script', 'sync'], { TEST_OBJECTS: JSON.stringify([{ key: 'routine-v2.json' }]) });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.downloaded, 1);
    assert.equal(result.payload.bucket, 'example-scripts');
    assert.equal(fs.readFileSync(path.join(f.env.APECHURCH_CLI_SCR_DIR, 'routine-v2.json'), 'utf8'), '{"command":["status"]}');
    assert.ok(f.requests().every((req) => new URL(req.url).pathname.startsWith('/example-scripts')));
    assert.ok(f.requests().every((req) => !req.url.includes('log-only-prefix')));
  });

  it('presigns an explicitly named script without listing and reuses its cache', () => {
    const f = fixture(); f.run(['bucket:script', 'install', 'example-scripts']);
    const first = f.run(['bucket:script', 'presign', 'routine-v2', '-t', '60']);
    assert.equal(first.status, 0); assert.equal(first.payload.object_key, 'routine-v2.json');
    assert.equal(first.payload.cached, false);
    assert.equal(f.run(['bucket:script', 'presign', 'routine-v2']).payload.cached, true);
    assert.equal(f.requests().length, 0);
  });

  for (const command of ['bucket', 'bucket:log', 'bucket:script']) {
    it(`${command} selects the latest remote object before checking the URL cache`, () => {
      const f = fixture();
      const isScript = command === 'bucket:script';
      const bucket = isScript ? 'example-scripts' : 'example-logs';
      const previousKey = isScript ? 'routine-v1.json' : 'example-bot/example-bot.20260101120000.json';
      const latestKey = isScript ? 'routine-v2.json' : 'example-bot/example-bot.20260102120000.json';
      assert.equal(f.run([command, 'install', bucket]).status, 0);
      const previous = f.run([command, 'presign', previousKey]);
      assert.equal(previous.status, 0);
      assert.equal(previous.payload.cached, false);
      assert.equal(f.requests().length, 0);
      const objects = { TEST_OBJECTS: JSON.stringify([
        { key: previousKey, lastModified: '2026-01-01T12:00:00Z' },
        { key: latestKey, lastModified: '2026-01-02T12:00:00Z' },
      ]) };
      const latest = f.run([command, 'presign'], objects);
      assert.equal(latest.status, 0);
      assert.equal(latest.payload.object_key, latestKey);
      assert.equal(latest.payload.cached, false);
      assert.notEqual(latest.payload.url, previous.payload.url);
      assert.equal(f.requests().length, 1);

      const repeated = f.run([command, 'presign'], objects);
      assert.equal(repeated.status, 0);
      assert.equal(repeated.payload.cached, true);
      assert.equal(repeated.payload.url, latest.payload.url);
      assert.equal(f.requests().length, 2, 'cached latest requests must still refresh the listing');

      const empty = f.run([command, 'presign'], { TEST_OBJECTS: '[]' });
      assert.notEqual(empty.status, 0);
      assert.match(empty.payload.error, /No .*JSON/);
      assert.equal(empty.payload.url, undefined);
      assert.equal(f.requests().length, 3);
    });
  }

  it('lists only the folder in the selected script bucket and refuses deletion without a terminal', () => {
    const f = fixture(); f.run(['bucket', 'install', 'example-logs']);
    f.run(['bucket:script', 'install', 'example-scripts']);
    const result = f.run(['bucket:script', 'empty', 'folder/'], { TEST_OBJECTS: JSON.stringify([
      { key: 'folder/a.json' }, { key: 'folder/b.txt' }, { key: 'folder-other/c.json' },
    ]) });
    assert.notEqual(result.status, 0); assert.match(result.payload.error, /interactive terminal/);
    assert.match(result.stderr, /folder\/a.json/); assert.match(result.stderr, /folder\/b.txt/);
    assert.doesNotMatch(result.stderr, /folder-other/);
    assert.ok(f.requests().every((request) => request.method === 'GET'
      && new URL(request.url).pathname === '/example-scripts'
      && new URL(request.url).searchParams.get('prefix') === 'folder/'));
    assert.equal(f.run(['bucket:log', 'status']).payload.enabled_bucket, 'example-logs');
  });

  it('rejects unqualified empty before credentials or remote access, regardless of selection or path', () => {
    const f = fixture();
    for (const configured of [false, true]) {
      if (configured) {
        f.run(['bucket:log', 'install', 'example-logs']);
        f.run(['bucket:script', 'install', 'example-scripts']);
      }
      for (const args of [[], ['folder/'], ['file.json'], ['--force'], ['-r']]) {
        for (const password of ['', 'wrong-password']) {
          const result = f.run(['bucket', 'empty', ...args], { APECHURCH_CLI_PASS: password });
          assert.equal(result.status, 1);
          assert.equal(result.payload.error, 'empty requires an explicit bucket type. Use bucket:log empty [path] or bucket:script empty [path].');
          assert.doesNotMatch(result.stderr, /encryption password|APECHURCH_CLI_PASS|Remote files selected/);
        }
      }
    }
    assert.deepEqual(f.requests(), []);
  });

  for (const command of ['bucket:log', 'bucket:script']) {
    it(`${command} uses its selected bucket for root, file, and bucket-looking paths`, () => {
      const f = fixture();
      f.run(['bucket:log', 'install', 'example-logs']);
      f.run(['bucket:script', 'install', 'example-scripts']);
      const selected = command === 'bucket:script' ? 'example-scripts' : 'example-logs';
      assert.match(f.run([command, 'empty', '--force']).payload.error, /only supported.*presign/);
      assert.equal(f.requests().length, 0);
      const empty = f.run([command, 'empty']);
      assert.equal(empty.status, 0);
      assert.equal(empty.payload.bucket, selected);
      assert.equal(empty.payload.kind, 'bucket');
      assert.equal(empty.payload.selected, 0);
      assert.deepEqual(empty.payload.deleted, []);
      const objects = { TEST_OBJECTS: JSON.stringify([
        { key: 'note.txt' }, { key: 'folder/other.json' }, { key: 'example-scripts/note.txt' },
      ]) };
      const full = f.run([command, 'empty'], objects);
      assert.match(full.payload.error, /interactive terminal/);
      assert.match(full.stderr, /\(3\)/);
      const file = f.run([command, 'empty', 'note.txt'], objects);
      assert.match(file.payload.error, /interactive terminal/);
      assert.match(file.stderr, /\(1\)/);
      assert.doesNotMatch(file.stderr, /folder\/other|example-scripts\/note/);
      const path = f.run([command, 'empty', 'example-scripts/note.txt'], objects);
      assert.match(path.payload.error, /interactive terminal/);
      assert.match(path.stderr, /example-scripts\/note.txt/);
      assert.ok(f.requests().every((request) => request.method === 'GET'
        && new URL(request.url).pathname === `/${selected}`));
      assert.equal(new URL(f.requests()[0].url).searchParams.get('prefix'), null);
    });

    it(`${command} requires its own enabled selection and follows selection changes`, () => {
      const f = fixture();
      assert.match(f.run([command, 'empty']).payload.error, /No enabled R2/);
      f.run([command, 'install', 'first-bucket']);
      f.run([command, 'install', 'second-bucket']);
      f.run([command, 'disable']);
      assert.match(f.run([command, 'empty', 'first-bucket/']).payload.error, /No enabled R2/);
      assert.equal(f.requests().length, 0);
      f.run([command, 'enable', 'first-bucket']);
      assert.equal(f.run([command, 'empty']).payload.bucket, 'first-bucket');
      f.run([command, 'enable', 'second-bucket']);
      assert.equal(f.run([command, 'empty']).payload.bucket, 'second-bucket');
      assert.deepEqual(f.requests().map((request) => new URL(request.url).pathname), ['/first-bucket', '/second-bucket']);
    });
  }
});
