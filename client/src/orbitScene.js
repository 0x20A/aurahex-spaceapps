import * as THREE from 'three'
import { createSpaceEffects } from './spaceEffects.js'
import { cellToBoundary, cellToLatLng, gridDisk, latLngToCell } from 'h3-js'

const radians = THREE.MathUtils.degToRad
const clamp = THREE.MathUtils.clamp
const mix = THREE.MathUtils.lerp

function surface(latitude, longitude, radius = 1) {
  const lat = radians(latitude)
  const lon = radians(longitude)
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  )
}

const threatStyles = [
  { color: '#eab308', wall: '#806000', height: .0028 },
  { color: '#f97316', wall: '#9a3910', height: .0054 },
  { color: '#ef4444', wall: '#8e202b', height: .008 },
]

function makeCells(scene) {
  const center = latLngToCell(23.5, -101, 4)
  return gridDisk(center, 3).map((index, order) => {
    const [lat, lon] = cellToLatLng(index)
    const normal = surface(lat, lon)
    const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize()
    const north = new THREE.Vector3().crossVectors(normal, east)
    const outline = cellToBoundary(index).map(([vertexLat, vertexLon]) => {
      const offset = surface(vertexLat, vertexLon).sub(normal)
      return new THREE.Vector2(offset.dot(east) * .88, offset.dot(north) * .88)
    })
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(outline), {
      depth: 1,
      bevelEnabled: false,
    })
    const threat = index === center || order % 7 === 0 ? 2 : Number(order % 3 === 0)
    const { color, wall, height } = threatStyles[threat]
    const material = [
      new THREE.MeshBasicMaterial({ color }),
      new THREE.MeshBasicMaterial({ color: wall }),
    ]
    const mesh = new THREE.Mesh(geometry, material)
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, normal))
    mesh.position.copy(normal).multiplyScalar(0.999985)
    scene.add(mesh)
    return { mesh, height: height + (order % 7) * .00022, delay: (order % 11) * .015 }
  })
}

const globeVertex = `
  varying vec2 earthUv;
  varying vec3 earthNormal;
  varying vec3 eyeDirection;
  void main() {
    earthUv = uv;
    earthNormal = normalize(normalMatrix * normal);
    vec4 positionInView = modelViewMatrix * vec4(position, 1.0);
    eyeDirection = -positionInView.xyz;
    gl_Position = projectionMatrix * positionInView;
  }
`

const globeFragment = `
  uniform sampler2D earthMap;
  uniform float closeup;
  uniform sampler2D regionalMap;
  uniform float regionalReady;
  uniform float dawn;
  varying vec2 earthUv;
  varying vec3 earthNormal;
  varying vec3 eyeDirection;
  void main() {
    vec3 terrain = texture2D(earthMap, earthUv).rgb;
    vec3 normal = normalize(earthNormal);
    float facing = max(dot(normal, normalize(eyeDirection)), 0.0);
    float rim = pow(1.0 - facing, 3.5);
    float light = .27 + .73 * max(dot(normal, normalize(vec3(-.42, .72, .54))), 0.0);
    float detail = dot(terrain, vec3(.25, .65, .10));
    // Fade fine dots before they become smaller than a screen pixel.
    vec2 grid = earthUv * vec2(850.0, 425.0);
    vec2 footprint = fwidth(grid);
    vec2 local = fract(grid) - .5;
    float pixel = max(footprint.x, footprint.y);
    float dotMask = 1.0 - smoothstep(.16 - pixel * .20, .26 + pixel * .22, length(local));
    float stable = 1.0 - smoothstep(.22, .65, pixel);
    float land = smoothstep(.014, .22, detail);
    float day = smoothstep(-.22, .72, dot(normal, normalize(vec3(-.37, .79, .39))));
    vec3 orbital = vec3(.0012, .0018, .0029) + terrain * .13 * light * day;
    orbital += vec3(.11, .145, .18) * land * dotMask * stable * (.37 + .63 * day);
    orbital += rim * vec3(.006, .016, .033);

    vec2 coordinates = earthUv * vec2(360.0, 180.0) - vec2(180.0, 90.0);
    vec2 regionUv = (coordinates - vec2(-122.0, 10.0)) / vec2(40.0, 26.0);
    vec2 edge = min(regionUv, 1.0 - regionUv);
    float blend = smoothstep(0.0, .13, min(edge.x, edge.y)) * regionalReady * closeup;
    vec3 regionalTerrain = texture2D(regionalMap, clamp(regionUv, 0.0, 1.0)).rgb;
    vec3 surface = mix(terrain, regionalTerrain, blend) * vec3(.52, .55, .56);
    orbital *= mix(1.0, .075, dawn);
    gl_FragColor = vec4(mix(orbital, surface, closeup), 1.0);
    #include <colorspace_fragment>
  }
`

