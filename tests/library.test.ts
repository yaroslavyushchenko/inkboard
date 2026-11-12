// SQLite library storage, binary BLOB asset deduplication, and legacy migration tests.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { Library } from '../src/main/library.ts'

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const PIXEL_DATA_URL = `data:image/png;base64,${PIXEL_PNG.toString('base64')}`
const PIXEL_HASH = createHash('sha256').update(PIXEL_PNG).digest('hex')

function sampleBoardBytes(withImage = false): Uint8Array {
  const doc = {
    format: 'inkboard',
    version: 6,
    background: 'dots',
    camera: { x: 0, y: 0, zoom: 1 },
    assets: withImage ? { img1: PIXEL_DATA_URL } : {},
    items: withImage
      ? [{ type: 'image', id: 'i1', z: 1, asset: 'img1', x: 10, y: 20, w: 100, h: 100 }]
      : [{ type: 'stroke', id: 's1', z: 1, tool: 'pen', color: '#1e1e1e', size: 4, pressure: false, pts: [0, 0, 0.5, 10, 10, 0.5] }]
  }
  return new Uint8Array(Buffer.from(JSON.stringify(doc), 'utf8'))
}

test('stores boards in SQLite and extracts images as raw binary BLOBs without base64', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inkboard-sqlite-'))
  try {
    const lib = new Library(dir)
    await lib.init()

    const created = await lib.create('Geometry notes', sampleBoardBytes(true))
    assert.equal(created.title, 'Geometry notes')
    assert.equal(created.kind, 'draft')

    const thumbBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])
    await lib.save(created.id, sampleBoardBytes(true), thumbBytes)

    // Inspect the raw SQLite tables directly to verify zero base64 in boards.data and raw BLOB in assets.
    const db = new DatabaseSync(join(dir, 'library.sqlite'), { readOnly: true })
    const boardRow = db.prepare('SELECT data, thumb FROM boards WHERE id = ?').get(created.id) as {
      data: string
      thumb: Uint8Array
    }
    assert.ok(!boardRow.data.includes('base64'), 'boards.data must not contain base64 strings')
    assert.ok(boardRow.data.includes(`asset:${PIXEL_HASH}`), 'boards.data should reference the asset by SHA-256 hash')
    assert.deepEqual(new Uint8Array(boardRow.thumb), thumbBytes)

    const assetRow = db.prepare('SELECT mime, bytes FROM assets WHERE hash = ?').get(PIXEL_HASH) as {
      mime: string
      bytes: Uint8Array
    }
    assert.equal(assetRow.mime, 'image/png')
    assert.deepEqual(Buffer.from(assetRow.bytes), PIXEL_PNG)
    db.close()

    // Loading the board rehydrates the image data URL for the renderer.
    const loaded = JSON.parse(Buffer.from(await lib.load(created.id)).toString('utf8'))
    assert.equal(loaded.assets.img1, PIXEL_DATA_URL)

    // Duplicating shares the same binary asset row; purging both boards garbage-collects the asset.
    const copy = await lib.duplicate(created.id)
    await lib.purge(created.id)
    const dbAfterFirstPurge = new DatabaseSync(join(dir, 'library.sqlite'), { readOnly: true })
    assert.equal((dbAfterFirstPurge.prepare('SELECT COUNT(*) AS c FROM assets').get() as { c: number }).c, 1)
    dbAfterFirstPurge.close()

    await lib.purge(copy.id)
    const dbAfterSecondPurge = new DatabaseSync(join(dir, 'library.sqlite'), { readOnly: true })
    assert.equal((dbAfterSecondPurge.prepare('SELECT COUNT(*) AS c FROM assets').get() as { c: number }).c, 0)
    dbAfterSecondPurge.close()

    lib.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('migrates legacy gzipped .inkboard library and moves the old files into legacy-0.6', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inkboard-migrate-'))
  try {
    await mkdir(join(dir, 'boards'), { recursive: true })
    await mkdir(join(dir, 'thumbs'), { recursive: true })
    await mkdir(join(dir, 'templates'), { recursive: true })

    // Create a legacy gzipped board with an inline base64 image + a legacy template + index.json.
    const gzippedBoard = gzipSync(Buffer.from(sampleBoardBytes(true)))
    const thumb = Buffer.from([10, 20, 30, 40])
    await writeFile(join(dir, 'boards', 'legacy-1.inkboard'), gzippedBoard)
    await writeFile(join(dir, 'thumbs', 'legacy-1.webp'), thumb)
    await writeFile(join(dir, 'templates', 'tpl-1.inkboard'), gzippedBoard)

    const legacyIndex = {
      version: 1,
      boards: [
        {
          id: 'legacy-1',
          title: 'Old Gzip Board',
          kind: 'draft',
          createdAt: 1000,
          updatedAt: 2000,
          openedAt: 3000,
          pinned: true,
          tagIds: ['tag-1']
        }
      ],
      tags: [{ id: 'tag-1', name: 'Math', color: '#1971c2' }],
      templates: [{ id: 'tpl-1', name: 'Coordinate Grid', createdAt: 1500 }],
      lastOpenedId: 'legacy-1',
      backupDir: null
    }
    await writeFile(join(dir, 'index.json'), JSON.stringify(legacyIndex))

    const lib = new Library(dir)
    await lib.init()

    // Old files are moved aside, never deleted.
    assert.equal(existsSync(join(dir, 'index.json')), false)
    assert.equal(existsSync(join(dir, 'boards')), false)
    assert.equal(existsSync(join(dir, 'legacy-0.6', 'index.json')), true)
    assert.equal(existsSync(join(dir, 'legacy-0.6', 'boards', 'legacy-1.inkboard')), true)
    assert.equal(existsSync(join(dir, 'legacy-0.6', 'thumbs', 'legacy-1.webp')), true)
    assert.equal(existsSync(join(dir, 'legacy-0.6', 'templates', 'tpl-1.inkboard')), true)
    assert.equal(existsSync(join(dir, 'library.sqlite')), true)

    const state = await lib.list()
    assert.equal(state.boards.length, 1)
    assert.equal(state.boards[0].id, 'legacy-1')
    assert.equal(state.boards[0].title, 'Old Gzip Board')
    assert.equal(state.boards[0].pinned, true)
    assert.deepEqual(state.boards[0].tagIds, ['tag-1'])
    assert.equal(state.lastOpenedId, 'legacy-1')
    assert.equal(state.templates.length, 1)
    assert.equal(state.templates[0].name, 'Coordinate Grid')

    const loaded = JSON.parse(Buffer.from(await lib.load('legacy-1')).toString('utf8'))
    assert.equal(loaded.assets.img1, PIXEL_DATA_URL)
    assert.deepEqual(await lib.thumb('legacy-1'), new Uint8Array(thumb))

    lib.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('exports standalone .inkboard on request and imports both plain JSON and legacy gzip files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inkboard-export-'))
  try {
    const lib = new Library(dir)
    await lib.init()

    const b = await lib.create('Physics', sampleBoardBytes(true))
    const exportPath = join(dir, 'Physics.inkboard')
    await lib.saveAsFile(b.id, exportPath, sampleBoardBytes(true))

    const exportedRaw = await readFile(exportPath)
    // Exported file is plain UTF-8 JSON (not gzipped).
    assert.equal(exportedRaw[0], '{'.charCodeAt(0))
    // Opening the exported file, unchanged, opens the same board instead of a copy.
    assert.equal((await lib.importFile(exportPath)).id, b.id)

    // Importing a legacy gzipped file converts it into SQLite.
    const legacyFile = join(dir, 'LegacyArchive.inkboard')
    await writeFile(legacyFile, gzipSync(Buffer.from(sampleBoardBytes(true))))
    const imported = await lib.importFile(legacyFile)
    assert.equal(imported.title, 'LegacyArchive')
    assert.equal(imported.kind, 'draft')

    const loaded = JSON.parse(Buffer.from(await lib.load(imported.id)).toString('utf8'))
    assert.equal(loaded.assets.img1, PIXEL_DATA_URL)

    lib.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('opening the same file twice opens one board; a changed file is imported again', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inkboard-dedupe-'))
  try {
    const lib = new Library(dir)
    await lib.init()
    const file = join(dir, 'Lesson.inkboard')
    await writeFile(file, sampleBoardBytes())
    const first = await lib.importFile(file)
    assert.equal((await lib.importFile(file)).id, first.id)

    // In "Recently deleted": opening the file brings it back.
    await lib.remove(first.id)
    const again = await lib.importFile(file)
    assert.equal(again.id, first.id)
    assert.equal(again.deletedAt, undefined)

    // The file changed on disk since: import it as a new board.
    await writeFile(file, sampleBoardBytes(true))
    await utimes(file, new Date(), new Date(Date.now() + 60_000))
    assert.notEqual((await lib.importFile(file)).id, first.id)
    assert.equal((await lib.list()).boards.length, 2)
    lib.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('migration keeps unreadable boards on disk and a re-run never overwrites migrated rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inkboard-migrate-safe-'))
  try {
    await mkdir(join(dir, 'boards'), { recursive: true })
    await writeFile(join(dir, 'boards', 'good.inkboard'), gzipSync(Buffer.from(sampleBoardBytes())))
    await writeFile(join(dir, 'boards', 'broken.inkboard'), Buffer.from('not a board'))
    const index = {
      version: 1,
      boards: [
        { id: 'good', title: 'Good', kind: 'draft', createdAt: 1, updatedAt: 2, openedAt: 3, tagIds: [] },
        { id: 'broken', title: 'Broken', kind: 'draft', createdAt: 1, updatedAt: 2, openedAt: 3, tagIds: [] }
      ],
      tags: [],
      templates: [],
      lastOpenedId: null,
      backupDir: null
    }
    await writeFile(join(dir, 'index.json'), JSON.stringify(index))

    let lib = new Library(dir)
    await lib.init()
    assert.deepEqual((await lib.list()).boards.map((b) => b.title), ['Good'])
    assert.equal(existsSync(join(dir, 'legacy-0.6', 'boards', 'broken.inkboard')), true)
    lib.close()

    // Simulate a crash before the old files were moved: boards/ is back without index.json.
    await rename(join(dir, 'legacy-0.6', 'boards'), join(dir, 'boards'))
    lib = new Library(dir)
    await lib.init()
    const boards = (await lib.list()).boards
    assert.deepEqual(boards.map((b) => b.title), ['Good'], 'the migrated title must not be replaced by "Board"')
    assert.equal(boards[0].createdAt, 1)
    assert.equal(existsSync(join(dir, 'boards')), false)
    lib.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('schema version is recorded and a newer library is refused', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inkboard-schema-'))
  try {
    const lib = new Library(dir)
    await lib.init()
    lib.close()
    const db = new DatabaseSync(join(dir, 'library.sqlite'))
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 1)
    db.exec('PRAGMA user_version = 99')
    db.close()
    await assert.rejects(new Library(dir).init(), /newer version/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
