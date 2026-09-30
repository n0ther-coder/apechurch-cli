/** Shared path selection for shallow and recursive log/script synchronization. */
import fs from 'node:fs';
import path from 'node:path';

export function normalizeSyncPath(value) {
  let raw = String(value ?? '').trim();
  if (!raw || raw === '.' || raw === './') return '';
  if (raw.startsWith('./')) raw = raw.slice(2);
  if (raw.endsWith('/')) raw = raw.slice(0, -1);
  if (!raw || path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)
      || /[\\\x00-\x1f\x7f]/.test(raw)
      || raw.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid sync path: use a relative path inside the configured directory, without path traversal.');
  }
  return raw;
}

export function isSafeSyncKey(key) {
  try { return typeof key === 'string' && key.length > 0 && normalizeSyncPath(key) === key; }
  catch { return false; }
}

// Check every existing path component, including ancestor directories of downloads.
export function safeLocalSyncPath(rootDir, key) {
  if (key && !isSafeSyncKey(key)) return null;
  const root = path.resolve(rootDir);
  const parts = key ? key.split('/') : [];
  let current = root;
  for (let i = 0; i <= parts.length; i++) {
    if (i > 0) current = path.join(current, parts[i - 1]);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || (i < parts.length && !stat.isDirectory())) return null;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return current;
}

export function selectSyncTarget(value, { rootDir, script = false, recursive = false, remoteKeys = [] } = {}) {
  const target = normalizeSyncPath(value);
  if (!target) return { path: '', file: false };
  const directoryRequested = String(value).endsWith('/');
  const local = safeLocalSyncPath(rootDir, target);
  const localDirectory = local && fs.existsSync(local) && fs.lstatSync(local).isDirectory();
  if (directoryRequested || localDirectory || (!/\.json$/i.test(target)
      && (remoteKeys.some((key) => key.startsWith(`${target}/`)) || recursive || !script))) {
    return { path: target, file: false };
  }
  return { path: script && !/\.json$/i.test(target) ? `${target}.json` : target, file: true };
}

export function syncKeyScope(key, target, recursive) {
  if (target.file) return key === target.path ? 'included' : 'outside';
  const prefix = target.path ? `${target.path}/` : '';
  if (!key.startsWith(prefix)) return 'outside';
  const relative = key.slice(prefix.length);
  if (!relative) return 'outside';
  return !recursive && relative.includes('/') ? 'recursive-required' : 'included';
}

export function collectLocalSyncFiles(rootDir, target, recursive) {
  const files = [];
  const skipped = [];
  function visit(key, descend) {
    const filePath = safeLocalSyncPath(rootDir, key);
    if (!filePath) { skipped.push({ key, reason: 'unsafe-local-path' }); return; }
    let stat;
    try { stat = fs.lstatSync(filePath); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isFile()) {
      if (key === target.path && !target.file) throw new Error('The selected sync folder is a file; use its exact .json path without a trailing slash.');
      files.push(key);
      return;
    }
    if (!stat.isDirectory()) { skipped.push({ key, reason: 'unsafe-local-path' }); return; }
    if (!descend) { skipped.push({ key, reason: 'recursive-required' }); return; }
    for (const entry of fs.readdirSync(filePath).sort()) {
      visit(key ? `${key}/${entry}` : entry, recursive);
    }
  }
  visit(target.path, !target.file);
  return { files, skipped };
}

export function syncRecursionHint(inconsistencies, recursive) {
  return !recursive && inconsistencies.some((item) => item.reason === 'recursive-required')
    ? 'Use -r / --recursive to include subfolders under the selected sync path.' : null;
}
