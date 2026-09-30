/** Remote-only deletion within the selected bucket and a confirmed object list. */
import readline from 'node:readline';
import { deleteR2Object, listR2Objects, normalizeR2BucketName } from './r2.js';

export function parseR2EmptyTarget(value, { bucket: selectedBucket } = {}) {
  const raw = String(value ?? '');
  const bucket = normalizeR2BucketName(selectedBucket);
  const segments = raw ? raw.split('/') : [];
  const folder = raw.endsWith('/');
  if (folder) segments.pop();
  if (segments.some((part) => !part || part === '.' || part === '..')
      || /[\\\x00-\x1f\x7f]/.test(raw)) {
    throw new Error('Invalid empty target: use a relative folder/file path, without empty segments or path traversal.');
  }
  return { bucket, path: segments.join('/'), folder };
}

export async function planR2Empty(credentials, target, { listObjects = listR2Objects } = {}) {
  if (credentials.bucket !== target.bucket) throw new Error('R2 empty target does not match the credential bucket.');
  const prefix = target.path && target.folder ? `${target.path}/` : target.path;
  const listed = await listObjects(credentials, { prefix });
  const exact = !target.folder && target.path
    ? listed.objects.find((object) => object.key === target.path)
    : null;
  const objects = exact ? [exact] : listed.objects.filter((object) => (
    !target.path || object.key.startsWith(`${target.path}/`)
  ));
  const keys = [...new Set(objects.map((object) => object.key))].sort();
  return Object.freeze({
    bucket: target.bucket,
    path: target.path,
    kind: exact ? 'file' : target.path ? 'folder' : 'bucket',
    keys: Object.freeze(keys),
  });
}

export async function confirmR2EmptyPlan(plan, {
  input = process.stdin,
  output = process.stderr,
} = {}) {
  output.write(`\nRemote files selected in ${JSON.stringify(plan.bucket)} (${plan.keys.length}):\n`);
  for (const key of plan.keys) output.write(`  ${JSON.stringify(key)}\n`);
  if (plan.keys.length === 0) return false;
  if (!input.isTTY || !output.isTTY) {
    throw new Error('empty requires an interactive terminal for confirmation; no files were deleted.');
  }
  const rl = readline.createInterface({ input, output });
  const answer = await new Promise((resolve) => {
    rl.once('close', () => resolve(''));
    rl.once('SIGINT', () => rl.close());
    rl.question(`\nDelete ${plan.keys.length === 1 ? 'this remote file' : `all ${plan.keys.length} remote files listed above`} from this path? Type EMPTY to confirm: `, (value) => {
      resolve(value);
      rl.close();
    });
  });
  return answer.trim() === 'EMPTY';
}

export async function emptyR2Target(credentials, target, {
  listObjects = listR2Objects,
  deleteObject = deleteR2Object,
  confirm = confirmR2EmptyPlan,
} = {}) {
  const plan = await planR2Empty(credentials, target, { listObjects });
  const confirmed = await confirm(plan);
  const result = {
    bucket: plan.bucket,
    path: plan.path,
    kind: plan.kind,
    selected: plan.keys.length,
    cancelled: plan.keys.length > 0 && confirmed !== true,
    deleted: [],
    failed: [],
  };
  if (confirmed !== true) return result;
  // Delete exactly the keys shown in the confirmation, without listing again.
  for (const key of plan.keys) {
    try {
      await deleteObject(credentials, key);
      result.deleted.push(key);
    } catch (error) {
      result.failed.push({ key, error: String(error?.message || error) });
    }
  }
  return result;
}
