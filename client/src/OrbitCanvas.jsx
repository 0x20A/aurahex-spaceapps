import { useEffect, useRef } from 'react'
import { TextureLoader, SRGBColorSpace } from 'three'
import { createOrbitScene } from './orbitScene'

export default function OrbitCanvas({ frames }) {
  const host = useRef(null)

  useEffect(() => {
    const element = host.current
    const stage = element.parentElement
    let active = true
    let scene
    let regionalTexture
    const loader = new TextureLoader()

    const showFallback = () => {
      delete stage.dataset.webgl
      frames.current.render = null
      frames.current.rotate = null
    }

    const texture = loader.load('/blue-marble.webp', (loadedTexture) => {
      if (!active) return
      loadedTexture.colorSpace = SRGBColorSpace

      try {
        scene = createOrbitScene(element, loadedTexture, showFallback)
      } catch (error) {
        console.warn('AuraHex: la escena WebGL no está disponible.', error)
        return
      }

      stage.dataset.webgl = 'true'
      const render = (progress) => {
        scene.render(progress)
        if (progress < .75 || regionalTexture) return

        regionalTexture = loader.load('/mexico-imagery.webp', (detail) => {
          if (!active) return
          detail.colorSpace = SRGBColorSpace
          scene.setRegionalTexture(detail)
        })
      }

      frames.current.render = render
      frames.current.rotate = scene.rotate
      render(frames.current.progress)
    })

    return () => {
      active = false
      showFallback()
      scene?.dispose()
      texture.dispose()
      regionalTexture?.dispose()
    }
  }, [frames])

  return <div className="aura-webgl" ref={host} />
}
