'use client'

import { useEffect, useRef } from 'react'

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

// screen blend mode: 输出颜色直接叠亮背景，黑色完全透明，深色背景可见
const FRAG = `
precision highp float;
uniform float u_time;
uniform vec2  u_res;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i),             f),
        dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
    mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
        dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p  = p * 2.1 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float ar = u_res.x / u_res.y;
  uv.x *= ar;

  float t = u_time * 0.07;

  vec2 q = vec2(fbm(uv + t * 0.5),
                fbm(uv + vec2(5.2, 1.3)));

  vec2 r = vec2(fbm(uv + 4.0 * q + vec2(1.7, 9.2) + t * 0.15),
                fbm(uv + 4.0 * q + vec2(8.3, 2.8) + t * 0.13));

  float f = fbm(uv + 4.0 * r + t * 0.05);
  f = clamp(f * 0.5 + 0.5, 0.0, 1.0);

  // 蓝紫色流体 (screen 模式下这些颜色会发光)
  vec3 cold = vec3(0.05, 0.12, 0.65);
  // 深紫
  vec3 deep = vec3(0.18, 0.04, 0.45);
  // 琥珀金 — 品牌色 #c8a55a
  vec3 warm = vec3(0.55, 0.35, 0.05);

  vec3 col = mix(deep, cold, clamp(f * 1.6, 0.0, 1.0));
  col = mix(col, warm, clamp(length(r) * 0.5 - 0.05, 0.0, 1.0));

  // vignette: 边缘减弱，中心保留
  vec2 cv = uv - vec2(ar * 0.5, 0.5);
  float vig = 1.0 - smoothstep(0.3, 1.1, dot(cv, cv) * 1.2);
  col *= vig;

  // screen blend mode: alpha=1，让 CSS mix-blend-mode:screen 做叠加
  gl_FragColor = vec4(col * 0.72, 1.0);
}
`

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[LiquidEther] shader error:', gl.getShaderInfoLog(s))
  }
  return s
}

export default function LiquidEther({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { alpha: false })
    if (!gl) return

    const prog = gl.createProgram()!
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER,   VERT))
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[LiquidEther] link error:', gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uRes  = gl.getUniformLocation(prog, 'u_res')

    let raf: number
    const start = performance.now()

    function resize() {
      const w = Math.round(canvas!.clientWidth  * devicePixelRatio)
      const h = Math.round(canvas!.clientHeight * devicePixelRatio)
      if (w > 0 && h > 0 && (canvas!.width !== w || canvas!.height !== h)) {
        canvas!.width  = w
        canvas!.height = h
        gl!.viewport(0, 0, w, h)
      }
    }

    function draw() {
      resize()
      const t = (performance.now() - start) * 0.001
      gl!.uniform1f(uTime, t)
      gl!.uniform2f(uRes, canvas!.width, canvas!.height)
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', mixBlendMode: 'screen' }}
    />
  )
}
