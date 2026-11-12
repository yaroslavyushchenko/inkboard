import { useCallback, useEffect, useMemo, useState } from 'react'
import { TAG_COLORS, type BoardEntry, type Tag } from '../../../shared/library'
import { editor } from '../editor'
import { relativeTime, useT } from '../i18n'
import { platform } from '../platform'
import { useUI } from '../store'
import { ArrowLeftIcon, CheckIcon, DotsIcon, FolderIcon, PinIcon, PlusIcon, SearchIcon } from './icons'
import { Popover } from './Popover'

const lib = platform.library
const refresh = (): Promise<void> => editor.refreshLibrary()

function Thumb({ entry }: { entry: BoardEntry }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void editor.thumbUrl(entry).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [entry])
  return <div className="card-thumb">{url ? <img src={url} alt="" draggable={false} /> : <div className="card-thumb-empty" />}</div>
}

function TagPicker({ entry, tags, onClose }: { entry: BoardEntry; tags: Tag[]; onClose: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const toggle = async (id: string): Promise<void> => {
    const next = entry.tagIds.includes(id) ? entry.tagIds.filter((x) => x !== id) : [...entry.tagIds, id]
    await lib.setTags(entry.id, next)
    await refresh()
  }
  const add = async (): Promise<void> => {
    if (!name.trim()) return
    const tag = await lib.createTag(name, TAG_COLORS[tags.length % TAG_COLORS.length])
    await lib.setTags(entry.id, [...entry.tagIds, tag.id])
    setName('')
    await refresh()
  }
  return (
    <Popover onClose={onClose} className="card-popover tag-picker">
      <div className="popover-title">{t('card.tags')}</div>
      {tags.map((tag) => (
        <button key={tag.id} className="menu-item" onClick={() => void toggle(tag.id)}>
          <span className="tag-row">
            <span className="tag-dot" style={{ background: tag.color }} />
            {tag.name}
          </span>
          {entry.tagIds.includes(tag.id) && <CheckIcon width={16} height={16} />}
        </button>
      ))}
      <form
        className="tag-new"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <input value={name} placeholder={t('tags.placeholder')} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="text-btn" disabled={!name.trim()}>
          {t('tags.add')}
        </button>
      </form>
    </Popover>
  )
}

function ManageTags({ tags, onClose }: { tags: Tag[]; onClose: () => void }) {
  const t = useT()
  return (
    <Popover onClose={onClose} className="manage-tags">
      <div className="popover-title">{t('tags.manage')}</div>
      {tags.length === 0 && <div className="muted">{t('tags.none')}</div>}
      {tags.map((tag) => (
        <div key={tag.id} className="manage-tag-row">
          <input
            defaultValue={tag.name}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== tag.name) void lib.updateTag(tag.id, { name: e.target.value.trim() }).then(refresh)
            }}
          />
          <div className="tag-colors">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                className={`tag-color ${tag.color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => void lib.updateTag(tag.id, { color: c }).then(refresh)}
              />
            ))}
          </div>
          <button className="text-btn danger" title={t('tags.delete')} onClick={() => void lib.deleteTag(tag.id).then(refresh)}>
            ×
          </button>
        </div>
      ))}
    </Popover>
  )
}

function BoardCard({ entry, tags }: { entry: BoardEntry; tags: Tag[] }) {
  const t = useT()
  const lang = useUI((s) => s.lang)
  const [menu, setMenu] = useState<'actions' | 'tags' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(entry.title)
  const closeMenu = useCallback(() => setMenu(null), [])
  const deleted = !!entry.deletedAt
  const act = (fn: () => Promise<unknown>) => () => {
    setMenu(null)
    void fn().then(refresh)
  }
  const open = (): void => {
    if (!deleted && !entry.missing && !renaming) void editor.openBoard(entry.id)
  }
  const commitRename = (): void => {
    setRenaming(false)
    if (title.trim() && title.trim() !== entry.title) void editor.renameBoard(entry.id, title.trim())
  }
  const folder = entry.filePath?.split(/[\\/]/).slice(-2, -1)[0]
  return (
    <div className={`board-card ${deleted ? 'deleted' : ''} ${entry.missing ? 'missing' : ''}`}>
      <button className="card-open" onClick={open} disabled={deleted || entry.missing}>
        <Thumb entry={entry} />
      </button>
      <div className="card-body">
        {renaming ? (
          <input
            className="card-title-input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if ((e.code === 'Enter' || e.code === 'NumpadEnter')) commitRename()
              if (e.code === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <div className="card-title" title={entry.title} onClick={open}>
            {entry.pinned && <PinIcon width={14} height={14} className="card-pin" />}
            {entry.title}
          </div>
        )}
        <div className="card-meta">
          {deleted
            ? t('home.deletedWhen', { when: relativeTime(lang, entry.deletedAt!) })
            : t('home.edited', { when: relativeTime(lang, entry.updatedAt) })}
        </div>
        <div className="card-badges">
          {entry.missing ? (
            <span className="badge warn">{t('home.missing')}</span>
          ) : entry.kind === 'file' ? (
            <span className="badge" title={entry.filePath}>
              <FolderIcon width={13} height={13} /> {folder}
            </span>
          ) : (
            <span className="badge subtle">{t('home.inApp')}</span>
          )}
          {entry.tagIds.map((id) => {
            const tag = tags.find((x) => x.id === id)
            return tag ? (
              <span key={id} className="tag-pill" style={{ background: `${tag.color}22`, color: tag.color }}>
                {tag.name}
              </span>
            ) : null
          })}
        </div>
      </div>

      <div className="card-menu">
        <button data-popover-anchor className="icon-btn small" title={t('card.more')} onClick={() => setMenu(menu ? null : 'actions')}>
          <DotsIcon />
        </button>
        {menu === 'tags' && <TagPicker entry={entry} tags={tags} onClose={closeMenu} />}
        {menu === 'actions' && (
          <Popover onClose={closeMenu} className="card-popover">
            {deleted ? (
              <>
                <button className="menu-item" onClick={act(() => lib.restore(entry.id))}>
                  {t('card.restore')}
                </button>
                <button
                  className="menu-item danger"
                  onClick={() => {
                    setMenu(null)
                    if (window.confirm(t('card.confirmDeleteForever', { title: entry.title }))) void lib.purge(entry.id).then(refresh)
                  }}
                >
                  {t('card.deleteForever')}
                </button>
              </>
            ) : (
              <>
                {entry.missing ? (
                  <button className="menu-item" onClick={act(() => lib.locate(entry.id))}>
                    {t('card.locate')}
                  </button>
                ) : (
                  <button className="menu-item" onClick={() => (setMenu(null), open())}>
                    {t('card.open')}
                  </button>
                )}
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenu(null)
                    setTitle(entry.title)
                    setRenaming(true)
                  }}
                >
                  {t('card.rename')}
                </button>
                <button className="menu-item" onClick={act(() => lib.pin(entry.id, !entry.pinned))}>
                  {t(entry.pinned ? 'card.unpin' : 'card.pin')}
                </button>
                <button className="menu-item" onClick={() => setMenu('tags')}>
                  {t('card.tags')}…
                </button>
                {!entry.missing && (
                  <>
                    <button className="menu-item" onClick={act(() => lib.duplicate(entry.id))}>
                      {t('card.duplicate')}
                    </button>
                    <button className="menu-item" onClick={act(() => editor.saveAsFile(entry.id))}>
                      {t('card.saveAsFile')}
                    </button>
                  </>
                )}
                {entry.kind === 'file' && platform.capabilities.showInFolder && !entry.missing && (
                  <button className="menu-item" onClick={act(() => lib.showInFolder(entry.id))}>
                    {t('card.showInFolder')}
                  </button>
                )}
                <div className="menu-sep" />
                <button
                  className="menu-item danger"
                  title={entry.kind === 'file' ? t('card.removeFromListHint') : undefined}
                  onClick={act(() => editor.deleteBoard(entry.id))}
                >
                  {t(entry.kind === 'file' ? 'card.removeFromList' : 'card.delete')}
                </button>
              </>
            )}
          </Popover>
        )}
      </div>
    </div>
  )
}

/** "All boards" screen: thumbnails, search, tags, pinned, recently deleted. */
export function HomeScreen() {
  const t = useT()
  const { boards, tags } = useUI((s) => s.library)
  const current = useUI((s) => s.board)
  const appVersion = useUI((s) => s.appVersion)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [manage, setManage] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const closeManage = useCallback(() => setManage(false), [])

  useEffect(() => {
    void refresh()
  }, [])
  // Keep "Edited 5 min ago" fresh.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const { pinned, rest, deleted } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (b: BoardEntry): boolean =>
      (!q || b.title.toLowerCase().includes(q)) && (!tagFilter || b.tagIds.includes(tagFilter))
    const live = boards.filter((b) => !b.deletedAt && match(b)).sort((a, b) => b.updatedAt - a.updatedAt)
    return {
      pinned: live.filter((b) => b.pinned),
      rest: live.filter((b) => !b.pinned),
      deleted: boards.filter((b) => b.deletedAt && match(b)).sort((a, b) => b.deletedAt! - a.deletedAt!)
    }
  }, [boards, query, tagFilter])

  const canGoBack = current && boards.some((b) => b.id === current.id && !b.deletedAt)
  const nothing = pinned.length + rest.length === 0

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-title-row">
          {canGoBack && (
            <button className="icon-btn" title={t('home.back')} onClick={() => useUI.setState({ view: 'board' })}>
              <ArrowLeftIcon />
            </button>
          )}
          <h1>{t('home.title')}</h1>
          <span className="home-version">Inkboard {appVersion}</span>
        </div>
        <div className="home-actions">
          <label className="search">
            <SearchIcon width={18} height={18} />
            <input value={query} placeholder={t('home.search')} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="text-btn outline" onClick={() => void editor.openFile()}>
            <FolderIcon width={18} height={18} /> {t('home.openFile')}
          </button>
        </div>
      </header>

      <div className="tag-filter">
        <button className={`chip ${tagFilter === null ? 'active' : ''}`} onClick={() => setTagFilter(null)}>
          {t('home.allTags')}
        </button>
        {tags.map((tag) => (
          <button
            key={tag.id}
            className={`chip ${tagFilter === tag.id ? 'active' : ''}`}
            onClick={() => setTagFilter(tagFilter === tag.id ? null : tag.id)}
          >
            <span className="tag-dot" style={{ background: tag.color }} />
            {tag.name}
          </button>
        ))}
        <div className="manage-wrap">
          <button data-popover-anchor className="chip ghost" onClick={() => setManage((m) => !m)}>
            {t('tags.manage')}
          </button>
          {manage && <ManageTags tags={tags} onClose={closeManage} />}
        </div>
      </div>

      <div className="home-scroll">
        {pinned.length > 0 && (
          <section>
            <h2>{t('home.pinned')}</h2>
            <div className="card-grid">
              {pinned.map((b) => (
                <BoardCard key={b.id} entry={b} tags={tags} />
              ))}
            </div>
          </section>
        )}

        <section>
          {pinned.length > 0 && <h2>{t('home.boards')}</h2>}
          <div className="card-grid">
            {!query && !tagFilter && (
              <button className="new-board-card" onClick={() => void editor.newBoard()}>
                <PlusIcon width={36} height={36} />
                <span>{t('home.newBoard')}</span>
              </button>
            )}
            {rest.map((b) => (
              <BoardCard key={b.id} entry={b} tags={tags} />
            ))}
          </div>
          {nothing && (query || tagFilter) && <p className="muted">{t('home.noResults')}</p>}
        </section>

        {deleted.length > 0 && (
          <section className="deleted-section">
            <button className="section-toggle" onClick={() => setShowDeleted((v) => !v)}>
              <h2>
                {t('home.recentlyDeleted')} ({deleted.length})
              </h2>
              <span className={`chevron ${showDeleted ? 'open' : ''}`}>›</span>
            </button>
            {showDeleted && (
              <>
                <p className="muted">{t('home.deletedHint')}</p>
                <div className="card-grid">
                  {deleted.map((b) => (
                    <BoardCard key={b.id} entry={b} tags={tags} />
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
