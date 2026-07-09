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
const R2_PRESIGN_CACHE_SCHEMA_VERSION = 1;
const R2_UPLOAD_TIMEOUT_MS = 5_000;
export const R2_PRESIGN_DEFAULT_TIMEOUT_SECONDS = 604_800;
export const R2_PRESIGN_MAX_TIMEOUT_SECONDS = 604_800;
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

function updateR2ConfigFile(filePath, updater) {
  const entry = readR2ConfigFile(filePath);
  if (!entry?.data) return null;

  const nextData = updater({ ...entry.data });
  if (!nextData || typeof nextData !== 'object' || Array.isArray(nextData)) {
    return null;
  }

  writeJsonFile(entry.filePath, nextData);
  return {
    ...entry,
    data: nextData,
  };
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

function combineR2Prefixes(...parts) {
  return parts
    .map((part) => normalizeR2Prefix(part))
    .filter(Boolean)
    .join('/');
}

export function normalizeR2LogBotFilter(value) {
  const bot = String(value || '').trim();
  if (!bot) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(bot)) {
    throw new Error('Invalid bot filter: use a bot folder name without slashes or path traversal.');
  }
  return bot;
}

function normalizeR2ObjectPath(value) {
  const objectPath = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!objectPath) return null;

  const parts = objectPath.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid R2 object path: path traversal is not allowed.');
  }
  return parts.join('/');
}

function resolveR2TargetWithPrefix(targetPath, prefix = null) {
  const target = normalizeR2ObjectPath(targetPath);
  const normalizedPrefix = normalizeR2Prefix(prefix);
  if (!target) return normalizedPrefix;
  if (!normalizedPrefix || target === normalizedPrefix || target.startsWith(`${normalizedPrefix}/`)) {
    return target;
  }
  return `${normalizedPrefix}/${target}`;
}

function getR2ListPrefix(value) {
  const prefix = normalizeR2Prefix(value);
  return prefix ? `${prefix}/` : '';
}

function isR2JsonObjectPath(value) {
  return /\.json$/i.test(String(value || '').trim());
}

function getR2LogTimestampFromObjectKey(objectKey) {
  const fileName = String(objectKey || '').split('/').filter(Boolean).pop() || '';
  return fileName.match(/\.(\d{14})(?:\.\d+)?\.json$/i)?.[1] || null;
}

function getCanonicalR2LogKeyParts(objectKey, {
  prefix = process.env[R2_PREFIX_ENV_VAR],
} = {}) {
  const key = normalizeR2Prefix(objectKey);
  if (!key) return null;

  const normalizedPrefix = normalizeR2Prefix(prefix);
  const relativeKey = normalizedPrefix
    ? (key.startsWith(`${normalizedPrefix}/`) ? key.slice(normalizedPrefix.length + 1) : '')
    : key;
  if (!relativeKey) return null;

  const parts = relativeKey.split('/').filter(Boolean);
  if (parts.length !== 2) return null;

  const [bot, fileName] = parts;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(bot)) return null;

  const match = fileName.match(/^([A-Za-z0-9][A-Za-z0-9_-]*)\.(\d{14})\.json$/);
  if (!match || match[1] !== bot) return null;

  return {
    bot,
    timestamp: match[2],
    fileName,
    relativeKey,
  };
}

function isCanonicalR2LogObjectKey(objectKey, { prefix = process.env[R2_PREFIX_ENV_VAR] } = {}) {
  return Boolean(getCanonicalR2LogKeyParts(objectKey, { prefix }));
}

function isJsonText(value) {
  try {
    JSON.parse(String(value ?? ''));
    return true;
  } catch {
    return false;
  }
}

