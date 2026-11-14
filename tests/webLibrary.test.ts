// The browser's board library (IndexedDB) against the shared library contract. Run: npm test
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TRASH_DAYS } from '../src/shared/library.ts'
import { createIndexedDbStore, openLibraryDb } from '../src/renderer/src/web/library.ts'
import { libraryContract } from './libraryContract.ts'

let n = 0
// A fresh database for every test.
libraryContract('IndexedDB', () => createIndexedDbStore(`test-${++n}`))

test('IndexedDB: boards in the bin longer than TRASH_DAYS are purged on open', async () => {
  const name = `test-${++n}`
  const first = createIndexedDbStore(name)
  const old = await first.create('Old', new Uint8Array([1]))
  const fresh = await first.create('Fresh', new Uint8Array([2]))
  await first.remove(old.id)
  await first.remove(fresh.id)
  // Pretend the old one was deleted long ago.
  const db = await openLibraryDb(name)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite')
    const get = tx.objectStore('state').get('index')
    get.onsuccess = () => {
      const idx = get.result
      idx.boards.find((b: { id: string }) => b.id === old.id).deletedAt = Date.now() - (TRASH_DAYS + 1) * 86_400_000
      tx.objectStore('state').put(idx, 'index')
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  const reopened = createIndexedDbStore(name)
  assert.deepEqual((await reopened.list()).boards.map((b) => b.title), ['Fresh'])
})

test('IndexedDB: a failed change leaves the library as it was', async () => {
  const store = createIndexedDbStore(`test-${++n}`)
  const b = await store.create('Keep', new Uint8Array([1]))
  await assert.rejects(store.save('missing', new Uint8Array([9]), null))
  const state = await store.list()
  assert.deepEqual(state.boards.map((x) => x.id), [b.id])
  assert.deepEqual([...(await store.load(b.id))], [1])
})
