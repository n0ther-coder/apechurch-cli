import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'apechurch-r2-test-'));
process.env.APECHURCH_CLI_CONFIG_DIR = tmpRoot;

const {
  createR2PresignedGetUrl,
  createR2LogMirror,
  getR2CredentialEndpoints,
  getCachedR2PresignedUrl,
  getLocalLogPathForR2ObjectKey,
  getR2ObjectKeyForLog,
  listStoredR2Configs,
  loadSelectedR2Credentials,
  normalizeR2PresignTimeout,
  putR2Object,
  resolveLatestR2JsonObjectKey,
  resolveR2PresignOutputPath,
  saveCachedR2PresignedUrl,
  saveEncryptedR2Config,
  syncR2Logs,
} = await import('../../lib/r2.js');

const PASSWORD = 'test-password-123';
const CREDENTIALS = {
  bucket: 'apechurch-cli-log',
  accountId: 'acct-not-in-file',
  apiToken: 'bearer-secret-not-in-file',
  accessKeyId: 'access-key-not-in-file',
  secretAccessKey: 'secret-key-not-in-file',
};

describe('R2 config and bot log mirroring helpers', () => {
  it('stores R2 credentials encrypted and reloads them with the configured password', () => {
    const result = saveEncryptedR2Config(CREDENTIALS, PASSWORD);
    const raw = fs.readFileSync(result.filePath, 'utf8');

    assert.match(raw, /"encrypted": true/);
    assert.match(raw, /"bucket": "apechurch-cli-log"/);
    assert.doesNotMatch(raw, /acct-not-in-file/);
    assert.doesNotMatch(raw, /bearer-secret-not-in-file/);
    assert.doesNotMatch(raw, /access-key-not-in-file/);
    assert.doesNotMatch(raw, /secret-key-not-in-file/);

    const loaded = loadSelectedR2Credentials({ password: PASSWORD });
    assert.strictEqual(loaded.enabled, true);
    assert.strictEqual(loaded.credentials.bucket, CREDENTIALS.bucket);
    assert.strictEqual(loaded.credentials.account_id, CREDENTIALS.accountId);
    assert.strictEqual(loaded.credentials.api_token, CREDENTIALS.apiToken);
    assert.strictEqual(loaded.credentials.access_key_id, CREDENTIALS.accessKeyId);
    assert.strictEqual(loaded.credentials.secret_access_key, CREDENTIALS.secretAccessKey);

    const wrongPassword = loadSelectedR2Credentials({ password: 'wrong-password' });
    assert.strictEqual(wrongPassword.enabled, false);
    assert.strictEqual(wrongPassword.reason, 'decrypt-failed');
  });

  it('builds remote object keys from the local log path relative to the log directory', () => {
    const logDir = path.join(tmpRoot, 'log');
    const filePath = path.join(logDir, 'example-bot', 'example-bot.20260706120000.json');

    assert.strictEqual(
      getR2ObjectKeyForLog(filePath, { logDir, prefix: '/session/a/' }),
      'session/a/example-bot/example-bot.20260706120000.json',
    );
    assert.strictEqual(
      getLocalLogPathForR2ObjectKey('session/a/example-bot/example-bot.20260706120000.json', { logDir, prefix: '/session/a/' }),
      filePath,
    );
    assert.strictEqual(
      getLocalLogPathForR2ObjectKey('session/a/../secret.json', { logDir, prefix: '/session/a/' }),
      null,
    );
  });

  it('builds R2 API endpoints from stored credentials', () => {
    assert.deepStrictEqual(getR2CredentialEndpoints({
      bucket: 'apechurch-cli-log',
      account_id: 'accountid',
      api_token: 'bearer-token-value',
      access_key_id: 'access-key-id',
      secret_access_key: 'secret-access-key',
    }), {
      s3_endpoint: 'https://accountid.r2.cloudflarestorage.com',
      bucket_endpoint: 'https://accountid.r2.cloudflarestorage.com/apechurch-cli-log',
    });
  });

  it('signs and uploads JSON objects through an injected fetch implementation', async () => {
    const requests = [];
    const response = await putR2Object(
      {
        bucket: 'apechurch-cli-log',
        account_id: 'accountid',
        api_token: 'bearer-token-value',
        access_key_id: 'access-key-id',
        secret_access_key: 'secret-access-key',
      },
      'prefix/example-bot/log.json',
      '{"ok":true}\n',
      {
        endpointBaseUrl: 'https://r2.test',
        now: new Date('2026-07-06T12:34:56.000Z'),
        fetchImpl: async (url, options) => {
          requests.push({ url, options });
          return { ok: true, status: 200 };
        },
      },
    );

    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.objectKey, 'prefix/example-bot/log.json');
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].url, 'https://r2.test/apechurch-cli-log/prefix/example-bot/log.json');
    assert.strictEqual(requests[0].options.method, 'PUT');
    assert.strictEqual(requests[0].options.body, '{"ok":true}\n');
    assert.match(requests[0].options.headers.Authorization, /^AWS4-HMAC-SHA256 /);
    assert.match(requests[0].options.headers.Authorization, /Credential=access-key-id\/20260706\/auto\/s3\/aws4_request/);
    assert.doesNotMatch(requests[0].options.headers.Authorization, /secret-access-key/);
    assert.strictEqual(requests[0].options.headers['x-amz-date'], '20260706T123456Z');
    assert.ok(requests[0].options.headers['x-amz-content-sha256']);
  });

  it('creates and caches presigned GET URLs without exposing the secret key', () => {
    saveEncryptedR2Config({ ...CREDENTIALS, bucket: 'presign-cache-log' }, PASSWORD);
    const entry = listStoredR2Configs().find((config) => config.bucket === 'presign-cache-log');
    const presigned = createR2PresignedGetUrl(
      {
        bucket: 'presign-cache-log',
        account_id: 'accountid',
        api_token: 'bearer-token-value',
        access_key_id: 'access-key-id',
        secret_access_key: 'secret-access-key',
      },
      'example-bot/example-bot.20260706120000.json',
      {
        endpointBaseUrl: 'https://r2.test',
        now: new Date('2026-07-06T12:34:56.000Z'),
        expiresIn: 60,
      },
    );

    assert.match(presigned.url, /^https:\/\/r2\.test\/presign-cache-log\/example-bot\/example-bot\.20260706120000\.json\?/);
    assert.match(presigned.url, /X-Amz-Expires=60/);
    assert.match(presigned.url, /X-Amz-Credential=access-key-id%2F20260706%2Fauto%2Fs3%2Faws4_request/);
    assert.doesNotMatch(presigned.url, /secret-access-key/);

    saveCachedR2PresignedUrl(entry, presigned);
    const refreshed = listStoredR2Configs().find((config) => config.bucket === 'presign-cache-log');
    const cached = getCachedR2PresignedUrl(refreshed, {
      objectKey: 'example-bot/example-bot.20260706120000.json',
      now: new Date('2026-07-06T12:35:00.000Z'),
    });
    assert.strictEqual(cached.url, presigned.url);
    assert.strictEqual(cached.cached, true);
    assert.strictEqual(
      getCachedR2PresignedUrl(refreshed, { now: new Date('2026-07-06T12:36:00.001Z') }),
      null,
    );
    assert.strictEqual(normalizeR2PresignTimeout(undefined), 604800);
    assert.throws(() => normalizeR2PresignTimeout(604801), /Invalid presign timeout/);
  });

  it('resolves presign targets from exact object keys or latest filename timestamps', async () => {
    const credentials = {
      bucket: 'apechurch-cli-log',
      account_id: 'accountid',
      api_token: 'bearer-token-value',
      access_key_id: 'access-key-id',
      secret_access_key: 'secret-access-key',
    };
    const calls = [];
    const listObjects = async (_credentials, { prefix }) => {
      calls.push(prefix);
      return {
        objects: [
          { key: `${prefix}example-bot.20260706120000.json`, lastModified: new Date('2026-01-01T00:00:00.000Z') },
          { key: `${prefix}example-bot.20260707120000.json`, lastModified: new Date('2025-01-01T00:00:00.000Z') },
          { key: `${prefix}notes.json`, lastModified: new Date('2027-01-01T00:00:00.000Z') },
        ],
      };
    };

    assert.strictEqual(
      await resolveLatestR2JsonObjectKey(credentials, {
        prefix: 'remote',
        targetPath: 'example-bot/example-bot.20260706120000.json',
        listObjects,
      }),
      'remote/example-bot/example-bot.20260706120000.json',
    );
    assert.deepStrictEqual(calls, []);

    assert.strictEqual(
      await resolveLatestR2JsonObjectKey(credentials, {
        prefix: 'remote',
        targetPath: 'example-bot',
        listObjects,
      }),
      'remote/example-bot/example-bot.20260707120000.json',
    );
    assert.deepStrictEqual(calls, ['remote/example-bot/']);

    calls.length = 0;
    const previousEnvPrefix = process.env.APECHURCH_CLI_R2_PREFIX;
    process.env.APECHURCH_CLI_R2_PREFIX = 'remote';
    try {
      assert.strictEqual(
        await resolveLatestR2JsonObjectKey(credentials, {
          targetPath: 'example-bot',
          listObjects,
        }),
        'example-bot/example-bot.20260707120000.json',
      );
      assert.deepStrictEqual(calls, ['example-bot/']);
    } finally {
      if (previousEnvPrefix === undefined) {
        delete process.env.APECHURCH_CLI_R2_PREFIX;
      } else {
        process.env.APECHURCH_CLI_R2_PREFIX = previousEnvPrefix;
      }
    }
  });

  it('resolves presign output directories using the remote object file name', () => {
    const outputDir = path.join(tmpRoot, 'presign-output');
    fs.mkdirSync(outputDir, { recursive: true });
    const objectKey = 'another-bot/another-bot.20260709113717.json';

    assert.strictEqual(
      resolveR2PresignOutputPath(outputDir, objectKey),
      path.join(outputDir, 'another-bot.20260709113717.json'),
    );
    assert.strictEqual(
      resolveR2PresignOutputPath(`${path.join(tmpRoot, 'presign-new-dir')}${path.sep}`, objectKey),
      path.join(tmpRoot, 'presign-new-dir', 'another-bot.20260709113717.json'),
    );
    assert.strictEqual(
      resolveR2PresignOutputPath(path.join(tmpRoot, 'latest-another-bot'), objectKey),
      path.join(tmpRoot, 'latest-another-bot.json'),
    );
    assert.strictEqual(
      resolveR2PresignOutputPath(path.join(tmpRoot, 'latest-another-bot.json'), objectKey),
      path.join(tmpRoot, 'latest-another-bot.json'),
    );
  });

  it('syncs local and remote bot logs without deleting either side', async () => {
    const logDir = path.join(tmpRoot, 'sync-log');
    const exampleBotDir = path.join(logDir, 'example-bot');
    fs.mkdirSync(exampleBotDir, { recursive: true });
    const localLog = path.join(exampleBotDir, 'example-bot.20260706120000.json');
    fs.writeFileSync(localLog, '{"local":true}\n', 'utf8');

    const remoteObjects = new Map([
      ['example-bot/example-bot.20260707120000.json', {
        body: '{"remote":true}\n',
        lastModified: new Date('2026-07-06T12:34:56.000Z'),
      }],
    ]);
    const uploads = [];
    const result = await syncR2Logs({
      bot: 'example-bot',
      logDir,
      credentialsResult: {
        enabled: true,
        credentials: {
          bucket: 'apechurch-cli-log',
          account_id: 'accountid',
          api_token: 'bearer-token-value',
          access_key_id: 'access-key-id',
          secret_access_key: 'secret-access-key',
        },
      },
      listObjects: async (_credentials, { prefix }) => ({
        objects: [...remoteObjects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({
            key,
            size: Buffer.byteLength(value.body),
            lastModified: value.lastModified,
          })),
      }),
      getObject: async (_credentials, objectKey) => ({
        body: remoteObjects.get(objectKey).body,
      }),
      putObject: async (_credentials, objectKey, body) => {
        uploads.push({ objectKey, body });
      },
    });

    assert.strictEqual(result.uploaded, 1);
    assert.strictEqual(result.downloaded, 1);
    assert.deepStrictEqual(uploads, [
      { objectKey: 'example-bot/example-bot.20260706120000.json', body: '{"local":true}\n' },
    ]);
    assert.strictEqual(
      fs.readFileSync(path.join(exampleBotDir, 'example-bot.20260707120000.json'), 'utf8'),
      '{"remote":true}\n',
    );
  });

  it('syncs remote-newer logs even when the file size matches', async () => {
    const logDir = path.join(tmpRoot, 'sync-newer-log');
    const exampleBotDir = path.join(logDir, 'example-bot');
    fs.mkdirSync(exampleBotDir, { recursive: true });
    const sharedLog = path.join(exampleBotDir, 'example-bot.20260706120000.json');
    fs.writeFileSync(sharedLog, '{"n":1}\n', 'utf8');
    fs.utimesSync(sharedLog, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));

    const uploads = [];
    const result = await syncR2Logs({
      bot: 'example-bot',
      logDir,
      credentialsResult: {
        enabled: true,
        credentials: {
          bucket: 'apechurch-cli-log',
          account_id: 'accountid',
          api_token: 'bearer-token-value',
          access_key_id: 'access-key-id',
          secret_access_key: 'secret-access-key',
        },
      },
      listObjects: async (_credentials, { prefix }) => ({
        objects: [{
          key: `${prefix}example-bot.20260706120000.json`,
          size: Buffer.byteLength('{"n":2}\n'),
          lastModified: new Date('2026-01-02T00:00:00.000Z'),
        }],
      }),
      getObject: async () => ({
        body: '{"n":2}\n',
      }),
      putObject: async (_credentials, objectKey, body) => {
        uploads.push({ objectKey, body });
      },
    });

    assert.strictEqual(result.downloaded, 1);
    assert.strictEqual(result.uploaded, 0);
    assert.deepStrictEqual(uploads, []);
    assert.strictEqual(fs.readFileSync(sharedLog, 'utf8'), '{"n":2}\n');
  });

  it('skips and reports invalid local and remote sync log files', async () => {
    const logDir = path.join(tmpRoot, 'sync-invalid-log');
    const exampleBotDir = path.join(logDir, 'example-bot');
    fs.mkdirSync(exampleBotDir, { recursive: true });
    fs.writeFileSync(path.join(exampleBotDir, 'example-bot.20260706120000.json'), '{"valid":true}\n', 'utf8');
    fs.writeFileSync(path.join(exampleBotDir, 'local.json'), '{"wrongName":true}\n', 'utf8');
    fs.writeFileSync(path.join(exampleBotDir, 'example-bot.20260707120000.json'), '{bad json', 'utf8');

    const remoteObjects = new Map([
      ['example-bot/remote.json', {
        body: '{"wrongName":true}\n',
        lastModified: new Date('2026-07-06T12:34:56.000Z'),
      }],
      ['example-bot/example-bot.20260708120000.json', {
        body: '{bad json',
        lastModified: new Date('2026-07-08T12:34:56.000Z'),
      }],
      ['example-bot/example-bot.20260709120000.json', {
        body: '{"remote":true}\n',
        lastModified: new Date('2026-07-09T12:34:56.000Z'),
      }],
    ]);
    const uploads = [];
    const result = await syncR2Logs({
      bot: 'example-bot',
      logDir,
      credentialsResult: {
        enabled: true,
        credentials: {
          bucket: 'apechurch-cli-log',
          account_id: 'accountid',
          api_token: 'bearer-token-value',
          access_key_id: 'access-key-id',
          secret_access_key: 'secret-access-key',
        },
      },
      listObjects: async (_credentials, { prefix }) => ({
        objects: [...remoteObjects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({
            key,
            size: Buffer.byteLength(value.body),
            lastModified: value.lastModified,
          })),
      }),
      getObject: async (_credentials, objectKey) => ({
        body: remoteObjects.get(objectKey).body,
      }),
      putObject: async (_credentials, objectKey, body) => {
        uploads.push({ objectKey, body });
      },
    });

    assert.strictEqual(result.uploaded, 1);
    assert.strictEqual(result.downloaded, 1);
    assert.strictEqual(result.skipped, 4);
    assert.deepStrictEqual(uploads, [
      { objectKey: 'example-bot/example-bot.20260706120000.json', body: '{"valid":true}\n' },
    ]);
    assert.strictEqual(
      fs.readFileSync(path.join(exampleBotDir, 'example-bot.20260709120000.json'), 'utf8'),
      '{"remote":true}\n',
    );
    assert.strictEqual(
      fs.existsSync(path.join(exampleBotDir, 'example-bot.20260708120000.json')),
      false,
    );
    assert.deepStrictEqual(
      result.inconsistencies.map((operation) => operation.reason).sort(),
      [
        'invalid-local-log-json',
        'invalid-local-log-name',
        'invalid-remote-log-json',
        'invalid-remote-log-name',
      ],
    );
  });

  it('coalesces repeated updates per object key without dropping different log files', async () => {
    const logDir = path.join(tmpRoot, 'mirror-log');
    const uploads = [];
    let resolveFirstUploadStarted;
    const firstUploadStarted = new Promise((resolve) => {
      resolveFirstUploadStarted = resolve;
    });
    let unblockFirstUpload;
    const mirror = createR2LogMirror({
      logDir,
      prefix: 'remote',
      credentialsResult: {
        enabled: true,
        credentials: {
          bucket: 'apechurch-cli-log',
          account_id: 'accountid',
          api_token: 'bearer-token-value',
          access_key_id: 'access-key-id',
          secret_access_key: 'secret-access-key',
        },
      },
      putObject: async (_credentials, objectKey, body) => {
        uploads.push({ objectKey, body: JSON.parse(body) });
        if (uploads.length === 1) {
          resolveFirstUploadStarted();
          await new Promise((resolve) => {
            unblockFirstUpload = resolve;
          });
        }
      },
    });

    const exampleBotLog = path.join(logDir, 'example-bot', 'example-bot.20260706120000.json');
    const aliceLog = path.join(logDir, 'alice', 'alice.20260706120000.json');
    mirror.write(exampleBotLog, { n: 1 });
    await firstUploadStarted;
    mirror.write(exampleBotLog, { n: 2 });
    mirror.write(aliceLog, { n: 3 });
    unblockFirstUpload();
    await mirror.flush();

    assert.deepStrictEqual(uploads, [
      { objectKey: 'remote/example-bot/example-bot.20260706120000.json', body: { n: 1 } },
      { objectKey: 'remote/example-bot/example-bot.20260706120000.json', body: { n: 2 } },
      { objectKey: 'remote/alice/alice.20260706120000.json', body: { n: 3 } },
    ]);
  });
});
