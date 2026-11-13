import { useEffect, useRef, useState } from 'react'
import { messages, type SiteLanguage } from './messages'
import { asset } from './siteData'

export function BoardDemo({ lang }: { lang: SiteLanguage }) {
  const container = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [src] = useState(() => asset('demo/index.html?lang=' + lang))
  const [fullscreen, setFullscreen] = useState(false)
  const copy = messages[lang]

  function syncLanguage() {
    frame.current?.contentWindow?.postMessage({ type: 'inkboard-demo-language', lang }, location.origin)
  }

  useEffect(syncLanguage, [lang])
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === container.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  function toggleFullscreen() {
    const change = fullscreen ? document.exitFullscreen() : container.current?.requestFullscreen()
    void change?.catch(() => {})
  }

  return (
    <div className="stage" id="demo">
      <div className="window" ref={container}>
        <div className="demo-header">
          <div>
            <strong>{copy['demo.title']}</strong>
            <p>{copy['demo.hint']}</p>
          </div>
          {document.fullscreenEnabled && (
            <button type="button" onClick={toggleFullscreen}>
              {copy[fullscreen ? 'demo.collapse' : 'demo.expand']}
            </button>
          )}
        </div>
        <iframe
          ref={frame}
          className="demo-frame"
          src={src}
          title={copy['demo.title']}
          loading="lazy"
          onLoad={syncLanguage}
        />
      </div>
    </div>
  )
}
