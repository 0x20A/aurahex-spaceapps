import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './landing.css'

gsap.registerPlugin(ScrollTrigger)

const OrbitCanvas = lazy(() => import('./OrbitCanvas.jsx'))

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

  useLayoutEffect(() => {
    const motion = gsap.matchMedia(story.current)

    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const frame = frames.current

      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: story.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: .45,
        },
      })
        .to(frame, { progress: 3, duration: 3.13, onUpdate: () => frame.render?.(frame.progress) }, 0)
        .to('.aura-grid', { opacity: 1, duration: .36 }, 1.83)
        .to('.aura-grid', { opacity: 0, duration: .35 }, 2.75)

      const chapters = gsap.utils.toArray('.aura-chapter', story.current)

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
        <nav aria-label="Navegación principal">
          <a href="/" className="aura-wordmark">
            <img src="/aurahex-logo.svg" alt="AuraHex" width="1242" height="311" />
          </a>
          <a href="#observe" className="aura-header-story">La misión</a>
          <MapLink className="aura-nav-map">Abrir mapa</MapLink>
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
          <div className="aura-copy">
            <p className="aura-label">Observación satelital de incendios</p>
            <h1>El fuego, visto<br />desde órbita.</h1>
            <p>Sigue las señales térmicas que detectan los satélites y explóralas sobre un mapa 3D.</p>
          </div>
        </section>

        <section id="observe" className="aura-chapter aura-observe">
          <div className="aura-copy">
            <p className="aura-label">NASA Space Apps Challenge</p>
            <h2>¿Qué es AuraHex?</h2>
            <p>AuraHex reúne las anomalías térmicas que detectan MODIS y VIIRS sobre México y parte de Norteamérica. El mapa permite comparar dónde y cuándo se registraron las detecciones.</p>
          </div>
        </section>

        <section id="process" className="aura-chapter aura-surface">
          <div className="aura-copy">
            <p className="aura-label">Análisis geoespacial</p>
            <h2>Del dato al terreno</h2>
            <p>Agrupamos las detecciones por fecha y celda H3 para comparar la potencia radiativa observada entre zonas.</p>
            <p className="aura-demo-note">Demostración de celdas H3</p>
          </div>
          <dl className="aura-telemetry">
            <div><dt>Fuente</dt><dd>NASA FIRMS</dd></div>
            <div><dt>Instrumentos</dt><dd>MODIS / VIIRS</dd></div>
            <div><dt>Índice espacial</dt><dd>H3</dd></div>
          </dl>
        </section>

        <section id="explore" className="aura-chapter aura-surface aura-final">
          <div className="aura-copy">
            <p className="aura-label">Mapa interactivo</p>
            <h2>Explora</h2>
            <p>Recorre siete días de observaciones, filtra por instrumento y cambia la escala con el zoom.</p>
            <MapLink className="aura-button">Abrir el mapa interactivo</MapLink>
          </div>
          <div
            className="aura-globe-control"
            role="group"
            tabIndex={0}
            aria-label="Girar globo. Usa las flechas del teclado o arrastra."
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

      <div className="aura-imagery"><a href="https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/">Globo · NASA Blue Marble</a><span aria-hidden="true"> / </span><a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Imagen regional · Esri, Maxar, Earthstar Geographics y comunidad GIS</a></div>

    </div>
  )
}
