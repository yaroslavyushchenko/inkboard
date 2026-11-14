import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { asset, assetSize, detectOs, LANGUAGES, pagePath, RELEASES, rememberLanguage, useRelease, type Os } from './siteData'
import { downloadNotes, messages, pageInfo, type SiteLanguage } from './messages'
import { Count, useReveal } from './reveal'

const examples = [
  {
    image: 'formulas', tab: 'ex.t0', title: 'ex.h0', caption: 'ex.c0',
    uk: "Формули з клавіатури формул: парабола з обмеженням по x, функція g(x) = √(x + 4) і половина кола x² + y² = 9, обмежена по y, на одній площині; поруч 3/4 + 1/2 з відповіддю 1,25",
    en: "Formulas from the math keypad: a parabola limited in x, the function g(x) = √(x + 4) and half of the circle x² + y² = 9, limited in y, on one plane; beside them 3/4 + 1/2 with the answer 1.25"
  },
  {
    image: 'geometry', tab: 'ex.t1', title: 'ex.h1', caption: 'ex.c1',
    uk: "Побудова рівностороннього трикутника: дуги циркулем, кут 60° на транспортирі",
    en: "Constructing an equilateral triangle: compass arcs and a 60° angle on the protractor"
  },
  {
    image: 'graphs', tab: 'ex.t2', title: 'ex.h2', caption: 'ex.c2',
    uk: "Координатна площина з параболою y = x² − 2 і прямою y = x/2 + 1 та точками їх перетину",
    en: "A coordinate plane with the parabola y = x² − 2, the line y = x/2 + 1 and their intersection points"
  },
  {
    image: 'solids', tab: 'ex.t3', title: 'ex.h3', caption: 'ex.c3',
    uk: "Куб, призма, піраміда, циліндр, конус, куля і шестикутна піраміда з пунктирними невидимими ребрами",
    en: "Cube, prism, pyramid, cylinder, cone, sphere and a hexagonal pyramid with hidden edges dashed"
  },
  {
    image: 'text', tab: 'ex.t4', title: 'ex.h4', caption: 'ex.c4',
    uk: "Задача на теорему косинусів: «Дано», «Знайти», «Розв’язання» різними кольорами, відповідь виділено маркером",
    en: "A law of cosines problem: Given, Find and Solution in different colours, the answer highlighted"
  },
  {
    image: 'home', tab: 'ex.t5', title: 'ex.h5', caption: 'ex.c5',
    uk: "Екран «Усі дошки»: прев’ю дощок, теги предметів і тем, закріплені дошки, пошук",
    en: "The All boards screen: board previews, subject and topic tags, pinned boards, search"
  },
  {
    image: 'chalkboard', tab: 'ex.t6', title: 'ex.h6', caption: 'ex.c6',
    uk: "Зелена крейдова дошка з параболою, прямою й точками їх перетину в Inkboard",
    en: "A green chalkboard with a parabola, a line and their intersection points in Inkboard"
  }
] as const

const exampleScrollStyle = { '--n': examples.length } as CSSProperties
const stackedExamples = '(max-width: 960px), (max-height: 600px)'
const assetOf = { win: 'exe', mac: 'dmg', linux: 'appimage' } as const
const extOf = { win: '.exe', mac: '.dmg', linux: '.AppImage' }

function useSegmentIndicator(ref: React.RefObject<HTMLDivElement | null>, selection: string | number, lang: SiteLanguage) {
  useLayoutEffect(() => {
    const segment = ref.current
    const knob = segment?.querySelector<HTMLElement>('.knob')
    const button = segment?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!segment || !knob || !button) return
    const position = () => {
      knob.style.width = `${button.offsetWidth}px`
      knob.style.transform = `translateX(${button.offsetLeft}px)`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(segment)
    observer.observe(button)
    return () => observer.disconnect()
  }, [ref, selection, lang])
}

