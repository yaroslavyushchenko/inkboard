// The behaviour every board library store must have, whatever database is behind it
// (docs/ARCHITECTURE.md, "Storage"). Each store's test file runs this suite against its adapter.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BoardStoreApi } from '../src/shared/platform.ts'

const bytes = (...v: number[]) => new Uint8Array(v)

/** A small but real board file (stores may parse it, e.g. to keep images apart). `n` tells boards apart. */
function board(n: number): Uint8Array {
  const doc = {
    format: 'inkboard', version: 6, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {},
    items: [{ type: 'stroke', id: `s${n}`, z: 1, tool: 'pen', color: '#1e1e1e', size: 4, pressure: false, pts: [0, 0, 0.5, n, n, 0.5] }]
  }
  return new TextEncoder().encode(JSON.stringify(doc))
}

/** Which board(n) the bytes hold (compared by content: a store may re-encode the file). */
function boardNumber(data: Uint8Array): number {
  const doc = JSON.parse(new TextDecoder().decode(data)) as { items: { id: string }[] }
  return Number(doc.items[0].id.slice(1))
}

export function libraryContract(name: string, makeStore: () => Promise<BoardStoreApi> | BoardStoreApi): void {
  test(`${name}: a new board is listed, opened last and loads its bytes`, async () => {
    const store = await makeStore()
    const b = await store.create('Lesson 1', board(1))
    const state = await store.list()
    assert.deepEqual(state.boards.map((x) => x.title), ['Lesson 1'])
    assert.equal(state.lastOpenedId, b.id)
    assert.equal(b.kind, 'draft')
    assert.equal(boardNumber(await store.load(b.id)), 1)
  })

  test(`${name}: saving replaces the bytes and the thumbnail and bumps updatedAt`, async () => {
    const store = await makeStore()
    const b = await store.create('A', board(1))
    const r = await store.save(b.id, board(9), bytes(7))
    assert.equal(r.ok, true)
    assert.ok(r.updatedAt >= b.updatedAt)
    assert.equal(boardNumber(await store.load(b.id)), 9)
    assert.deepEqual([...((await store.thumb(b.id)) ?? [])], [7])
    // A save without a thumbnail keeps the old one.
    await store.save(b.id, board(8), null)
    assert.deepEqual([...((await store.thumb(b.id)) ?? [])], [7])
  })

  test(`${name}: rename, pin and tags`, async () => {
    const store = await makeStore()
    const b = await store.create('Old', board(1))
    assert.equal((await store.rename(b.id, '  New  ')).title, 'New')
    assert.equal((await store.rename(b.id, '   ')).title, 'New')
    await store.pin(b.id, true)
    const tag = await store.createTag('Algebra', '#e03131')
    await store.setTags(b.id, [tag.id])
    let entry = (await store.list()).boards[0]
    assert.equal(entry.pinned, true)
    assert.deepEqual(entry.tagIds, [tag.id])
    await store.updateTag(tag.id, { name: 'Geometry' })
    assert.equal((await store.list()).tags[0].name, 'Geometry')
    await store.deleteTag(tag.id)
    await store.pin(b.id, false)
    entry = (await store.list()).boards[0]
    assert.deepEqual(entry.tagIds, [])
    assert.ok(!entry.pinned)
  })

  test(`${name}: duplicate copies bytes, thumbnail and tags under a new id`, async () => {
    const store = await makeStore()
    const b = await store.create('Plan', board(4))
    await store.save(b.id, board(4), bytes(6))
    const tag = await store.createTag('T', '#000')
    await store.setTags(b.id, [tag.id])
    const copy = await store.duplicate(b.id)
    assert.notEqual(copy.id, b.id)
    assert.equal(copy.title, 'Plan (copy)')
    assert.deepEqual(copy.tagIds, [tag.id])
    assert.equal(boardNumber(await store.load(copy.id)), 4)
    assert.deepEqual([...((await store.thumb(copy.id)) ?? [])], [6])
  })

  test(`${name}: delete goes to the bin, restore brings it back, purge removes it for good`, async () => {
    const store = await makeStore()
    const b = await store.create('Temp', board(1))
    await store.setLastOpened(b.id)
    await store.remove(b.id)
    let state = await store.list()
    assert.ok(state.boards[0].deletedAt)
    assert.equal(state.lastOpenedId, null)
    await store.restore(b.id)
    assert.equal((await store.list()).boards[0].deletedAt, undefined)
    await store.purge(b.id)
    state = await store.list()
    assert.equal(state.boards.length, 0)
    await assert.rejects(store.load(b.id))
  })

  test(`${name}: unknown boards are an error, not a silent no-op`, async () => {
    const store = await makeStore()
    await assert.rejects(store.rename('nope', 'x'))
    await assert.rejects(store.save('nope', board(1), null))
  })

  test(`${name}: templates`, async () => {
    const store = await makeStore()
    const t = await store.saveTemplate(' Given / Find ', board(1), bytes(2))
    assert.equal(t.name, 'Given / Find')
    assert.equal(boardNumber(await store.loadTemplate(t.id)), 1)
    assert.deepEqual([...((await store.templateThumb(t.id)) ?? [])], [2])
    const replaced = await store.replaceTemplate(t.id, board(3), null)
    assert.ok(replaced?.updatedAt)
    assert.equal(boardNumber(await store.loadTemplate(t.id)), 3)
    assert.equal(await store.replaceTemplate('nope', board(1), null), null)
    await store.renameTemplate(t.id, 'Solution')
    assert.equal((await store.list()).templates[0].name, 'Solution')
    await store.deleteTemplate(t.id)
    assert.equal((await store.list()).templates.length, 0)
    await assert.rejects(store.loadTemplate(t.id))
  })
}
