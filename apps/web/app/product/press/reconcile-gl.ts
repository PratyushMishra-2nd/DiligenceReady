/**
 * The reconciliation, as eleven thousand points, in one draw call.
 *
 * No library. The whole animation is a function of one uniform, how far the
 * reader has scrolled through the section, evaluated per point in a vertex
 * shader, so there is nothing to tween on the CPU and nothing to keep in
 * sync. ogl would be 20KB and three.js 170KB to do a job that is one buffer,
 * one program and one drawArrays call.
 *
 * What it draws is the same data the static figure draws: every record of
 * both seeded companies, in feed order, with the planted defects at the rows
 * they were actually planted in. The animation adds an argument the still
 * picture cannot make, that reconciliation is a process most records survive,
 * and it must not add a fact.
 */

export type Register = { count: number; marks: number[] };

export type Scene = {
  draw: (phase: number) => void;
  resize: () => void;
  destroy: () => void;
};

const COLUMNS = 160;
const BAND_GAP = 0.06;

const VERT = `#version 300 es
in vec2 aFinal;
in float aSeed;
in float aMarked;

uniform vec2 uRes;
uniform float uPhase;
uniform float uDpr;
uniform float uCell;

out float vMarked;
out float vAlpha;

float ease(float t) {
  float u = 1.0 - clamp(t, 0.0, 1.0);
  return 1.0 - u * u * u;
}

void main() {
  // The registers fill over the section's entry, so the fall is done by
  // about a third and the rest of the scroll belongs to the settle.
  float delay = aSeed * 0.20;
  float fall = ease((uPhase - delay) / 0.18);
  float settle = smoothstep(0.58, 0.90, uPhase);

  vec2 start = vec2(aFinal.x, -0.25 * uRes.y - aSeed * uRes.y * 0.9);
  vec2 pos = mix(start, aFinal, fall);

  vAlpha = fall * mix(1.0, mix(0.22, 1.0, aMarked), settle);
  vMarked = aMarked;
  gl_PointSize = uCell * uDpr * mix(1.0, mix(0.86, 1.5, aMarked), settle);

  vec2 clip = (pos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;

in float vMarked;
in float vAlpha;
out vec4 outColour;

const vec3 FIELD = vec3(0.549, 0.522, 0.478);
const vec3 STATUTE = vec3(0.769, 0.161, 0.106);

void main() {
  vec2 d = abs(gl_PointCoord - 0.5);
  if (max(d.x, d.y) > 0.5) discard;

  // Multiply blending, so this fades toward WHITE rather than toward
  // transparent: under src*dst a white fragment leaves the paper untouched,
  // and alpha does nothing at all. Fading with alpha here would simply stop
  // the settle from happening.
  vec3 ink = mix(FIELD, STATUTE, vMarked);
  outColour = vec4(mix(vec3(1.0), ink, vAlpha), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader alloc failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(String(log));
  }
  return shader;
}

/**
 * Build the scene, or return null if this browser cannot draw it.
 *
 * Null rather than a throw, because the caller's answer to "no WebGL" is to
 * render the static figure, and that is a complete answer rather than a
 * degraded one.
 */
export function createScene(
  canvas: HTMLCanvasElement,
  registers: Register[],
): Scene | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  let program: WebGLProgram | null = null;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  } catch {
    return null;
  }

  const total = registers.reduce((n, r) => n + r.count, 0);
  const finals = new Float32Array(total * 2);
  const seeds = new Float32Array(total);
  const marked = new Float32Array(total);

  // A stable pseudo-random, so the stagger is identical on every load and on
  // every machine. Math.random would make a figure about a fixed dataset look
  // different each time it was looked at.
  let state = 0x2f6e2b1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };

  let cell = 4;

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    cell = w / COLUMNS;

    const rows = registers.map((r) => Math.ceil(r.count / COLUMNS));
    const totalRows = rows.reduce((a, b) => a + b, 0);
    const gaps = (registers.length - 1) * BAND_GAP * h;
    const rowHeight = Math.max((h - gaps) / totalRows, 1);

    let cursor = 0;
    let top = 0;
    registers.forEach((register, band) => {
      const markSet = new Set(register.marks);
      for (let i = 0; i < register.count; i += 1) {
        const at = cursor + i;
        finals[at * 2] = (i % COLUMNS) * cell + cell * 0.5;
        finals[at * 2 + 1] = top + Math.floor(i / COLUMNS) * rowHeight + rowHeight * 0.5;
        marked[at] = markSet.has(i) ? 1 : 0;
      }
      cursor += register.count;
      top += rows[band] * rowHeight + BAND_GAP * h;
    });
  }

  for (let i = 0; i < total; i += 1) seeds[i] = rand();
  layout();

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const buffers: WebGLBuffer[] = [];
  const bind = (name: string, data: Float32Array, size: number) => {
    const buffer = gl.createBuffer();
    if (!buffer || !program) return null;
    buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return buffer;
  };

  const finalBuffer = bind("aFinal", finals, 2);
  bind("aSeed", seeds, 1);
  bind("aMarked", marked, 1);

  gl.useProgram(program);
  const uRes = gl.getUniformLocation(program, "uRes");
  const uPhase = gl.getUniformLocation(program, "uPhase");
  const uDpr = gl.getUniformLocation(program, "uDpr");
  const uCell = gl.getUniformLocation(program, "uCell");

  gl.enable(gl.BLEND);
  // Two impressions on paper multiply. Where records overlap, the result is
  // the product of the inks rather than the topmost one winning, which is the
  // same arithmetic that makes `agreed` = books x statute in the palette.
  // Concretely: the ten invoices booked twice occupy adjacent rows, and at
  // settle the marks are wider than the pitch, so a duplicate prints denser
  // than a single defect. The picture states which defects are doublings
  // without being told to.
  gl.blendFunc(gl.DST_COLOR, gl.ZERO);

  return {
    draw(phase: number) {
      const dpr = window.devicePixelRatio || 1;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uRes, canvas.width / dpr, canvas.height / dpr);
      gl.uniform1f(uPhase, phase);
      gl.uniform1f(uDpr, dpr);
      gl.uniform1f(uCell, cell * 0.72);
      gl.drawArrays(gl.POINTS, 0, total);
    },
    resize() {
      layout();
      if (finalBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, finalBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, finals);
      }
    },
    destroy() {
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
    },
  };
}