/** The page for one language. Prerendered to HTML at build time (server.tsx), then hydrated. */
export function Site({ lang }: { lang: SiteLanguage }) {
  // The visitor's system is only known in the browser: the prerendered page starts without it.
  const [visitorOs, setVisitorOs] = useState<Os | null>(null)
  const [os, setOs] = useState<Os>('win')
  const [scrolled, setScrolled] = useState(false)
  const [activeExample, setActiveExample] = useState(0)
  const exampleSection = useRef<HTMLDivElement>(null)
  const exampleTabs = useRef<HTMLDivElement>(null)
  const exampleProgress = useRef<HTMLElement>(null)
  const osTabs = useRef<HTMLDivElement>(null)
  const { release, assets } = useRelease()
  const info = pageInfo[lang]
  const t = (key: keyof typeof messages.en) => messages[lang][key]
  const rich = (key: keyof typeof messages.en) => ({ __html: t(key) })
  const primaryAsset = visitorOs ? assets[assetOf[visitorOs]] : undefined
  const downloadLabel = t('hero.download') + (visitorOs ? ' ' + info[visitorOs] : '')
  const downloadMeta = visitorOs && release
    ? [release.tag_name, extOf[visitorOs], assetSize(primaryAsset)].filter(Boolean).join(' · ')
    : ''

  useReveal()
  useSegmentIndicator(exampleTabs, activeExample, lang)
  useSegmentIndicator(osTabs, os, lang)
  useEffect(() => {
    const detected = detectOs()
    setVisitorOs(detected)
    if (detected) setOs(detected)
  }, [])

  const scrollSpan = (section: HTMLElement) => section.offsetHeight - (innerHeight - 64)
  useEffect(() => {
    const stacked = matchMedia(stackedExamples)
    let frame = 0
    const update = () => {
      setScrolled(scrollY > 8)
      const section = exampleSection.current
      if (!section || stacked.matches) return
      const progress = Math.min(0.9999, Math.max(0, -section.getBoundingClientRect().top / scrollSpan(section)))
      const position = progress * examples.length
      const index = Math.floor(position)
      setActiveExample(index)
      exampleProgress.current?.style.setProperty('--p', (position - index).toFixed(3))
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    addEventListener('scroll', schedule, { passive: true })
    addEventListener('resize', schedule)
    stacked.addEventListener('change', schedule)
    return () => {
      cancelAnimationFrame(frame)
      removeEventListener('scroll', schedule)
      removeEventListener('resize', schedule)
      stacked.removeEventListener('change', schedule)
    }
  }, [])

  function selectExample(index: number) {
    const section = exampleSection.current
    if (!section) return
    const top = section.getBoundingClientRect().top + scrollY - 64 + ((index + 0.35) / examples.length) * scrollSpan(section)
    scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  return (
    <>
      <header className={scrolled ? 'scrolled' : undefined}>
        <div className="wrap bar">
          <a className="brand" href="#top"><img src={asset('img/icon.png')} alt="" />Inkboard</a>
          <nav>
            <a className="hide-sm" href="#examples">{t('nav.examples')}</a>
            <a className="hide-sm" href="#features">{t('nav.features')}</a>
            <a className="hide-sm" href="https://github.com/yaroslavyushchenko/inkboard">GitHub</a>
            <a className="nav-web hide-sm" href={asset('app/')}>{t('nav.web')}</a>
            <a className="nav-cta" href="#download">{t('nav.download')}</a>
            <div className="lang" role="group" aria-label="Мова / Language">
              <span className="knob" aria-hidden="true"></span>
              {LANGUAGES.map((code) => (
                <a key={code} href={pagePath(code)} hrefLang={code} lang={code} aria-current={code === lang ? 'page' : undefined} onClick={() => rememberLanguage(code)}>
                  {code === 'uk' ? 'УКР' : 'EN'}
                </a>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <main id="top">
        <div className="hero">
          <div className="wrap">
            <a className="pill rv in" href="https://github.com/yaroslavyushchenko/inkboard"><b>{t('hero.pill.b')}</b><span>{t('hero.pill')}</span></a>
            <h1>{t('hero.title')}{' '}{t('hero.highlight').split(' ').map((word, index) => (
              <Fragment key={word}>
                {index > 0 && ' '}
                <span className="scribble" style={{ '--d': (0.5 + index * 0.35) + 's' } as CSSProperties}>
                  {word}<svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M3 14C60 6 140 4 200 7s70 4 97 1"/></svg>
                </span>
              </Fragment>
            ))}</h1>
            <p className="lead">{t('hero.lead')}</p>
            <div className="cta">
              <div className="cta-buttons">
              <a className="btn primary" href={primaryAsset?.browser_download_url ?? "#download"}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>
                <span className="p-label">{downloadLabel}</span>
                <small className="p-meta">{downloadMeta}</small>
              </a>
              <a className="btn ghost" href={asset('app/')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z"/></svg>
                <span className="p-label">{t('web.open')}</span>
              </a>
              </div>
              <div className="platforms"><span>{t('hero.for')}</span><a href="#download" onClick={() => setOs('win')}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.5l7.5-1v7H3zM11.5 4.4L21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.4z"/></svg>Windows</a><a href="#download" onClick={() => setOs('mac')}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.2-.9-1.7 0-3.2 1-4.1 2.4-1.8 3.1-.5 7.6 1.3 10.1.8 1.2 1.8 2.6 3.1 2.5 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.7-4.1zM14 5.3c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg>macOS</a><a href="#download" onClick={() => setOs('linux')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c-2.2 0-3.5 1.8-3.5 4.5 0 1.6.4 2.6-.8 4.4C6.4 13.8 5 15.6 5.5 18c.4 1.8 2.6 2.6 6.5 2.6s6.1-.8 6.5-2.6c.5-2.4-.9-4.2-2.2-6.1-1.2-1.8-.8-2.8-.8-4.4C15.5 4.8 14.2 3 12 3z"/><path d="M10.3 8h.01M13.7 8h.01M11 10.2l1 .8 1-.8"/></svg>Linux</a></div>
              <p className="os-note" dangerouslySetInnerHTML={{ __html: downloadNotes[lang][visitorOs ?? 'none'] }} />
            </div>
            <div className="stage">
              <div className="window">
                <picture>
                  <source media="(prefers-color-scheme: dark)" srcSet={asset(`img/hero-dark-${lang}.webp`)} />
                  <img src={asset(`img/hero-${lang}.webp`)} width={2000} height={1250} fetchPriority="high" alt={info.heroAlt} />
                </picture>
              </div>
            </div>
          </div>
        </div>

        <section id="examples">
          <div className="ex-scroll" ref={exampleSection} style={exampleScrollStyle}>
          <div className="ex-sticky">
          <div className="wrap">
            <div className="ex-head">
              <div className="rv">
                <p className="eyebrow">{t('ex.kicker')}</p>
                <h2>{t('ex.title')}</h2>
              </div>
              <div className="seg rv d1" id="ex-tabs" role="tablist" aria-label={info.examples} ref={exampleTabs}>
                <span className="knob" aria-hidden="true"><i ref={exampleProgress} /></span>
                {examples.map(({ image, tab }, index) => (
                  <button key={image} type="button" role="tab" aria-selected={activeExample === index} onClick={() => selectExample(index)}>
                    <span>{t(tab)}</span>{index === 0 && <span className="new">{t('ex.new')}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="track rv d2">
              {examples.map(({ image, uk, en, title, caption }, index) => (
                <figure key={image} className={activeExample === index ? 'cur' : undefined}>
                  <div className="frame">
                    <picture>
                      <source media="(prefers-color-scheme: dark)" srcSet={asset(`img/ex-${image}-dark-${lang}.webp`)} />
                      <img src={asset(`img/ex-${image}-${lang}.webp`)} width={2000} height={1250} loading="lazy" alt={lang === 'uk' ? uk : en} />
                    </picture>
                  </div>
                  <figcaption>
                    <h3>{t(title)}</h3>
                    <p>{t(caption)}</p>
                  </figcaption>
                </figure>
              ))}

            </div>
          </div>
          </div>
          </div>
        </section>

        <section id="features">
          <div className="wrap">
            <div className="rv">
              <p className="eyebrow">{t('f.kicker')}</p>
              <h2>{t('f.title')}</h2>
              <p className="sub">{t('f.sub')}</p>
            </div>
            <div className="bento">
              <div className="tile wide rv">
                <div className="art"><svg viewBox="0 0 400 120" aria-hidden="true">
                  <path className="draw" pathLength="1" stroke="var(--text)" strokeWidth="6" d="M10 86c26-50 52-66 66-40s-8 52 18 46 34-70 64-72 18 64 46 62 30-44 54-46 22 40 46 36 36-30 66-38"/>
                  <path className="draw" pathLength="1" stroke="var(--accent)" strokeWidth="3" style={{ transitionDelay: '.6s' }} d="M30 108c80-8 220-8 340-14"/>
                </svg></div>
                <h3>{t('f.ink.t')}</h3>
                <p>{t('f.ink.d')}</p>
              </div>
              <div className="tile rv d1">
                <div className="art"><svg viewBox="0 0 160 120" aria-hidden="true">
                  <rect className="draw" pathLength="1" x="20" y="34" width="120" height="56" rx="12" stroke="var(--text)" strokeWidth="3"/>
                  <circle className="draw" pathLength="1" cx="44" cy="62" r="8" stroke="var(--accent)" strokeWidth="3" style={{ transitionDelay: '.4s' }}/>
                  <circle className="draw" pathLength="1" cx="72" cy="62" r="8" stroke="var(--accent)" strokeWidth="3" style={{ transitionDelay: '.5s' }}/>
                  <path className="draw" pathLength="1" d="M96 52h28M96 72h18" stroke="var(--faint)" strokeWidth="3" style={{ transitionDelay: '.6s' }}/>
                </svg></div>
                <h3>{t('f.wacom.t')}</h3>
                <p>{t('f.wacom.d')}</p>
              </div>
              <div className="tile wide rv">
                <div className="art"><div className="fx"><span className="fr"><i>3</i><i>4</i></span>+<span className="fr"><i>1</i><i>2</i></span><b>= <span>{t('f.fx.ans')}</span></b></div></div>
                <h3>{t('f.fx.t')}</h3>
                <p>{t('f.fx.d')}</p>
              </div>
              <div className="tile rv">
                <div className="art"><div className="tpl" dangerouslySetInnerHTML={rich('f.tpl.art')} /></div>
                <h3>{t('f.tpl.t')}</h3>
                <p>{t('f.tpl.d')}</p>
              </div>
              <div className="tile rv d1">
                <div className="art"><div className="keys"><span className="key">Ctrl</span>+<span className="key k2">V</span></div></div>
                <h3>{t('f.img.t')}</h3>
                <p>{t('f.img.d')}</p>
              </div>
              <div className="tile wide rv d2">
                <div className="art"><svg viewBox="0 0 160 120" aria-hidden="true">
                  <path className="ants" d="M28 70c-6-34 30-52 62-46s48 30 38 52-48 30-72 22-24-10-28-28z"/>
                  <path className="draw" pathLength="1" d="M58 66l16 14 28-34" stroke="var(--text)" strokeWidth="4"/>
                </svg></div>
                <h3>{t('f.select.t')}</h3>
                <p>{t('f.select.d')}</p>
              </div>
              <div className="tile rv">
                <div className="art"><div className="langs"><span>Аа</span><span>Aa</span></div></div>
                <h3>{t('f.lang.t')}</h3>
                <p>{t('f.lang.d')}</p>
              </div>
              <div className="tile wide rv d1">
                <div className="art"><svg viewBox="0 0 400 120" aria-hidden="true">
                  <rect className="draw" pathLength="1" x="40" y="22" width="110" height="76" rx="10" stroke="var(--text)" strokeWidth="3"/>
                  <path className="draw" pathLength="1" d="M60 46h70M60 62h50M60 78h60" stroke="var(--faint)" strokeWidth="3" style={{ transitionDelay: '.3s' }}/>
                  <path className="draw" pathLength="1" d="M170 60h60m0 0l-12-10m12 10l-12 10" stroke="var(--accent)" strokeWidth="3" style={{ transitionDelay: '.5s' }}/>
                  <rect className="draw" pathLength="1" x="250" y="14" width="74" height="92" rx="8" stroke="var(--accent)" strokeWidth="3" style={{ transitionDelay: '.7s' }}/>
                  <text x="287" y="68" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="20" fill="var(--accent)">PDF</text>
                </svg></div>
                <h3>{t('f.exp.t')}</h3>
                <p>{t('f.exp.d')}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="calm">
          <div className="wrap">
            <div className="rv">
              <p className="eyebrow">{t('s.kicker')}</p>
              <h2>{t('s.title')}</h2>
              <p className="sub">{t('s.sub')}</p>
            </div>
            <div className="stats">
              <div className="stat rv"><div className="num"><Count value={5} /><small>{t('s.u1')}</small></div><p>{t('s.d1')}</p></div>
              <div className="stat rv d1"><div className="num"><Count value={30} /><small>{t('s.u3')}</small></div><p>{t('s.d3')}</p></div>
              <div className="stat rv d2"><div className="num"><Count value={0} /></div><p>{t('s.d4')}</p></div>
            </div>
            <p className="plug rv">{t('s.plug')}</p>
          </div>
        </section>

        <section id="download">
          <div className="wrap">
            <div className="dl-head rv">
              <p className="eyebrow">{t('d.kicker')}</p>
              <h2>{t('d.title')}</h2>
              <p className="sub">{t('d.sub')}</p>
              <div className="seg os" role="tablist" aria-label={info.os} ref={osTabs}>
                <span className="knob" aria-hidden="true"></span>
                <button type="button" role="tab" aria-selected={os === 'win'} onClick={() => setOs('win')}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.5l7.5-1v7H3zM11.5 4.4L21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.4z"/></svg>Windows</button>
                <button type="button" role="tab" aria-selected={os === 'mac'} onClick={() => setOs('mac')}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.2-.9-1.7 0-3.2 1-4.1 2.4-1.8 3.1-.5 7.6 1.3 10.1.8 1.2 1.8 2.6 3.1 2.5 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.7-4.1zM14 5.3c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg>macOS</button>
                <button type="button" role="tab" aria-selected={os === 'linux'} onClick={() => setOs('linux')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c-2.2 0-3.5 1.8-3.5 4.5 0 1.6.4 2.6-.8 4.4C6.4 13.8 5 15.6 5.5 18c.4 1.8 2.6 2.6 6.5 2.6s6.1-.8 6.5-2.6c.5-2.4-.9-4.2-2.2-6.1-1.2-1.8-.8-2.8-.8-4.4C15.5 4.8 14.2 3 12 3z"/><path d="M10.3 8h.01M13.7 8h.01M11 10.2l1 .8 1-.8"/></svg>Linux</button>
              </div>
            </div>

            {/* Windows */}
            <div className="panel" hidden={os !== 'win'} role="tabpanel">
              <div className="get">
                <h3>Windows</h3>
                <p className="req">{t('d.win.req')}</p>
                <a className="btn" href={assets.exe?.browser_download_url ?? RELEASES}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg><span>{t('d.get.exe')}</span><small className="size">{assetSize(assets.exe, release?.tag_name)}</small></a>
                <details className="why">
                <summary>{t('why.q')}</summary>
                <div className="body">
                  <p>{t('why.p')}</p>
                  <ul>
                    <li dangerouslySetInnerHTML={rich('why.1')} />
                    <li>{t('why.2')}</li>
                    <li>{t('why.3')}</li>
                  </ul>
                </div>
              </details>
                <div className="upd"><span className="badge auto">{t('u.auto')}</span><br /><span>{t('u.win')}</span></div>
              </div>
              <div className="steps-card">
                <h4>{t('d.first')}</h4>
                <ol className="steps">
                  <li><div className="mock"><div className="ss"><b>{t('mk.ss')}</b><span className="ln"></span><span className="ln s"></span><u>{t('mk.more')}</u></div></div><span className="cap" dangerouslySetInnerHTML={rich('d.win.s1')} /></li>
                  <li><div className="mock"><div className="ss"><b>{t('mk.ss')}</b><span className="ln"></span><span className="mb hot">{t('mk.run')}</span></div></div><span className="cap" dangerouslySetInnerHTML={rich('d.win.s2')} /></li>
                </ol>
              </div>
            </div>

            {/* macOS */}
            <div className="panel" hidden={os !== 'mac'} role="tabpanel">
              <div className="get">
                <h3>macOS</h3>
                <p className="req">{t('d.mac.req')}</p>
                <a className="btn" href={assets.dmg?.browser_download_url ?? RELEASES}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg><span>{t('d.get.dmg')}</span><small className="size">{assetSize(assets.dmg, release?.tag_name)}</small></a>
                <details className="why">
                <summary>{t('why.q')}</summary>
                <div className="body">
                  <p>{t('why.p')}</p>
                  <ul>
                    <li dangerouslySetInnerHTML={rich('why.1')} />
                    <li>{t('why.2')}</li>
                    <li>{t('why.3')}</li>
                  </ul>
                </div>
              </details>
                <div className="upd"><span className="badge manual">{t('u.manual')}</span><br /><span>{t('u.mac')}</span></div>
              </div>
              <div className="steps-card">
                <h4>{t('d.first.mac')}</h4>
                <ol className="steps four">
                  <li><div className="mock"><div className="drag"><img src={asset('img/icon.png')} alt="" /><svg viewBox="0 0 50 44" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" aria-hidden="true"><path d="M3 9a4 4 0 0 1 4-4h11l5 5h20a4 4 0 0 1 4 4v23a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/></svg></div></div><span className="cap" dangerouslySetInnerHTML={rich('d.mac.s1')} /></li>
                  <li><div className="mock"><div className="dlg"><span className="ln"></span><span className="ln s"></span><div className="row2"><span className="mb hot">{t('mk.done')}</span><span className="mb">…</span></div></div></div><span className="cap" dangerouslySetInnerHTML={rich('d.mac.s2')} /></li>
                  <li><div className="mock"><div className="side"><div className="ln"></div><div className="hot">{t('mk.privacy')}</div><div className="ln s"></div></div></div><span className="cap" dangerouslySetInnerHTML={rich('d.mac.s3')} /></li>
                  <li><div className="mock"><div className="dlg"><span className="ln"></span><span className="ln s"></span><span className="mb hot">{t('mk.open')}</span></div></div><span className="cap" dangerouslySetInnerHTML={rich('d.mac.s4')} /></li>
                </ol>
              </div>
            </div>

            {/* Linux */}
            <div className="panel" hidden={os !== 'linux'} role="tabpanel">
              <div className="get">
                <h3>Linux</h3>
                <p className="req">{t('d.linux.req')}</p>
                <a className="btn" href={assets.appimage?.browser_download_url ?? RELEASES}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg><span>{t('d.get.appimage')}</span><small className="size">{assetSize(assets.appimage, release?.tag_name)}</small></a>
                <div className="alt"><a href={assets.deb?.browser_download_url ?? RELEASES}><b>{t('d.get.deb')}</b><span className="size">{assetSize(assets.deb)}</span></a><a href="https://snapcraft.io/inkboard"><b>{t('d.get.snap')}</b><span>{t('d.snap.note')}</span></a></div>
                <div className="upd"><span className="badge auto">{t('u.auto')}</span><br /><span>{t('u.linux')}</span></div>
              </div>
              <div className="steps-card">
                <h4>{t('d.first')}</h4>
                <ol className="steps">
                  <li><div className="mock"><div className="chk"><i></i><span>{t('mk.exec')}</span></div></div><span className="cap" dangerouslySetInnerHTML={rich('d.linux.s1')} /></li>
                  <li><div className="mock"><div className="file"><img src={asset('img/icon.png')} alt="" /><span>Inkboard.AppImage</span></div></div><span className="cap" dangerouslySetInnerHTML={rich('d.linux.s2')} /></li>
                </ol>
              </div>
            </div>
            <div className="web-card">
              <div className="web-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z"/></svg></div>
              <div className="web-text">
                <h3>{t('web.title')}</h3>
                <p>{t('web.text')}</p>
              </div>
              <a className="btn ghost" href={asset('app/')}>{t('web.open')}</a>
            </div>
            <p className="ver">{release && <><a href={release.html_url}>{info.latest}: {release.tag_name}</a>{' · '}{info.released} {new Date(release.published_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}</>}</p>
          </div>
        </section>

        <section className="final">
          <div className="wrap rv">
            <h2>{t('cta.title')}</h2>
            <div className="cta-buttons">
            <a className="btn primary" href={primaryAsset?.browser_download_url ?? "#download"}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>
              <span className="p-label">{downloadLabel}</span>
              <small className="p-meta">{downloadMeta}</small>
            </a>
            <a className="btn ghost" href={asset('app/')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z"/></svg>
              <span className="p-label">{t('web.open')}</span>
            </a>
            </div>
            <span className="note">{t('cta.hand')}</span>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>Inkboard · <span>{t('foot.license')}</span></span>
          <a href="https://github.com/yaroslavyushchenko/inkboard">{t('foot.code')}</a>
          <a href="https://github.com/yaroslavyushchenko/inkboard/issues">{t('foot.issues')}</a>
          <a href="https://github.com/yaroslavyushchenko/inkboard/releases">{t('foot.releases')}</a>
        </div>
      </footer>
    </>
  )
}