function getR2ObjectFileName(objectKey) {
  const fileName = String(objectKey || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
  if (!fileName) {
    throw new Error('R2 object key is required to derive the output file name.');
  }
  return fileName;
}

export function resolveR2PresignOutputPath(outputPath, objectKey, {
  cwd = process.cwd(),
} = {}) {
  const raw = String(outputPath || '').trim();
  if (!raw) {
    throw new Error('-o/--output requires a path or file name.');
  }

  const resolvedRaw = path.resolve(cwd, raw);
  const isDirectoryTarget = /[\\/]$/.test(raw) || (() => {
    try {
      return fs.statSync(resolvedRaw).isDirectory();
    } catch {
      return false;
    }
  })();

  if (isDirectoryTarget) {
    return path.join(resolvedRaw, getR2ObjectFileName(objectKey));
  }

  return path.extname(resolvedRaw) ? resolvedRaw : `${resolvedRaw}.json`;
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

export function getLocalLogPathForR2ObjectKey(objectKey, {
  logDir = LOG_DIR,
  prefix = process.env[R2_PREFIX_ENV_VAR],
} = {}) {
  const key = normalizeR2Prefix(objectKey);
  if (!key) return null;

  const normalizedPrefix = normalizeR2Prefix(prefix);
  const relativeKey = normalizedPrefix
    ? (key === normalizedPrefix ? '' : key.startsWith(`${normalizedPrefix}/`) ? key.slice(normalizedPrefix.length + 1) : '')
    : key;
  if (!relativeKey) return null;

  const parts = relativeKey.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    return null;
  }

  const resolvedLogDir = path.resolve(logDir);
  const filePath = path.resolve(resolvedLogDir, ...parts);
  if (filePath !== resolvedLogDir && !filePath.startsWith(`${resolvedLogDir}${path.sep}`)) {
    return null;
  }
  return filePath;
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

function awsEncode(value) {
  return encodeURIComponent(String(value ?? ''))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildCanonicalQueryString(params = {}) {
  const pairs = [];
  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === undefined || rawValue === null) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      pairs.push([awsEncode(key), awsEncode(value)]);
    }
  }

  return pairs
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder || leftValue.localeCompare(rightValue);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function encodeS3Path(value) {
  return String(value || '')
    .split('/')
    .map((part) => awsEncode(part))
    .join('/');
}

function getR2EndpointBaseUrl(credentials, endpointBaseUrl = null) {
  const normalized = normalizeR2Credentials(credentials);
  return endpointBaseUrl || `https://${normalized.account_id}.r2.cloudflarestorage.com`;
}

function createR2SignedRequest(credentials, {
  method,
  canonicalUri,
  queryString = '',
  bodyText = '',
  endpointBaseUrl = null,
  now = new Date(),
} = {}) {
  const normalized = normalizeR2Credentials(credentials);
  const endpoint = getR2EndpointBaseUrl(normalized, endpointBaseUrl);
  const url = `${endpoint.replace(/\/+$/, '')}${canonicalUri}${queryString ? `?${queryString}` : ''}`;
  const host = new URL(url).host;
  const payloadHash = sha256Hex(bodyText);
  const region = 'auto';
  const service = 's3';
  const { amzDate, dateStamp } = formatAmzDate(now);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    canonicalUri,
    queryString,
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
  zeroBuffer(signingKey);

  return {
    url,
    headers: {
      Authorization: authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  };
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function decodeS3ListKey(value) {
  const decodedXml = decodeXmlText(value);
  try {
    return decodeURIComponent(decodedXml.replace(/\+/g, '%20'));
  } catch {
    return decodedXml;
  }
}

function readXmlTag(xml, tagName) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  return xml.match(pattern)?.[1] ?? null;
}

function parseR2ListObjectsXml(xml) {
  const contents = [];
  const entryPattern = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match;
  while ((match = entryPattern.exec(xml))) {
    const body = match[1];
    const key = readXmlTag(body, 'Key');
    if (!key) continue;
    const sizeText = readXmlTag(body, 'Size');
    const lastModifiedText = readXmlTag(body, 'LastModified');
    contents.push({
      key: decodeS3ListKey(key),
      size: Number.parseInt(sizeText || '0', 10) || 0,
      lastModified: lastModifiedText ? new Date(decodeXmlText(lastModifiedText)) : null,
      etag: decodeXmlText(readXmlTag(body, 'ETag') || '').replace(/^"|"$/g, '') || null,
    });
  }

  return {
    contents,
    isTruncated: decodeXmlText(readXmlTag(xml, 'IsTruncated') || '').toLowerCase() === 'true',
    nextContinuationToken: decodeXmlText(readXmlTag(xml, 'NextContinuationToken') || '') || null,
  };
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
  const canonicalUri = `/${encodeURIComponent(normalized.bucket)}/${encodeS3Path(key)}`;
  const signed = createR2SignedRequest(normalized, {
    method: 'PUT',
    canonicalUri,
    bodyText,
    endpointBaseUrl,
    now,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(signed.url, {
      method: 'PUT',
      headers: {
        ...signed.headers,
        'Content-Type': 'application/json',
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
  }
}

export async function listR2Objects(credentials, {
  prefix = '',
  endpointBaseUrl = null,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  timeoutMs = R2_UPLOAD_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('R2 list requires a fetch implementation.');
  }

  const normalized = normalizeR2Credentials(credentials);
  const canonicalUri = `/${encodeURIComponent(normalized.bucket)}`;
  const results = [];
  let continuationToken = null;

  do {
    const params = {
      'encoding-type': 'url',
      'list-type': '2',
      ...(prefix ? { prefix } : {}),
      ...(continuationToken ? { 'continuation-token': continuationToken } : {}),
    };
    const queryString = buildCanonicalQueryString(params);
    const signed = createR2SignedRequest(normalized, {
      method: 'GET',
      canonicalUri,
      queryString,
      endpointBaseUrl,
      now,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(signed.url, {
        method: 'GET',
        headers: signed.headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`R2 list failed with HTTP ${response.status}.`);
      }

      const parsed = parseR2ListObjectsXml(await response.text());
      results.push(...parsed.contents);
      continuationToken = parsed.isTruncated ? parsed.nextContinuationToken : null;
    } finally {
      clearTimeout(timeout);
    }
  } while (continuationToken);

  return {
    bucket: normalized.bucket,
    prefix,
    objects: results,
  };
}

export async function getR2Object(credentials, objectKey, {
  endpointBaseUrl = null,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  timeoutMs = R2_UPLOAD_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('R2 download requires a fetch implementation.');
  }

  const normalized = normalizeR2Credentials(credentials);
  const key = String(objectKey || '').trim();
  if (!key) throw new Error('R2 object key is required.');

  const canonicalUri = `/${encodeURIComponent(normalized.bucket)}/${encodeS3Path(key)}`;
  const signed = createR2SignedRequest(normalized, {
    method: 'GET',
    canonicalUri,
    endpointBaseUrl,
    now,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(signed.url, {
      method: 'GET',
      headers: signed.headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`R2 download failed with HTTP ${response.status}.`);
    }

    const body = await response.text();
    return {
      ok: true,
      status: response.status,
      bucket: normalized.bucket,
      objectKey: key,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeR2PresignTimeout(value = R2_PRESIGN_DEFAULT_TIMEOUT_SECONDS) {
  const seconds = Number.parseInt(String(value || R2_PRESIGN_DEFAULT_TIMEOUT_SECONDS), 10);
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > R2_PRESIGN_MAX_TIMEOUT_SECONDS) {
    throw new Error(`Invalid presign timeout: use an integer from 1 to ${R2_PRESIGN_MAX_TIMEOUT_SECONDS} seconds.`);
  }
  return seconds;
}

export function createR2PresignedGetUrl(credentials, objectKey, {
  expiresIn = R2_PRESIGN_DEFAULT_TIMEOUT_SECONDS,
  endpointBaseUrl = null,
  now = new Date(),
} = {}) {
  const normalized = normalizeR2Credentials(credentials);
  const key = String(objectKey || '').trim();
  if (!key) throw new Error('R2 object key is required.');

  const safeExpiresIn = normalizeR2PresignTimeout(expiresIn);
  const canonicalUri = `/${encodeURIComponent(normalized.bucket)}/${encodeS3Path(key)}`;
  const endpoint = getR2EndpointBaseUrl(normalized, endpointBaseUrl);
  const host = new URL(endpoint).host;
  const region = 'auto';
  const service = 's3';
  const { amzDate, dateStamp } = formatAmzDate(now);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const queryString = buildCanonicalQueryString({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${normalized.access_key_id}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': safeExpiresIn,
    'X-Amz-SignedHeaders': 'host',
  });
  const canonicalRequest = [
    'GET',
    canonicalUri,
    queryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = getSignatureKey(normalized.secret_access_key, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, 'hex');
  zeroBuffer(signingKey);

  const expiresAt = new Date(now.getTime() + safeExpiresIn * 1000);
  return {
    url: `${endpoint.replace(/\/+$/, '')}${canonicalUri}?${queryString}&X-Amz-Signature=${signature}`,
    bucket: normalized.bucket,
    objectKey: key,
    expiresIn: safeExpiresIn,
    expiresAtUtc: expiresAt.toISOString(),
  };
}

export function getCachedR2PresignedUrl(entry, {
  objectKey = null,
  now = new Date(),
} = {}) {
  const cached = entry?.data?.presigned_url;
  if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return null;
  if (cached.version !== R2_PRESIGN_CACHE_SCHEMA_VERSION) return null;
  if (typeof cached.url !== 'string' || !cached.url.trim()) return null;
  if (typeof cached.object_key !== 'string' || !cached.object_key.trim()) return null;
  if (objectKey && cached.object_key !== objectKey) return null;

  const expiresAt = new Date(cached.expires_at_utc || 0);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return null;

  return {
    url: cached.url,
    bucket: entry.bucket,
    objectKey: cached.object_key,
    expiresIn: Number(cached.timeout_seconds) || null,
    expiresAtUtc: expiresAt.toISOString(),
    cached: true,
  };
}

export function saveCachedR2PresignedUrl(entry, presigned) {
  if (!entry?.filePath) {
    throw new Error('R2 config entry is required to cache a presigned URL.');
  }
  if (!presigned?.url || !presigned?.objectKey || !presigned?.expiresAtUtc) {
    throw new Error('Invalid presigned URL payload.');
  }

  const updated = updateR2ConfigFile(entry.filePath, (data) => ({
    ...data,
    presigned_url: {
      version: R2_PRESIGN_CACHE_SCHEMA_VERSION,
      url: presigned.url,
      object_key: presigned.objectKey,
      timeout_seconds: presigned.expiresIn,
      created_at_utc: new Date().toISOString(),
      expires_at_utc: presigned.expiresAtUtc,
    },
  }));

  if (!updated) {
    throw new Error('Failed to update R2 presigned URL cache.');
  }
  return updated.data.presigned_url;
}

function listLocalLogFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(filePath);
      } else if (entry.isFile()) {
        files.push(filePath);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function isRemoteNewer(remoteObject, localStat) {
  const remoteTime = remoteObject?.lastModified instanceof Date
    ? remoteObject.lastModified.getTime()
    : Number.NaN;
  if (!Number.isFinite(remoteTime)) return false;
  return remoteTime > localStat.mtimeMs + 1000;
}

function isLocalNewer(localStat, remoteObject) {
  const remoteTime = remoteObject?.lastModified instanceof Date
    ? remoteObject.lastModified.getTime()
    : Number.NaN;
  if (!Number.isFinite(remoteTime)) return true;
  return localStat.mtimeMs > remoteTime + 1000;
}

function writeDownloadedLogFile(filePath, body, lastModified = null) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, String(body ?? ''), 'utf8');
  fs.renameSync(tempPath, filePath);
  if (lastModified instanceof Date && Number.isFinite(lastModified.getTime())) {
    fs.utimesSync(filePath, lastModified, lastModified);
  }
}

async function getValidJsonR2Object(getObject, credentials, objectKey) {
  const downloaded = await getObject(credentials, objectKey);
  return isJsonText(downloaded.body) ? downloaded : null;
}

export async function resolveLatestR2JsonObjectKey(credentials, {
  targetPath = null,
  prefix = null,
  listObjects = listR2Objects,
} = {}) {
  const resolvedTarget = resolveR2TargetWithPrefix(targetPath, prefix);
  if (resolvedTarget && isR2JsonObjectPath(resolvedTarget)) {
    return resolvedTarget;
  }

  const listPrefix = getR2ListPrefix(resolvedTarget || normalizeR2Prefix(prefix));
  const listed = await listObjects(credentials, { prefix: listPrefix });
  const objects = listed.objects
    .map((entry) => ({
      ...entry,
      logTimestamp: getR2LogTimestampFromObjectKey(entry.key),
    }))
    .filter((entry) => entry.key.endsWith('.json') && entry.logTimestamp)
    .sort((left, right) => {
      const timestampOrder = right.logTimestamp.localeCompare(left.logTimestamp);
      return timestampOrder || right.key.localeCompare(left.key);
    });

  if (objects.length === 0) {
    const suffix = listPrefix ? ` under ${listPrefix}` : '';
    throw new Error(`No timestamped mirrored JSON logs found in R2${suffix}.`);
  }
  return objects[0].key;
}

export async function syncR2Logs({
  bot = null,
  logDir = LOG_DIR,
  prefix = process.env[R2_PREFIX_ENV_VAR],
  credentialsResult = loadSelectedR2Credentials(),
  listObjects = listR2Objects,
  getObject = getR2Object,
  putObject = putR2Object,
} = {}) {
  if (!credentialsResult?.enabled) {
    throw new Error(`R2 credentials are not available: ${credentialsResult?.reason || 'not-configured'}.`);
  }

  const credentials = credentialsResult.credentials;
  const botFilter = normalizeR2LogBotFilter(bot);
  const listPrefix = getR2ListPrefix(combineR2Prefixes(prefix, botFilter));
  const localRoot = botFilter ? path.join(logDir, botFilter) : logDir;
  const localFiles = listLocalLogFiles(localRoot);
  const operations = [];
  const localByObjectKey = new Map();

  for (const filePath of localFiles) {
    const objectKey = getR2ObjectKeyForLog(filePath, { logDir, prefix });
    if (!isCanonicalR2LogObjectKey(objectKey, { prefix })) {
      operations.push({ action: 'skipped', reason: 'invalid-local-log-name', objectKey, filePath });
      continue;
    }

    const body = fs.readFileSync(filePath, 'utf8');
    if (!isJsonText(body)) {
      operations.push({ action: 'skipped', reason: 'invalid-local-log-json', objectKey, filePath });
      continue;
    }

    localByObjectKey.set(objectKey, { filePath, body });
  }

  const listed = await listObjects(credentials, { prefix: listPrefix });
  const remoteByObjectKey = new Map();
  for (const remoteObject of listed.objects) {
    if (!isCanonicalR2LogObjectKey(remoteObject.key, { prefix })) {
      const filePath = getLocalLogPathForR2ObjectKey(remoteObject.key, { logDir, prefix });
      operations.push({
        action: 'skipped',
        reason: filePath ? 'invalid-remote-log-name' : 'outside-log-prefix',
        objectKey: remoteObject.key,
        filePath,
      });
      continue;
    }

    remoteByObjectKey.set(remoteObject.key, remoteObject);
  }

  for (const [objectKey, localObject] of localByObjectKey) {
    const { filePath, body } = localObject;
    const remoteObject = remoteByObjectKey.get(objectKey);
    const localStat = fs.statSync(filePath);
    if (!remoteObject) {
      await putObject(credentials, objectKey, body);
      operations.push({ action: 'uploaded', objectKey, filePath });
      continue;
    }

    if (isRemoteNewer(remoteObject, localStat)) {
      const downloaded = await getValidJsonR2Object(getObject, credentials, objectKey);
      if (!downloaded) {
        operations.push({ action: 'skipped', reason: 'invalid-remote-log-json', objectKey, filePath });
        await putObject(credentials, objectKey, body);
        operations.push({ action: 'uploaded', reason: 'remote-invalid-json', objectKey, filePath });
        continue;
      }

      writeDownloadedLogFile(filePath, downloaded.body, remoteObject.lastModified);
      operations.push({ action: 'downloaded', reason: 'remote-newer', objectKey, filePath });
    } else if (isLocalNewer(localStat, remoteObject) || remoteObject.size !== localStat.size) {
      await putObject(credentials, objectKey, body);
      operations.push({ action: 'uploaded', reason: 'local-newer', objectKey, filePath });
    } else {
      operations.push({ action: 'skipped', reason: 'same-size-and-mtime', objectKey, filePath });
    }
  }

  for (const remoteObject of remoteByObjectKey.values()) {
    if (localByObjectKey.has(remoteObject.key)) continue;
    const filePath = getLocalLogPathForR2ObjectKey(remoteObject.key, { logDir, prefix });
    if (!filePath) {
      operations.push({ action: 'skipped', reason: 'outside-log-prefix', objectKey: remoteObject.key, filePath: null });
      continue;
    }

    const downloaded = await getValidJsonR2Object(getObject, credentials, remoteObject.key);
    if (!downloaded) {
      operations.push({ action: 'skipped', reason: 'invalid-remote-log-json', objectKey: remoteObject.key, filePath });
      continue;
    }

    writeDownloadedLogFile(filePath, downloaded.body, remoteObject.lastModified);
    operations.push({ action: 'downloaded', reason: 'remote-only', objectKey: remoteObject.key, filePath });
  }

  const counts = operations.reduce((acc, operation) => {
    acc[operation.action] = (acc[operation.action] || 0) + 1;
    return acc;
  }, {});
  const inconsistencies = operations.filter((operation) => (
    operation.action === 'skipped'
    && [
      'invalid-local-log-name',
      'invalid-local-log-json',
      'invalid-remote-log-name',
      'invalid-remote-log-json',
      'outside-log-prefix',
    ].includes(operation.reason)
  ));

  return {
    success: true,
    bucket: credentials.bucket,
    bot: botFilter,
    log_dir: logDir,
    remote_prefix: listPrefix,
    uploaded: counts.uploaded || 0,
    downloaded: counts.downloaded || 0,
    skipped: counts.skipped || 0,
    inconsistencies,
    operations,
  };
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
