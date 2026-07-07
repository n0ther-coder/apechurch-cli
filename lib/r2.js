/**
 * @fileoverview Encrypted Cloudflare R2 config and best-effort bot log mirroring.
 *
 * R2 credentials are treated like wallet private keys: stored encrypted locally
 * and decrypted only when APECHURCH_CLI_PASS is available.
 *
 * @module lib/r2
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  LOG_DIR,
  PASS_ENV_VAR,
  R2_DIR,
  R2_PREFIX_ENV_VAR,
} from './constants.js';
import { ensureDir } from './utils.js';
import {
  decryptSecret,
  encryptSecret,
} from './wallet.js';

export const R2_SELECTOR_FILE = path.join(R2_DIR, 'current.json');

const R2_CONFIG_SCHEMA_VERSION = 1;
const R2_SELECTOR_SCHEMA_VERSION = 1;
const R2_UPLOAD_TIMEOUT_MS = 5_000;
const R2_BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

function zeroBuffer(buf) {
  if (Buffer.isBuffer(buf)) buf.fill(0);
}

function normalizeOptionalString(value) {
  const text = String(value || '').trim();
  return text || null;
}

export function normalizeR2BucketName(value) {
  const bucket = normalizeOptionalString(value);
  if (!bucket || !R2_BUCKET_RE.test(bucket) || bucket.includes('..')) {
    throw new Error('Invalid R2 bucket name: use 3-63 lowercase letters, numbers, dots, or hyphens.');
  }
  return bucket;
}

function getR2ConfigFileName(bucket) {
  return `${normalizeR2BucketName(bucket)}.json`;
}

export function getR2ConfigFilePath(bucket) {
  ensureDir(R2_DIR);
  return path.join(R2_DIR, getR2ConfigFileName(bucket));
}

function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort: unsupported filesystems may ignore POSIX modes.
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function isEncryptedR2ConfigData(data) {
  return Boolean(
    data
    && data.encrypted === true
    && typeof data.bucket === 'string'
    && typeof data.ciphertext === 'string'
    && typeof data.salt === 'string'
    && typeof data.iv === 'string'
    && typeof data.authTag === 'string'
  );
}

function readR2ConfigFile(filePath) {
  const data = readJsonFile(filePath);
  if (!isEncryptedR2ConfigData(data)) return null;

  try {
    const bucket = normalizeR2BucketName(data.bucket);
    return {
      data,
      bucket,
      filePath,
      realPath: fs.realpathSync(filePath),
    };
  } catch {
    return null;
  }
}

function readR2Selector() {
  const selector = readJsonFile(R2_SELECTOR_FILE);
  if (!selector) return null;

  try {
    const bucket = normalizeR2BucketName(selector.bucket);
    const expectedFileName = getR2ConfigFileName(bucket);
    const configFileName = String(selector.config_file || '').trim();
    if (configFileName !== expectedFileName || path.basename(configFileName) !== configFileName) {
      return null;
    }

    return {
      data: selector,
      bucket,
      configFileName,
      configPath: path.join(R2_DIR, configFileName),
      filePath: R2_SELECTOR_FILE,
    };
  } catch {
    return null;
  }
}

function writeR2Selector(bucket) {
  const normalizedBucket = normalizeR2BucketName(bucket);
  ensureDir(R2_DIR);
  const selector = {
    version: R2_SELECTOR_SCHEMA_VERSION,
    bucket: normalizedBucket,
    config_file: getR2ConfigFileName(normalizedBucket),
    updatedAt: new Date().toISOString(),
  };
  writeJsonFile(R2_SELECTOR_FILE, selector);
  return selector;
}

function readSelectedR2ConfigFile() {
  const selector = readR2Selector();
  if (!selector) return null;

  const selected = readR2ConfigFile(selector.configPath);
  if (selected?.bucket === selector.bucket) {
    return {
      ...selected,
      selectedFilePath: selector.filePath,
    };
  }

  return null;
}

function normalizeR2Credentials(input = {}) {
  const bucket = normalizeR2BucketName(input.bucket);
  const accountId = normalizeOptionalString(input.accountId ?? input.account_id);
  const apiToken = normalizeOptionalString(input.apiToken ?? input.api_token);
  const accessKeyId = normalizeOptionalString(input.accessKeyId ?? input.access_key_id);
  const secretAccessKey = normalizeOptionalString(input.secretAccessKey ?? input.secret_access_key);

  if (!accountId) throw new Error('R2 account ID is required.');
  if (!apiToken) throw new Error('R2 API token is required.');
  if (!accessKeyId) throw new Error('R2 access key ID is required.');
  if (!secretAccessKey) throw new Error('R2 secret access key is required.');

  return {
    bucket,
    account_id: accountId,
    api_token: apiToken,
    access_key_id: accessKeyId,
    secret_access_key: secretAccessKey,
  };
}

export function getR2CredentialEndpoints(credentials) {
  const normalized = normalizeR2Credentials(credentials);
  const s3Endpoint = `https://${normalized.account_id}.r2.cloudflarestorage.com`;
  return {
    s3_endpoint: s3Endpoint,
    bucket_endpoint: `${s3Endpoint}/${encodeURIComponent(normalized.bucket)}`,
  };
}

export function saveEncryptedR2Config(credentials, password) {
  if (!password) {
    throw new Error(`${PASS_ENV_VAR} or an interactive password prompt is required to encrypt R2 credentials.`);
  }

  const normalized = normalizeR2Credentials(credentials);
  const filePath = getR2ConfigFilePath(normalized.bucket);
  const existing = readR2ConfigFile(filePath)?.data;
  const now = new Date().toISOString();
  const plaintext = Buffer.from(JSON.stringify(normalized), 'utf8');

  try {
    const encrypted = encryptSecret(plaintext, password);
    const data = {
      version: R2_CONFIG_SCHEMA_VERSION,
      encrypted: true,
      bucket: normalized.bucket,
      ...encrypted,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    writeJsonFile(filePath, data);
    writeR2Selector(normalized.bucket);

    return {
      bucket: normalized.bucket,
      filePath,
      selectorFile: R2_SELECTOR_FILE,
    };
  } finally {
    zeroBuffer(plaintext);
  }
}

export function listStoredR2Configs() {
  if (!fs.existsSync(R2_DIR)) return [];

  const current = readSelectedR2ConfigFile();
  const seen = new Set();
  const configs = [];
  if (current?.bucket) {
    configs.push({ ...current, isCurrent: true });
    seen.add(current.bucket);
  }

  const files = fs.readdirSync(R2_DIR)
    .filter((fileName) => fileName.endsWith('.json') && fileName !== path.basename(R2_SELECTOR_FILE))
    .sort((left, right) => left.localeCompare(right));

  for (const fileName of files) {
    const entry = readR2ConfigFile(path.join(R2_DIR, fileName));
    if (!entry?.bucket || seen.has(entry.bucket)) continue;
    configs.push({ ...entry, isCurrent: false });
    seen.add(entry.bucket);
  }

  return configs;
}

export function findStoredR2Config(bucket) {
  const normalizedBucket = normalizeR2BucketName(bucket);
  return listStoredR2Configs().find((entry) => entry.bucket === normalizedBucket) || null;
}

export function enableStoredR2Config(bucket) {
  const config = findStoredR2Config(bucket);
  if (!config) {
    return { error: `R2 bucket config not found: ${bucket}` };
  }

  if (config.isCurrent) {
    return {
      success: true,
      changed: false,
      bucket: config.bucket,
    };
  }

  writeR2Selector(config.bucket);
  return {
    success: true,
    changed: true,
    bucket: config.bucket,
    filePath: config.filePath,
  };
}

export function disableSelectedR2Config() {
  try {
    fs.rmSync(R2_SELECTOR_FILE, { force: true });
    return { success: true };
  } catch (error) {
    return { error: error.message || 'Failed to disable R2 log mirroring.' };
  }
}

export function getR2PublicMetadata() {
  const selected = readSelectedR2ConfigFile();
  const configs = listStoredR2Configs();
  return {
    exists: Boolean(selected),
    enabled: Boolean(selected),
    enabled_bucket: selected?.bucket || null,
    stored_buckets: configs.map((entry) => ({
      bucket: entry.bucket,
      enabled: Boolean(entry.isCurrent),
    })),
    configs_count: configs.length,
    password_env_var: PASS_ENV_VAR,
    password_env_configured: Boolean(process.env[PASS_ENV_VAR]),
    prefix_env_var: R2_PREFIX_ENV_VAR,
    prefix_configured: Boolean(normalizeR2Prefix(process.env[R2_PREFIX_ENV_VAR])),
  };
}

export function loadStoredR2ConfigCredentials(entry, {
  password = process.env[PASS_ENV_VAR],
} = {}) {
  if (!entry?.data) {
    return { enabled: false, reason: 'not-configured' };
  }
  if (!password) {
    return {
      enabled: false,
      bucket: entry?.bucket || null,
      reason: 'password-env-missing',
    };
  }

  let plaintext;
  try {
    plaintext = decryptSecret(entry.data, password);
    if (!plaintext) {
      return {
        enabled: false,
        bucket: entry?.bucket || null,
        reason: 'decrypt-failed',
      };
    }

    const credentials = normalizeR2Credentials(JSON.parse(plaintext));
    return {
      enabled: true,
      credentials,
      bucket: credentials.bucket,
      endpoints: getR2CredentialEndpoints(credentials),
    };
  } catch {
    return {
      enabled: false,
      bucket: entry?.bucket || null,
      reason: 'decrypt-failed',
    };
  } finally {
    plaintext = null;
  }
}

export function loadSelectedR2Credentials({
  password = process.env[PASS_ENV_VAR],
} = {}) {
  const selected = readSelectedR2ConfigFile();
  if (!selected) {
    return { enabled: false, reason: 'not-configured' };
  }
  return loadStoredR2ConfigCredentials(selected, { password });
}

export function normalizeR2Prefix(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

export function getR2ObjectKeyForLog(filePath, {
  logDir = LOG_DIR,
  prefix = process.env[R2_PREFIX_ENV_VAR],
} = {}) {
  const relativePath = path.relative(logDir, filePath);
  const safeRelativePath = relativePath.startsWith('..') || path.isAbsolute(relativePath)
    ? path.basename(filePath)
    : relativePath;
  const normalizedRelativePath = safeRelativePath.split(path.sep).filter(Boolean).join('/');
  const normalizedPrefix = normalizeR2Prefix(prefix);

  return normalizedPrefix
    ? `${normalizedPrefix}/${normalizedRelativePath}`
    : normalizedRelativePath;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding = null) {
  const digest = crypto.createHmac('sha256', key).update(value).digest();
  return encoding === 'hex' ? digest.toString('hex') : digest;
}

function getSignatureKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function formatAmzDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function encodeS3Path(value) {
  return String(value || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export async function putR2Object(credentials, objectKey, body, {
  endpointBaseUrl = null,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  timeoutMs = R2_UPLOAD_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('R2 upload requires a fetch implementation.');
  }

  const normalized = normalizeR2Credentials(credentials);
  const key = String(objectKey || '').trim();
  if (!key) throw new Error('R2 object key is required.');

  const bodyText = String(body ?? '');
  const payloadHash = sha256Hex(bodyText);
  const region = 'auto';
  const service = 's3';
  const { amzDate, dateStamp } = formatAmzDate(now);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const endpoint = endpointBaseUrl || `https://${normalized.account_id}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeURIComponent(normalized.bucket)}/${encodeS3Path(key)}`;
  const url = `${endpoint.replace(/\/+$/, '')}${canonicalUri}`;
  const host = new URL(url).host;
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = getSignatureKey(normalized.secret_access_key, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${normalized.access_key_id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'PUT',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      },
      body: bodyText,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`R2 upload failed with HTTP ${response.status}.`);
    }

    return {
      ok: true,
      status: response.status,
      bucket: normalized.bucket,
      objectKey: key,
    };
  } finally {
    clearTimeout(timeout);
    zeroBuffer(signingKey);
  }
}

export function createR2LogMirror({
  logDir = LOG_DIR,
  prefix = process.env[R2_PREFIX_ENV_VAR],
  credentialsResult = loadSelectedR2Credentials(),
  putObject = putR2Object,
} = {}) {
  if (!credentialsResult?.enabled) {
    return {
      enabled: false,
      reason: credentialsResult?.reason || 'not-configured',
      write: () => null,
      flush: async () => {},
    };
  }

  const credentials = credentialsResult.credentials;
  const pendingUploads = new Map();
  let drainPromise = null;

  async function drain() {
    while (pendingUploads.size > 0) {
      const uploads = [...pendingUploads.values()];
      pendingUploads.clear();
      for (const upload of uploads) {
        try {
          await putObject(credentials, upload.objectKey, upload.body);
        } catch {
          // Best-effort mirror: local log writes must remain authoritative.
        }
      }
    }
  }

  function ensureDrain() {
    if (drainPromise) return;
    drainPromise = drain().finally(() => {
      drainPromise = null;
      if (pendingUploads.size > 0) ensureDrain();
    });
  }

  return {
    enabled: true,
    write(filePath, summary) {
      if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;

      const objectKey = getR2ObjectKeyForLog(filePath, { logDir, prefix });
      pendingUploads.set(objectKey, {
        objectKey,
        body: `${JSON.stringify(summary, null, 2)}\n`,
      });
      ensureDrain();
      return objectKey;
    },
    async flush() {
      ensureDrain();
      while (drainPromise) {
        const active = drainPromise;
        await active;
        if (drainPromise === active) break;
      }
    },
  };
}
