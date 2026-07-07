import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'apechurch-r2-test-'));
process.env.APECHURCH_CLI_CONFIG_DIR = tmpRoot;

const {
  createR2LogMirror,
  getR2CredentialEndpoints,
  getR2ObjectKeyForLog,
  loadSelectedR2Credentials,
  putR2Object,
  saveEncryptedR2Config,
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
    const filePath = path.join(logDir, 'bob', 'bob.20260706120000.json');

    assert.strictEqual(
      getR2ObjectKeyForLog(filePath, { logDir, prefix: '/session/a/' }),
      'session/a/bob/bob.20260706120000.json',
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
      'prefix/bob/log.json',
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
    assert.strictEqual(response.objectKey, 'prefix/bob/log.json');
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].url, 'https://r2.test/apechurch-cli-log/prefix/bob/log.json');
    assert.strictEqual(requests[0].options.method, 'PUT');
    assert.strictEqual(requests[0].options.body, '{"ok":true}\n');
    assert.match(requests[0].options.headers.Authorization, /^AWS4-HMAC-SHA256 /);
    assert.match(requests[0].options.headers.Authorization, /Credential=access-key-id\/20260706\/auto\/s3\/aws4_request/);
    assert.doesNotMatch(requests[0].options.headers.Authorization, /secret-access-key/);
    assert.strictEqual(requests[0].options.headers['x-amz-date'], '20260706T123456Z');
    assert.ok(requests[0].options.headers['x-amz-content-sha256']);
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

    const bobLog = path.join(logDir, 'bob', 'bob.20260706120000.json');
    const aliceLog = path.join(logDir, 'alice', 'alice.20260706120000.json');
    mirror.write(bobLog, { n: 1 });
    await firstUploadStarted;
    mirror.write(bobLog, { n: 2 });
    mirror.write(aliceLog, { n: 3 });
    unblockFirstUpload();
    await mirror.flush();

    assert.deepStrictEqual(uploads, [
      { objectKey: 'remote/bob/bob.20260706120000.json', body: { n: 1 } },
      { objectKey: 'remote/bob/bob.20260706120000.json', body: { n: 2 } },
      { objectKey: 'remote/alice/alice.20260706120000.json', body: { n: 3 } },
    ]);
  });
});
