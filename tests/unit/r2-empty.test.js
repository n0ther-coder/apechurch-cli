import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { confirmR2EmptyPlan, emptyR2Target, parseR2EmptyTarget, planR2Empty } from '../../lib/r2-empty.js';
import { deleteR2Object, listR2Objects } from '../../lib/r2.js';

const credentials = {
  bucket: 'example-bucket', account_id: 'test-account', api_token: 'test-token',
  access_key_id: 'test-key', secret_access_key: 'test-secret',
};
const parseTarget = (value) => parseR2EmptyTarget(value, { bucket: credentials.bucket });
const objectList = (keys) => ({ objects: keys.map((key) => ({ key })) });

function confirmationStreams(answer) {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = output.isTTY = true;
  let text = '';
  output.on('data', (chunk) => {
    text += chunk.toString();
    if (chunk.toString().includes('Type EMPTY')) {
      setImmediate(() => answer === null ? input.end() : input.write(`${answer}\n`));
    }
  });
  return { input, output, text: () => text };
}

describe('R2 remote empty', () => {
  it('requires a selected bucket and rejects ambiguous relative paths', () => {
    assert.throws(() => parseR2EmptyTarget('folder'));
    for (const target of ['/', '/folder', 'folder//file', '../file', './file', 'folder/../file', 'folder\\file', 'file\n']) {
      assert.throws(() => parseTarget(target));
    }
    assert.deepEqual(parseTarget('folder/file.txt'), {
      bucket: 'example-bucket', path: 'folder/file.txt', folder: false,
    });
  });

  it('treats bucket-looking components as paths within the selected bucket', () => {
    assert.deepEqual(parseTarget('other-bucket/folder/'), {
      bucket: credentials.bucket, path: 'other-bucket/folder', folder: true,
    });
    assert.equal(parseTarget(' ').path, ' ');
  });

  it('includes every object type at bucket root and deduplicates the confirmation list', async () => {
    for (const target of [undefined, null, '']) {
      const plan = await planR2Empty(credentials, parseTarget(target), {
        listObjects: async (_, options) => {
          assert.equal(options.prefix, '');
          return objectList(['root.json', 'folder/note.txt', 'folder/', 'root.json']);
        },
      });
      assert.deepEqual(plan.keys, ['folder/', 'folder/note.txt', 'root.json']);
    }
  });

  it('matches recursive folders with a slash boundary, with or without trailing slash', async () => {
    for (const target of ['folder', 'folder/']) {
      const plan = await planR2Empty(credentials, parseTarget(target), {
        listObjects: async () => objectList(['folder/a.json', 'folder/sub/b.txt', 'folder-other/c.json', 'folders/d.json']),
      });
      assert.deepEqual(plan.keys, ['folder/a.json', 'folder/sub/b.txt']);
      assert.equal(plan.kind, 'folder');
    }
  });

  it('selects exact objects of any extension, while a slash explicitly selects descendants', async () => {
    const listObjects = async () => objectList(['folder', 'folder/a.json', 'folder-other']);
    const file = await planR2Empty(credentials, parseTarget('folder'), { listObjects });
    assert.deepEqual(file.keys, ['folder']);
    assert.equal(file.kind, 'file');
    const folder = await planR2Empty(credentials, parseTarget('folder/'), { listObjects });
    assert.deepEqual(folder.keys, ['folder/a.json']);
  });

  it('rejects credential/target mismatches before listing', async () => {
    await assert.rejects(planR2Empty(credentials, parseR2EmptyTarget('', { bucket: 'different-bucket' }), {
      listObjects: async () => assert.fail('must not list'),
    }), /does not match/);
  });

  it('never deletes before a positive confirmation, including empty targets and rejected prompts', async () => {
    for (const keys of [[], ['file.json']]) {
      const result = await emptyR2Target(credentials, parseTarget(''), {
        listObjects: async () => objectList(keys),
        confirm: async (plan) => { assert.deepEqual(plan.keys, keys); return false; },
        deleteObject: async () => assert.fail('must not delete'),
      });
      assert.deepEqual(result.deleted, []);
      assert.equal(result.cancelled, keys.length > 0);
    }
    await assert.rejects(emptyR2Target(credentials, parseTarget(''), {
      listObjects: async () => objectList(['file.json']),
      confirm: async () => { throw new Error('prompt failed'); },
      deleteObject: async () => assert.fail('must not delete'),
    }), /prompt failed/);
  });

  it('deletes only the displayed snapshot and reports partial failures', async () => {
    let lists = 0;
    const removed = [];
    let confirmed = false;
    const result = await emptyR2Target(credentials, parseTarget(''), {
      listObjects: async () => { lists++; return objectList(['a.json', 'b.json', 'c.txt']); },
      confirm: async (plan) => {
        assert.deepEqual(plan.keys, ['a.json', 'b.json', 'c.txt']);
        assert.throws(() => plan.keys.push('unconfirmed.json'));
        confirmed = true;
        return true;
      },
      deleteObject: async (_, key) => {
        assert.equal(confirmed, true);
        if (key === 'b.json') throw new Error('HTTP 403');
        removed.push(key);
      },
    });
    assert.equal(lists, 1);
    assert.deepEqual(removed, ['a.json', 'c.txt']);
    assert.deepEqual(result.deleted, removed);
    assert.deepEqual(result.failed, [{ key: 'b.json', error: 'HTTP 403' }]);
  });

  it('lists escaped keys and confirms only EMPTY; refusal and EOF cancel', async () => {
    const plan = { bucket: credentials.bucket, keys: ['folder/file\nname.json'] };
    for (const answer of ['EMPTY', 'DELETE', 'yes', '', null]) {
      const streams = confirmationStreams(answer);
      assert.equal(await confirmR2EmptyPlan(plan, streams), answer === 'EMPTY');
      assert.ok(streams.text().includes('"folder/file\\nname.json"'));
      assert.ok(streams.text().indexOf('folder/file') < streams.text().indexOf('Type EMPTY'));
      streams.input.destroy();
      streams.output.destroy();
    }
  });

  it('shows the plan but refuses non-interactive deletion', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let text = '';
    output.on('data', (chunk) => { text += chunk; });
    await assert.rejects(confirmR2EmptyPlan({ bucket: credentials.bucket, keys: ['file.json'] }, { input, output }), /interactive terminal/);
    assert.match(text, /file.json/);
    input.destroy(); output.destroy();
  });

  it('sends signed DELETE for an exact encoded key and reports HTTP errors', async () => {
    const options = {
      endpointBaseUrl: 'https://r2.test',
      now: new Date('2026-01-01T00:00:00Z'),
      fetchImpl: async (url, request) => {
        assert.equal(url, 'https://r2.test/example-bucket/folder/%20file%2B%23%25.json%20');
        assert.equal(request.method, 'DELETE');
        assert.match(request.headers.Authorization, /^AWS4-HMAC-SHA256 /);
        assert.doesNotMatch(request.headers.Authorization, /test-secret/);
        return { ok: true, status: 204 };
      },
    };
    const result = await deleteR2Object(credentials, 'folder/ file+#%.json ', options);
    assert.equal(result.ok, true);
    await assert.rejects(deleteR2Object(credentials, 'a', {
      ...options, fetchImpl: async () => ({ ok: false, status: 403 }),
    }), /HTTP 403/);
    await assert.rejects(deleteR2Object(credentials, '', options), /object key is required/);
    await assert.rejects(deleteR2Object(credentials, 'folder/../other.json', options), /dot path segments/);
  });

  it('lists every page before planning and rejects incomplete pagination', async () => {
    let pages = 0;
    const listObjects = (creds, opts) => listR2Objects(creds, {
      ...opts, endpointBaseUrl: 'https://r2.test',
      fetchImpl: async (url) => {
        pages++;
        if (pages === 2) assert.match(url, /continuation-token=page2/);
        const xml = pages === 1
          ? '<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>page2</NextContinuationToken><Contents><Key>a.json</Key></Contents></ListBucketResult>'
          : '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>b%2B.json</Key></Contents></ListBucketResult>';
        return { ok: true, text: async () => xml };
      },
    });
    const plan = await planR2Empty(credentials, parseTarget(''), { listObjects });
    assert.deepEqual(plan.keys, ['a.json', 'b+.json']);
    assert.equal(pages, 2);
    for (const token of ['', '<NextContinuationToken>same</NextContinuationToken>']) {
      await assert.rejects(listR2Objects(credentials, {
        endpointBaseUrl: 'https://r2.test',
        fetchImpl: async () => ({ ok: true, text: async () => `<ListBucketResult><IsTruncated>true</IsTruncated>${token}</ListBucketResult>` }),
      }), /Incomplete R2 listing/);
    }
  });
});
