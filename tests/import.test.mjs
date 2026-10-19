import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = new URL('../scripts/sync-wordpress.mjs', import.meta.url);
async function inTemporaryDirectory(callback) {
  const original = process.cwd();
  const fetch = globalThis.fetch;
  const directory = await mkdtemp(join(tmpdir(), 'bchu-import-'));
  try {
    process.chdir(directory);
    await callback();
  } finally {
    globalThis.fetch = fetch;
    process.chdir(original);
    await rm(directory, { recursive: true, force: true });
  }
}
test('imports all API pages and atomically writes a complete snapshot', async () => {
  await inTemporaryDirectory(async () => {
    const requested = [];
    globalThis.fetch = async (url) => {
      const page = Number(url.searchParams.get('page'));
      requested.push(page);
      const posts =
        page === 1
          ? Array.from({ length: 20 }, (_, id) => ({ id: id + 1 }))
          : [{ id: 21 }];
      return new Response(JSON.stringify(posts), {
        headers: { 'x-wp-total': '21', 'x-wp-totalpages': '2' },
      });
    };
    await import(`${script.href}?success`);
    const snapshot = JSON.parse(
      await readFile('.cache/wordpress.json', 'utf8'),
    );
    assert.equal(snapshot.posts.length, 21);
    assert.deepEqual(requested, [1, 2]);
    await assert.rejects(access('.cache/wordpress.tmp'));
  });
});
test('refuses to write an incomplete deployment when API pages overlap', async () => {
  await inTemporaryDirectory(async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify([{ id: 1 }]), {
        headers: { 'x-wp-total': '2', 'x-wp-totalpages': '2' },
      });
    await assert.rejects(
      import(`${script.href}?duplicate`),
      /Incomplete or duplicate/,
    );
    await assert.rejects(access('.cache/wordpress.json'));
  });
});