export function createOrbitScene(host, texture, onContextLost) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65))
  renderer.domElement.addEventListener('webglcontextlost', onContextLost)
  host.append(renderer.domElement)

  const scene = new THREE.Scene()
  const space = createSpaceEffects(scene)
  const camera = new THREE.PerspectiveCamera(39, 1, .001, 15)
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 192, 128),
    new THREE.ShaderMaterial({
      uniforms: {
        earthMap: { value: texture },
        regionalMap: { value: texture },
        regionalReady: { value: 0 },
        dawn: { value: 0 },
        closeup: { value: 0 },
      },
      vertexShader: globeVertex,
      fragmentShader: globeFragment,
    }),
  )
  scene.add(earth)
  const cells = makeCells(scene)
  const direction = new THREE.Vector3()
  const target = new THREE.Vector3()
  const east = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const north = new THREE.Vector3()
  const exploreCamera = new THREE.Vector3()
  const exploreTarget = new THREE.Vector3()
  const projectedCenter = new THREE.Vector3()
  const stage = host.parentElement
  const baseDirection = surface(22, -101)
  const rotation = new THREE.Quaternion()
  const pitchRotation = new THREE.Quaternion()
  const orbitEast = new THREE.Vector3().crossVectors(up, baseDirection).normalize()
  let latitude = 22
  let longitude = -101
  let progress = 0
  let animationFrame
  const motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const introStart = performance.now()

  function render(value = progress) {
    progress = value
    const approach = THREE.MathUtils.smoothstep(value, .92, 1.97)
    const regional = THREE.MathUtils.smoothstep(value, 1.38, 1.99)
    const pullback = THREE.MathUtils.smoothstep(value, 2.48, 3)
    const drift = THREE.MathUtils.smoothstep(value, 0, 1)
    const dawn = 1 - THREE.MathUtils.smoothstep(value, .06, .94)
    const intro = motionAllowed ? THREE.MathUtils.smoothstep(performance.now() - introStart, 0, 1750) : 1
    const distance = mix(mix(3.12, 3.65, drift), 1.55, dawn)
    direction.copy(surface(mix(mix(12, 29, drift), 23.35, approach), mix(mix(-119, -110, drift), -101, approach)))
    camera.position.copy(direction).multiplyScalar(1 + Math.exp(mix(Math.log(distance - 1), Math.log(.136 + pullback * .051), approach)))
    target.copy(direction).multiplyScalar(approach)
    // Offset the close-up around the copy so the animated cells stay visible.
    east.crossVectors(up, direction).normalize()
    north.crossVectors(direction, east)
    const wide = Math.min(camera.aspect, 1.85)
    target.addScaledVector(east, mix(mix((-.61 + drift * .30) * wide, -.055, dawn), -.011 * wide, approach))
    target.addScaledVector(north, mix(mix(.46 - drift * .30, 1.62, dawn), .014, approach))
    camera.position.addScaledVector(north, -approach * .09)
    camera.position.addScaledVector(east, approach * .044)
    const explore = THREE.MathUtils.smoothstep(value, 2.45, 3)
    exploreCamera.copy(baseDirection).multiplyScalar(camera.aspect < .82 ? 4.3 : 3.7)
    east.crossVectors(up, exploreCamera).normalize()
    exploreTarget.copy(east).multiplyScalar(camera.aspect < .82 ? 0 : -.37 * wide)
    exploreTarget.y = camera.aspect < .82 ? -.43 : 0
    camera.position.lerp(exploreCamera, explore)
    target.lerp(exploreTarget, explore)
    if (explore > 0) {
      const yaw = ((longitude + 101 + 540) % 360) - 180
      rotation.setFromAxisAngle(up, radians(yaw * explore))
      pitchRotation.setFromAxisAngle(orbitEast, radians((22 - latitude) * explore))
      rotation.multiply(pitchRotation)
      camera.position.applyQuaternion(rotation)
      target.applyQuaternion(rotation)
      camera.up.copy(up).applyQuaternion(rotation)
    } else {
      camera.up.copy(up)
    }
    camera.lookAt(target)
    camera.updateMatrixWorld()
    if (explore > .92) {
      projectedCenter.set(0, 0, 0).project(camera)
      stage.style.setProperty('--globe-x', `${(projectedCenter.x + 1) * 50}%`)
      stage.style.setProperty('--globe-y', `${(1 - projectedCenter.y) * 50}%`)
    }
    stage.toggleAttribute('data-exploring', explore > .92)
    const detail = regional * (1 - explore)
    earth.material.uniforms.closeup.value = detail
    earth.material.uniforms.dawn.value = dawn
    const orbits = THREE.MathUtils.smoothstep(value, .46, .94) *
      (1 - THREE.MathUtils.smoothstep(value, 1.20, 1.58))
    const seconds = motionAllowed ? (performance.now() - introStart) / 1000 : 0
    space.update(camera, detail, dawn, .23 + .77 * intro, orbits, seconds)

    if (motionAllowed && ((intro < 1 && dawn > 0) || orbits > .001) && animationFrame === undefined) {
      animationFrame = requestAnimationFrame(() => {
        animationFrame = undefined
        render()
      })
    }

    cells.forEach(({ mesh, height, delay }) => {
      const rise = THREE.MathUtils.smoothstep(value, 1.79 + delay, 2.04 + delay)
      const settle = THREE.MathUtils.smoothstep(value, 2.19 + delay / 2, 2.46 + delay / 2)
      const retreat = THREE.MathUtils.smoothstep(value, 2.52 + delay, 2.85 + delay)
      const extrusion = rise * (1 - settle * .42) * (1 - retreat)
      mesh.visible = extrusion > .002
      mesh.scale.z = Math.max(.00004, height * extrusion)
    })

    renderer.render(scene, camera)
  }

  function resize() {
    const { clientWidth, clientHeight } = host
    if (!clientWidth || !clientHeight) return
    camera.aspect = clientWidth / clientHeight
    camera.fov = camera.aspect < .82 ? 51 : 39
    camera.updateProjectionMatrix()
    renderer.setSize(clientWidth, clientHeight, false)
    render()
  }

  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  return {
    render,
    rotate(x, y) {
      longitude = (longitude + x) % 360
      latitude = clamp(latitude + y, -82, 82)
      render()
    },
    setRegionalTexture(regionalTexture) {
      regionalTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
      earth.material.uniforms.regionalMap.value = regionalTexture
      earth.material.uniforms.regionalReady.value = 1
      render()
    },
    dispose() {
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      space.dispose()
      earth.geometry.dispose()
      earth.material.dispose()
      cells.forEach(({ mesh }) => {
        mesh.geometry.dispose()
        mesh.material.forEach((material) => material.dispose())
      })
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
