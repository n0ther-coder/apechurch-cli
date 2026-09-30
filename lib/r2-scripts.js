/** Two-way sync of manually named JSON command scripts. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SCR_DIR } from './constants.js';
import { normalizeSyncPath, isSafeSyncKey, safeLocalSyncPath, selectSyncTarget, syncKeyScope, collectLocalSyncFiles, syncRecursionHint } from './r2-sync-paths.js';
import { normalizeScriptCommand, validateScriptName } from './scripts.js';
import { getR2Object, listR2Objects, loadSelectedR2Credentials, putR2Object } from './r2.js';

function isScriptKey(key) {
  return typeof key === 'string' && /\.json$/i.test(key)
    && !/[\/\\\x00-\x1f\x7f]/.test(key) && key === key.trim();
}

function isValidScript(body) {
  try {
    normalizeScriptCommand(JSON.parse(body));
    return true;
  } catch {
    return false;
  }
}

function scriptFilter(value) {
  if (value === null || value === undefined) return null;
  const name = validateScriptName(value);
  if (!isScriptKey(name)) throw new Error('Invalid script file name.');
  return name;
}

export async function resolveR2ScriptObjectKey(credentials, {
  targetPath = null,
  listObjects = listR2Objects,
} = {}) {
  const target = scriptFilter(targetPath);
  if (target) return target;
  const listed = await listObjects(credentials, { prefix: '' });
  const objects = listed.objects.filter((object) => isScriptKey(object.key));
  objects.sort((left, right) => (
    (new Date(right.lastModified).getTime() || 0) - (new Date(left.lastModified).getTime() || 0)
    || right.key.localeCompare(left.key)
  ));
  if (!objects.length) throw new Error('No JSON command scripts found in R2.');
  return objects[0].key;
}

function writeDownloadedScript(filePath, body, lastModified) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(tempPath, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    const time = new Date(lastModified).getTime();
    if (lastModified && Number.isFinite(time)) fs.utimesSync(tempPath, time / 1000, time / 1000);
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export async function syncR2Scripts({
  script = null,
  recursive = false,
  scriptDir = SCR_DIR,
  credentialsResult = loadSelectedR2Credentials({ type: 'script' }),
  listObjects = listR2Objects,
  getObject = getR2Object,
  putObject = putR2Object,
} = {}) {
  if (!credentialsResult?.enabled) {
    throw new Error(`R2 script credentials are not available: ${credentialsResult?.reason || 'not-configured'}.`);
  }
  const credentials = credentialsResult.credentials;
  const rawPath = normalizeSyncPath(script);
  const listed = await listObjects(credentials, { prefix: rawPath });
  const target = selectSyncTarget(script, { rootDir: scriptDir, script: true, recursive, remoteKeys: listed.objects.map((o) => o.key) });
  const operations = [];
  const local = collectLocalSyncFiles(scriptDir, target, recursive);
  for (const item of local.skipped) {
    operations.push({ action: 'skipped', reason: item.reason, objectKey: item.key });
  }
  const remote = new Map();
  for (const object of listed.objects) {
    const scope = syncKeyScope(object.key, target, recursive);
    if (scope === 'outside') continue;
    if (local.skipped.some((item) => item.reason === 'unsafe-local-path'
        && (object.key === item.key || object.key.startsWith(`${item.key}/`)))) continue;
    if (object.key.endsWith('/') && isSafeSyncKey(object.key.slice(0, -1))) {
      if (!recursive) operations.push({ action: 'skipped', reason: 'recursive-required', objectKey: object.key });
      continue;
    }
    if (!isSafeSyncKey(object.key)) {
      operations.push({ action: 'skipped', reason: 'invalid-remote-script-name', objectKey: object.key });
    } else if (scope === 'recursive-required') {
      operations.push({ action: 'skipped', reason: scope, objectKey: object.key });
    } else if (!/\.json$/i.test(object.key)) {
      operations.push({ action: 'skipped', reason: 'invalid-remote-script-name', objectKey: object.key });
    } else {
      remote.set(object.key, object);
    }
  }
  const names = [...new Set([...local.files, ...remote.keys()])].sort();
  for (const name of names) {
    const filePath = safeLocalSyncPath(scriptDir, name);
    const record = (action, reason) => operations.push({ action, reason, objectKey: name, filePath });
    if (!filePath) { record('skipped', 'unsafe-local-path'); continue; }
    if (!/\.json$/i.test(name)) { record('skipped', 'invalid-local-script-name'); continue; }
    let localStat = null;
    try { localStat = fs.lstatSync(filePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (localStat && !localStat.isFile()) { record('skipped', 'unsafe-local-script-file'); continue; }
    const localBody = localStat ? fs.readFileSync(filePath, 'utf8') : null;
    if (localBody !== null && !isValidScript(localBody)) { record('skipped', 'invalid-local-script-json'); continue; }
    const object = remote.get(name);
    if (!object) {
      await putObject(credentials, name, localBody);
      record('uploaded', 'local-only');
      continue;
    }
    const remoteTime = object.lastModified ? new Date(object.lastModified).getTime() : Number.NaN;
    if (localStat && !Number.isFinite(remoteTime)) { record('skipped', 'invalid-remote-script-time'); continue; }
    if (localStat && localStat.mtimeMs > remoteTime + 1000) {
      await putObject(credentials, name, localBody);
      record('uploaded', 'local-newer');
      continue;
    }
    const downloaded = await getObject(credentials, name);
    if (!isValidScript(downloaded.body)) { record('skipped', 'invalid-remote-script-json'); continue; }
    if (localStat && Math.abs(localStat.mtimeMs - remoteTime) <= 1000) {
      record('skipped', localBody === downloaded.body ? 'same-content-and-time' : 'same-time-different-content');
      continue;
    }
    // Do not replace a file edited or created locally while the request was in flight.
    if (!safeLocalSyncPath(scriptDir, name)) { record('skipped', 'unsafe-local-path'); continue; }
    let current = null;
    try { current = fs.lstatSync(filePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (localStat ? !current?.isFile() || current.mtimeMs !== localStat.mtimeMs || current.size !== localStat.size : current !== null) {
      record('skipped', 'local-script-changed-during-sync');
      continue;
    }
    writeDownloadedScript(filePath, downloaded.body, object.lastModified);
    record('downloaded', localStat ? 'remote-newer' : 'remote-only');
  }
  return {
    success: true,
    bucket: credentials.bucket,
    script: target.file ? target.path : null,
    sync_path: target.path,
    recursive,
    hint: syncRecursionHint(operations, recursive),
    script_dir: scriptDir,
    remote_prefix: '',
    uploaded: operations.filter((op) => op.action === 'uploaded').length,
    downloaded: operations.filter((op) => op.action === 'downloaded').length,
    skipped: operations.filter((op) => op.action === 'skipped').length,
    inconsistencies: operations.filter((op) => op.action === 'skipped' && op.reason !== 'same-content-and-time'),
    operations,
  };
}
