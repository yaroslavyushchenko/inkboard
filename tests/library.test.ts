// SQLite library storage, binary BLOB asset deduplication, and legacy migration tests.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

test('migrates legacy gzipped .inkboard library and removes old folders', async () => {
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

    // Old file-based library folders and index.json should be removed after migration.
    assert.equal(existsSync(join(dir, 'index.json')), false)
    assert.equal(existsSync(join(dir, 'boards')), false)
    assert.equal(existsSync(join(dir, 'thumbs')), false)
    assert.equal(existsSync(join(dir, 'templates')), false)
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
    // Exported file is plain UTF-8 JSON (not gzipped) and has no .bak littering the folder.
    assert.equal(exportedRaw[0], '{'.charCodeAt(0))
    assert.equal(existsSync(`${exportPath}.bak`), false)

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
