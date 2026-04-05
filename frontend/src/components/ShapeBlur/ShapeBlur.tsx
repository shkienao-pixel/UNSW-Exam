'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
varying vec2 v_texcoord;
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    v_texcoord = uv;
}
`

const fragmentShader = /* glsl */ `
varying vec2 v_texcoord;

uniform vec2 u_mouse;
uniform vec2 u_resolution;
uniform float u_pixelRatio;

uniform float u_shapeSize;
uniform float u_roundness;
uniform float u_borderSize;
uniform float u_circleSize;
uniform float u_circleEdge;

#ifndef PI
#define PI 3.1415926535897932384626433832795
#endif
#ifndef TWO_PI
#define TWO_PI 6.2831853071795864769252867665590
#endif

vec2 coord(in vec2 p) {
    p = p / u_resolution.xy;
    if (u_resolution.x > u_resolution.y) {
        p.x *= u_resolution.x / u_resolution.y;
        p.x += (u_resolution.y - u_resolution.x) / u_resolution.y / 2.0;
    } else {
        p.y *= u_resolution.y / u_resolution.x;
        p.y += (u_resolution.x - u_resolution.y) / u_resolution.x / 2.0;
    }
    p -= 0.5;
    p *= vec2(-1.0, 1.0);
    return p;
}

#define st0 coord(gl_FragCoord.xy)
#define mx coord(u_mouse * u_pixelRatio)

float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 d = abs(p - 0.5) * 4.2 - b + vec2(r);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}
float sdCircle(in vec2 st, in vec2 center) {
    return length(st - center) * 2.0;
}

float aastep(float threshold, float value) {
    float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
    return smoothstep(threshold - afwidth, threshold + afwidth, value);
}
float fill(float x, float size, float edge) {
    return 1.0 - smoothstep(size - edge, size + edge, x);
}
float strokeAA(float x, float size, float w, float edge) {
    float afwidth = length(vec2(dFdx(x), dFdy(x))) * 0.70710678;
    float d = smoothstep(size - edge - afwidth, size + edge + afwidth, x + w * 0.5)
            - smoothstep(size - edge - afwidth, size + edge + afwidth, x - w * 0.5);
    return clamp(d, 0.0, 1.0);
}

void main() {
    vec2 st = st0 + 0.5;
    vec2 posMouse = mx * vec2(1., -1.) + 0.5;

    float sdfCircle = fill(
        sdCircle(st, posMouse),
        u_circleSize,
        u_circleEdge
    );

    float sdf = sdRoundRect(st, vec2(u_shapeSize), u_roundness);
    float alpha = strokeAA(sdf, 0.0, u_borderSize, sdfCircle) * 4.0;

    vec3 color = vec3(1.0);
    gl_FragColor = vec4(color.rgb, alpha);
}
`

export interface ShapeBlurProps {
  className?: string
  /** Shape size (0–2). Default 1.2 */
  shapeSize?: number
  /** Corner roundness (0–1). Default 0.4 */
  roundness?: number
  /** Border stroke width. Default 0.05 */
  borderSize?: number
  /** Mouse-blur circle size. Default 0.3 */
  circleSize?: number
  /** Mouse-blur circle edge softness. Default 0.5 */
  circleEdge?: number
  /** Tint color applied via CSS mix-blend-mode. Default white */
  color?: string
}

export default function ShapeBlur({
  className = '',
  shapeSize = 1.2,
  roundness = 0.4,
  borderSize = 0.05,
  circleSize = 0.3,
  circleEdge = 0.5,
  color = 'rgba(255,255,255,0.55)',
}: ShapeBlurProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let active = true
    let rafId: number
    let lastTime = 0

    const vMouse = new THREE.Vector2()
    const vMouseDamp = new THREE.Vector2()
    const vResolution = new THREE.Vector2()

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera()
    camera.position.z = 1

    const renderer = new THREE.WebGLRenderer({ alpha: true })
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_mouse:      { value: vMouseDamp },
        u_resolution: { value: vResolution },
        u_pixelRatio: { value: 2 },
        u_shapeSize:  { value: shapeSize },
        u_roundness:  { value: roundness },
        u_borderSize: { value: borderSize },
        u_circleSize: { value: circleSize },
        u_circleEdge: { value: circleEdge },
      },
      transparent: true,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    scene.add(quad)

    const onMove = (e: MouseEvent | PointerEvent) => {
      if (!mount) return
      const rect = mount.getBoundingClientRect()
      vMouse.set(e.clientX - rect.left, e.clientY - rect.top)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('pointermove', onMove)

    const resize = () => {
      if (!active) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      const dpr = Math.min(window.devicePixelRatio, 2)
      renderer.setSize(w, h)
      renderer.setPixelRatio(dpr)
      camera.left = -w / 2; camera.right = w / 2
      camera.top = h / 2;   camera.bottom = -h / 2
      camera.updateProjectionMatrix()
      quad.scale.set(w, h, 1)
      vResolution.set(w, h).multiplyScalar(dpr)
      material.uniforms.u_pixelRatio.value = dpr
    }
    resize()
    window.addEventListener('resize', resize)
    const ro = new ResizeObserver(() => { if (active) resize() })
    ro.observe(mount)

    const tick = () => {
      if (!active) return
      const now = performance.now() * 0.001
      const dt = now - lastTime
      lastTime = now
      vMouseDamp.x = THREE.MathUtils.damp(vMouseDamp.x, vMouse.x, 8, dt)
      vMouseDamp.y = THREE.MathUtils.damp(vMouseDamp.y, vMouse.y, 8, dt)
      renderer.render(scene, camera)
      rafId = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      active = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      ro.disconnect()
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('pointermove', onMove)
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }, [shapeSize, roundness, borderSize, circleSize, circleEdge])

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: '100%', height: '100%', color }}
    />
  )
}
