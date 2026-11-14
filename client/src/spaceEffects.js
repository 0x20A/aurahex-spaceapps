import * as THREE from 'three'

const vertexShader = `
  varying vec3 positionOnSphere;
  void main() {
    positionOnSphere = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const spaceFragment = `
  varying vec3 positionOnSphere;
  uniform vec3 sunriseRay;
  uniform vec3 horizonRight;
  uniform float sunrise;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float starField(vec2 uv, vec2 density, float rarity) {
    vec2 grid = uv * density;
    vec2 id = floor(grid);
    float seed = hash(id);
    vec2 center = vec2(hash(id + 4.7), hash(id + 17.3)) * .64 + .18;
    float radius = mix(.052, .17, pow(seed, 3.0));
    float core = 1.0 - smoothstep(radius * .2, radius, length(fract(grid) - center));
    return core * step(rarity, seed) * pow(seed, 6.0);
  }

  void main() {
    vec3 ray = normalize(positionOnSphere);
    vec2 sky = vec2(atan(ray.z, ray.x) / 6.283185 + .5, asin(ray.y) / 3.141593 + .5);
    float dust = exp(-pow((ray.y + .11 + ray.x * .25) * 3.3, 2.0));
    float faint = starField(sky, vec2(1900.0, 950.0), .87);
    float bright = starField(sky + .133, vec2(440.0, 220.0), .92);
    vec3 color = vec3(.0008, .0011, .0022) + dust * vec3(.0011, .0017, .0035);
    color += faint * vec3(.075, .095, .14) + bright * vec3(.3, .38, .48);
    vec3 rayToEarth = -cameraPosition;
    float alongRay = dot(rayToEarth, ray);
    float altitude = length(rayToEarth - ray * alongRay) - 1.0;
    float solarDistance = length(ray - sunriseRay);
    float litArc = exp(-solarDistance * 3.1);
    float rim = exp(-max(altitude, 0.0) * 520.0);
    float atmosphere = exp(-max(altitude, 0.0) * 29.0);
    float airglow = exp(-max(altitude, 0.0) * 7.5);
    // Stretch the sunlight along the limb and let it fall off with altitude.
    float across = abs(dot(ray - sunriseRay, horizonRight));
    float daylight = exp(-pow(across * 19.0, 2.0)) * exp(-solarDistance * 7.0);
    float crest = daylight * exp(-max(altitude, 0.0) * 140.0);
    float scatter = daylight * exp(-max(altitude, 0.0) * 19.0);

    if (alongRay > 0.0 && altitude >= 0.0) {
      color += sunrise * (
        vec3(.37, .67, 1.0) * rim * (.10 + litArc * .85) +
        vec3(.035, .19, .60) * atmosphere * (.17 + litArc * .74) +
        vec3(.007, .029, .105) * airglow * litArc +
        vec3(.59, .83, 1.0) * crest * .78 +
        vec3(.11, .32, .66) * scatter * .46
      );
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

const atmosphereFragment = `
  varying vec3 positionOnSphere;
  uniform float strength;
  void main() {
    vec3 outward = normalize(positionOnSphere);
    vec3 towardEye = normalize(cameraPosition - positionOnSphere);
    float limb = pow(1.0 - abs(dot(outward, towardEye)), 4.0);
    float light = .28 + .72 * clamp(outward.y * .65 - outward.x * .34 + .35, 0.0, 1.0);
    gl_FragColor = vec4(.18, .34, .57, limb * light * strength);
    #include <colorspace_fragment>
  }
`

export function createSpaceEffects(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 32),
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: spaceFragment,
      uniforms: {
        sunriseRay: { value: new THREE.Vector3() },
        horizonRight: { value: new THREE.Vector3() },
        sunrise: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    }),
  )
  sky.renderOrder = -1

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.045, 96, 64),
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: atmosphereFragment,
      uniforms: { strength: { value: 1 } },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  const orbits = [
    { radius: 1.10, tilt: .44, bearing: -.55, phase: .15, speed: .15 },
    { radius: 1.16, tilt: -.66, bearing: .68, phase: .56, speed: .11 },
    { radius: 1.23, tilt: 1.04, bearing: 1.48, phase: .9, speed: .085 },
  ].map(({ radius, tilt, bearing, phase, speed }) => {
    const orbit = new THREE.EllipseCurve(0, 0, radius, radius)
    const geometry = new THREE.BufferGeometry().setFromPoints(orbit.getPoints(240))
    const count = geometry.getAttribute('position').count
    geometry.setAttribute('orbitPosition', new THREE.BufferAttribute(
      Float32Array.from({ length: count }, (_, index) => index / (count - 1)), 1,
    ))
    const material = new THREE.ShaderMaterial({
      uniforms: { phase: { value: phase }, strength: { value: 0 } },
      vertexShader: `
        attribute float orbitPosition;
        varying float arc;
        void main() {
          arc = orbitPosition;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float phase;
        uniform float strength;
        varying float arc;
        void main() {
          float behind = fract(phase - arc);
          float trail = (1.0 - smoothstep(0.0, .24, behind)) * smoothstep(0.0, .006, behind);
          float head = exp(-behind * 85.0);
          gl_FragColor = vec4(mix(vec3(.31, .56, .81), vec3(.82, .95, 1.0), head),
            strength * (.10 + trail * .60 + head * .30));
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
    })
    const line = new THREE.Line(geometry, material)
    line.rotation.set(tilt, bearing, 0, 'YXZ')
    scene.add(line)
    return { line, phase, speed }
  })

  scene.add(sky, atmosphere)
  const towardEarth = new THREE.Vector3()
  const horizonUp = new THREE.Vector3()
  const horizonRight = new THREE.Vector3()
  const worldUp = new THREE.Vector3(0, 1, 0)

  return {
    update(camera, closeup, dawn, intro, orbitVisibility, seconds) {
      sky.position.copy(camera.position)
      towardEarth.copy(camera.position).normalize().negate()
      horizonRight.crossVectors(towardEarth, worldUp).normalize()
      horizonUp.crossVectors(horizonRight, towardEarth)
      sky.material.uniforms.horizonRight.value.copy(horizonRight)
      const tangent = 1 / camera.position.length()
      const altitude = Math.min(.999, tangent + .002 * intro)
      sky.material.uniforms.sunriseRay.value.copy(towardEarth)
        .multiplyScalar(Math.sqrt(1 - altitude * altitude))
        .addScaledVector(horizonUp, altitude * .985)
        .addScaledVector(horizonRight, altitude * .173)
        .normalize()
      sky.material.uniforms.sunrise.value = dawn * intro
      atmosphere.material.uniforms.strength.value = (1 - closeup) * (1 - dawn) * .74
      atmosphere.visible = closeup < .999

      for (const { line, phase, speed } of orbits) {
        line.visible = orbitVisibility > .001
        line.material.uniforms.strength.value = orbitVisibility
        line.material.uniforms.phase.value = (phase + seconds * speed) % 1
      }
    },
    dispose() {
      for (const mesh of [sky, atmosphere, ...orbits.map(({ line }) => line)]) {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
    },
  }
}
