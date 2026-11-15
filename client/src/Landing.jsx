import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { landingCopy } from './landingCopy.js'
import './landing.css'

gsap.registerPlugin(ScrollTrigger)

const OrbitCanvas = lazy(() => import('./OrbitCanvas.jsx'))
const languageKey = 'aurahex-landing-language'

function getSavedLanguage() {
  try {
    return window.localStorage.getItem(languageKey) === 'en' ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

function MapLink({ className, children }) {
  return (
    <a className={className} href="/map">
      <span className="aura-link-label">
        <span className="aura-link-text">{children}</span>
        <span className="aura-link-text" aria-hidden="true">{children}</span>
      </span>
      <span className="aura-link-arrow" aria-hidden="true">↗</span>
    </a>
  )
}

export default function Landing() {
  const story = useRef(null)
  const frames = useRef({ progress: 0, render: null, rotate: null })
  const drag = useRef(null)
  const [hasRotated, setHasRotated] = useState(false)
  const [language, setLanguage] = useState(getSavedLanguage)
  const copy = landingCopy[language]
  const otherLanguage = language === 'es' ? 'en' : 'es'

  useLayoutEffect(() => {
    const previousLanguage = document.documentElement.lang
    document.documentElement.lang = language
    return () => { document.documentElement.lang = previousLanguage }
  }, [language])

  function switchLanguage() {
    setLanguage(otherLanguage)
    try {
      window.localStorage.setItem(languageKey, otherLanguage)
    } catch {
      // The selector still works when storage is unavailable.
    }
  }

  useLayoutEffect(() => {
    const motion = gsap.matchMedia(story.current)

    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const frame = frames.current
      const chapters = gsap.utils.toArray('.aura-chapter', story.current)

      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: story.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: .45,
          snap: {
            delay: .22,
            duration: .28,
            ease: 'power2.out',
            inertia: false,
            snapTo(progress, { start, end }) {
              const range = end - start
              const currentY = start + progress * range
              let closestY = currentY
              let closestDistance = Math.min(56, window.innerHeight * .07)

              for (const chapter of chapters) {
                const chapterY = chapter.getBoundingClientRect().top + window.scrollY
                const distance = Math.abs(chapterY - currentY)
                if (distance < closestDistance) {
                  closestY = chapterY
                  closestDistance = distance
                }
              }

              return gsap.utils.clamp(0, 1, (closestY - start) / range)
            },
          },
        },
      })
        .to(frame, { progress: 3, duration: 3.13, onUpdate: () => frame.render?.(frame.progress) }, 0)
        .to('.aura-grid', { opacity: 1, duration: .36 }, 1.83)
        .to('.aura-grid', { opacity: 0, duration: .35 }, 2.75)

      chapters.forEach((chapter, index) => {
        const copy = chapter.querySelector('.aura-copy')
        const content = Array.from(copy.children)

        if (index > 0) {
          gsap.from(content, {
            y: 42,
            opacity: 0,
            stagger: .09,
            ease: 'power2.out',
            scrollTrigger: { trigger: chapter, start: 'top 95%', end: 'top 25%', scrub: .32 },
          })
        }

        if (index < chapters.length - 1) {
          gsap.to(content, {
            y: -35,
            opacity: 0,
            stagger: .065,
            ease: 'power1.in',
            scrollTrigger: { trigger: chapter, start: 'bottom 66%', end: 'bottom 18%', scrub: .32 },
          })
        }
      })
    })

    motion.add('(prefers-reduced-motion: reduce)', () => {
      const showGlobe = (progress) => {
        frames.current.progress = progress
        frames.current.render?.(progress)
      }

      ScrollTrigger.create({
        trigger: '#explore',
        start: 'top center',
        end: 'bottom bottom',
        onEnter: () => showGlobe(3),
        onEnterBack: () => showGlobe(3),
        onLeaveBack: () => showGlobe(0),
      })
    })

    return () => motion.revert()
  }, [])

  useLayoutEffect(() => {
    const motion = gsap.matchMedia()

    motion.add('(prefers-reduced-motion: no-preference)', () => {
      let pending = 0
      let frame = 0
      let lastTime = 0

      const stop = () => {
        cancelAnimationFrame(frame)
        frame = 0
        pending = 0
        lastTime = 0
      }

      const advance = (time) => {
        const elapsed = lastTime ? Math.min(time - lastTime, 32) : 16
        const direction = Math.sign(pending)
        const distance = direction * Math.min(Math.abs(pending), Math.max(1, elapsed * window.innerHeight / 1400))
        window.scrollBy({ top: distance, behavior: 'instant' })
        pending -= distance
        lastTime = time

        const canContinue = direction < 0
          ? window.scrollY > 0
          : window.scrollY < document.documentElement.scrollHeight - window.innerHeight - 1
        if (Math.abs(pending) >= 1 && canContinue) {
          frame = requestAnimationFrame(advance)
        } else {
          stop()
        }
      }

      const limitWheel = (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || !event.cancelable) return
        if (!event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          stop()
          return
        }
        event.preventDefault()

        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
        const delta = event.deltaY * unit
        if (pending && Math.sign(pending) !== Math.sign(delta)) stop()
        const limit = window.innerHeight * .4
        pending = gsap.utils.clamp(-limit, limit, pending + delta)
        if (!frame) frame = requestAnimationFrame(advance)
      }

      window.addEventListener('wheel', limitWheel, { passive: false })
      window.addEventListener('pointerdown', stop)
      window.addEventListener('keydown', stop)
      return () => {
        window.removeEventListener('wheel', limitWheel)
        window.removeEventListener('pointerdown', stop)
        window.removeEventListener('keydown', stop)
        stop()
      }
    })

    return () => motion.revert()
  }, [])

  return (
    <div className="aura-landing">
      <header className="aura-header">
        <nav aria-label={copy.navLabel}>
          <a href="/" className="aura-wordmark">
            <img src="/aurahex-logo.svg" alt="AuraHex" width="1242" height="311" />
          </a>
          <a href="#observe" className="aura-header-story">{copy.mission}</a>
          <div className="aura-header-actions">
            <button type="button" className="aura-language" aria-label={copy.languageLabel} onClick={switchLanguage}>
              {otherLanguage.toUpperCase()}
            </button>
            <MapLink className="aura-nav-map">{copy.openMap}</MapLink>
          </div>
        </nav>
      </header>

      <main ref={story} className="aura-story">
        <div className="aura-stage" aria-hidden="true">
          <div className="aura-globe" />
          <Suspense fallback={null}><OrbitCanvas frames={frames} /></Suspense>
          <div className="aura-grid" />
          {!hasRotated && (
            <span className="aura-drag-hint" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12V5a1.5 1.5 0 0 1 3 0v6-1a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v3a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.6-2.1l-4.1-4.7a1.5 1.5 0 0 1 2.2-2l1.5 1.5" />
              </svg>
            </span>
          )}
        </div>

        <section className="aura-chapter aura-hero">
          <div className="aura-hero-sky" aria-hidden="true" />
          <div className="aura-copy">
            <p className="aura-label">{copy.heroLabel}</p>
            <h1>{copy.heroTitle[0]}<br />{copy.heroTitle[1]}</h1>
            <p>{copy.heroDescription}</p>
          </div>
        </section>

        <section id="observe" className="aura-chapter aura-observe">
          <div className="aura-copy">
            <p className="aura-label">NASA Space Apps Challenge</p>
            <h2>{copy.missionTitle}</h2>
            <p>{copy.missionDescription}</p>
          </div>
        </section>

        <section id="process" className="aura-chapter aura-surface">
          <div className="aura-copy">
            <p className="aura-label">{copy.processLabel}</p>
            <h2>{copy.processTitle}</h2>
            <p>{copy.processDescription}</p>
            <p className="aura-demo-note">{copy.demoNote}</p>
          </div>
          <dl className="aura-telemetry">
            <div><dt>{copy.source}</dt><dd>NASA FIRMS</dd></div>
            <div><dt>{copy.instruments}</dt><dd>MODIS / VIIRS</dd></div>
            <div><dt>{copy.spatialIndex}</dt><dd>H3</dd></div>
            <div><dt>{copy.historyLabel}</dt><dd>{copy.history}</dd></div>
          </dl>
        </section>

        <section id="explore" className="aura-chapter aura-surface aura-final">
          <div className="aura-copy">
            <p className="aura-label">{copy.exploreLabel}</p>
            <h2>{copy.exploreTitle}</h2>
            <p>{copy.exploreDescription}</p>
            <MapLink className="aura-button">{copy.exploreLink}</MapLink>
          </div>
          <div
            className="aura-globe-control"
            role="group"
            tabIndex={0}
            aria-label={copy.globeControl}
            onPointerDown={(event) => {
              if (event.button !== 0 || !event.isPrimary) return
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
            }}
            onPointerMove={(event) => {
              const previous = drag.current
              if (previous?.id !== event.pointerId) return
              const x = previous.x - event.clientX
              const y = event.clientY - previous.y
              if ((!x && !y) || !frames.current.rotate) return
              frames.current.rotate(x * .26, y * .26)
              setHasRotated(true)
              previous.x = event.clientX
              previous.y = event.clientY
            }}
            onLostPointerCapture={() => { drag.current = null }}
            onKeyDown={(event) => {
              const steps = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }
              const step = steps[event.key]
              if (!step || !frames.current.rotate) return
              event.preventDefault()
              frames.current.rotate(...step)
              setHasRotated(true)
            }}
          />
        </section>
      </main>

      <div className="aura-imagery">
        <a href="https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/">{copy.globeCredit}</a>
        <span aria-hidden="true"> / </span>
        <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">{copy.regionalCredit}</a>
      </div>

    </div>
  )
}
