"use client";

import { useEffect, useRef } from "react";

/**
 * The weather behind the whole document.
 *
 * This is decoration and says so. That distinction is the whole reason it is
 * allowed to exist where the field was not: the field drew real records and
 * therefore made a claim, and a claim you cannot read is worse than no claim.
 * This draws nothing and claims nothing. It is light on paper.
 *
 * Two layers in one scene:
 *
 *   THE FLOW — a full-bleed plane running domain-warped fractal noise, which
 *   is the technique under Stripe's own hero. Two octaves of warp rather than
 *   one, so the bands fold into each other instead of sliding past. It is
 *   masked to a soft ellipse and kept under 8% opacity: at hero scale that is
 *   the difference between paper with light on it and a marketing gradient.
 *
 *   THE MOTES — a few hundred points on slow drift that lean toward the
 *   cursor and ease back when it leaves. Not a particle field reacting to the
 *   mouse like a toy; closer to dust in a shaft of light, which moves because
 *   something moved near it.
 *
 * ONE canvas, fixed to the viewport, behind the entire page — not one per
 * section. That is the whole architectural point. A WebGL context is an
 * expensive object and a browser will only keep about sixteen of them alive;
 * mounting a canvas per section is how a page ends up silently dropping the
 * first one it created halfway down. A single fixed layer costs one context,
 * one render loop and one shader compile for the whole document, and the
 * sections simply scroll over it.
 *
 * It knows where the reader is. `uScroll` is progress through the document,
 * and the flow drifts and re-tints along it, so the top of the page and the
 * foot are not the same weather. The opaque sections — the 16(4) band, the
 * call to action — pass over it and hide it, which is the correct behaviour:
 * those have a ground of their own to be.
 *
 * Both layers take their colour from the palette, so the whole thing re-tints
 * itself in dark mode with no second code path. Off for reduced motion, off
 * for modest devices, off on touch, and every section is fully legible if it
 * never arrives.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uScroll;
  uniform vec2  uMouse;
  uniform vec2  uAspect;
  uniform vec3  uInk;
  uniform vec3  uBooks;
  uniform vec3  uExposure;

  varying vec2 vUv;

  // Ashima simplex noise, the standard 2D implementation.
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865, 0.366025404, -0.577350269, 0.024390244);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * snoise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * uAspect;

    // Domain warp, twice. One pass gives you bands; two gives you folds, and
    // folds are what stop it reading as a CSS gradient.
    float t = uTime * 0.045 + uScroll * 1.6;
    uv.y += uScroll * 0.9;
    vec2 q = vec2(fbm(uv * 0.42 + t), fbm(uv * 0.42 + vec2(4.2, 1.3) - t));
    vec2 r = vec2(fbm(uv * 0.6 + q * 1.1 + vec2(1.7, 9.2)),
                  fbm(uv * 0.6 + q * 1.1 + vec2(8.3, 2.8)));

    // The hand warms the paper where it rests.
    float d = length(uv - uMouse);
    float hand = exp(-d * d * 1.8);

    float f = fbm(uv * 0.5 + r * 0.9 + hand * 0.3);
    f = f * 0.5 + 0.5;

    vec3 c = mix(uBooks, uInk, smoothstep(0.42, 0.88, f));
    c = mix(c, uExposure, uScroll * 0.18);
    c = mix(c, uExposure, smoothstep(0.62, 0.98, f + hand * 0.2) * 0.45);

    // Masked to a soft ellipse so it never reaches an edge and becomes a
    // rectangle of colour.
    float mask = smoothstep(1.35, 0.02, length(uv * vec2(0.78, 1.15)));
    float alpha = mask * (0.052 + hand * 0.055) * smoothstep(0.30, 0.92, f);

    gl_FragColor = vec4(c, alpha);
  }
`;

const MOTE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform vec2  uMouse;
  uniform float uDpr;
  varying float vA;

  void main() {
    vec3 p = position;

    // Slow drift, each mote on its own phase.
    float t = uTime * 0.08 + aSeed * 40.0;
    p.x += sin(t) * 0.5;
    p.y += cos(t * 0.8) * 0.36;

    // And a lean toward the hand, falling off fast.
    vec2 d = p.xy - uMouse;
    float pull = exp(-dot(d, d) * 1.1);
    p.xy -= normalize(d + 1e-5) * pull * 0.32;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.0 + aSeed * 2.2 + pull * 3.0) * uDpr;
    vA = 0.07 + aSeed * 0.10 + pull * 0.40;
  }
`;

const MOTE_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uInk;
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, r);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uInk, vA * a);
  }
`;

function toRgb(value: string, fallback: [number, number, number]): [number, number, number] {
  const v = value.trim();
  if (!v) return fallback;
  const nums = v.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255];
  }
  return fallback;
}

export function Aurora({ className = "" }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.hardwareConcurrency ?? 8) <= 4) return;
    if ((nav.deviceMemory ?? 8) <= 4) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const THREE = await import("three");
      if (disposed) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
      } catch {
        return;
      }
      renderer.setPixelRatio(dpr);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const styles = getComputedStyle(document.documentElement);
      const token = (n: string, f: [number, number, number]) =>
        toRgb(styles.getPropertyValue(n), f);

      const uniforms = {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uAspect: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: dpr },
        uInk: { value: new THREE.Vector3(...token("--ink-rgb", [0.09, 0.094, 0.102])) },
        uBooks: { value: new THREE.Vector3(...token("--books-rgb", [0.122, 0.239, 0.478])) },
        uExposure: {
          value: new THREE.Vector3(...token("--exposure-rgb", [0.784, 0.212, 0.165])),
        },
      };

      const flow = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          uniforms,
          transparent: true,
          depthTest: false,
        }),
      );
      scene.add(flow);

      // The motes, on a second orthographic pass in the same clip space.
      const COUNT = 340;
      const pos = new Float32Array(COUNT * 3);
      const seed = new Float32Array(COUNT);
      for (let i = 0; i < COUNT; i += 1) {
        pos[i * 3] = (Math.random() - 0.5) * 2.4;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 2.0;
        pos[i * 3 + 2] = 0;
        seed[i] = Math.random();
      }
      const moteGeom = new THREE.BufferGeometry();
      moteGeom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      moteGeom.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      const motes = new THREE.Points(
        moteGeom,
        new THREE.ShaderMaterial({
          vertexShader: MOTE_VERT,
          fragmentShader: MOTE_FRAG,
          uniforms,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      scene.add(motes);

      const resize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        uniforms.uAspect.value.set(Math.max(1, w / Math.max(1, h)), 1);
      };
      resize();

      let mx = 0;
      let my = 0;
      const onMove = (e: PointerEvent) => {
        mx = (e.clientX / window.innerWidth - 0.5) * 2 * uniforms.uAspect.value.x;
        my = -(e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("resize", resize);

      let raf = 0;
      let running = true;
      const t0 = performance.now();

      const frame = () => {
        if (!running) return;
        uniforms.uTime.value = (performance.now() - t0) / 1000;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const target = max > 0 ? window.scrollY / max : 0;
        uniforms.uScroll.value += (target - uniforms.uScroll.value) * 0.06;
        uniforms.uMouse.value.x += (mx - uniforms.uMouse.value.x) * 0.05;
        uniforms.uMouse.value.y += (my - uniforms.uMouse.value.y) * 0.05;
        renderer.render(scene, camera);
        root.classList.add("aurora--on");
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      const onVis = () => {
        if (document.hidden) {
          running = false;
          cancelAnimationFrame(raf);
        } else if (!running) {
          running = true;
          raf = requestAnimationFrame(frame);
        }
      };
      document.addEventListener("visibilitychange", onVis);

      cleanup = () => {
        running = false;
        cancelAnimationFrame(raf);
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("resize", resize);
        flow.geometry.dispose();
        (flow.material as import("three").Material).dispose();
        moteGeom.dispose();
        (motes.material as import("three").Material).dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden className={`aurora-fixed no-print ${className}`}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
